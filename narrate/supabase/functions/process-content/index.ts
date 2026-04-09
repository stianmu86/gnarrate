/**
 * Narrate — process-content Edge Function
 *
 * Accepts a URL, raw text, or PDF upload.
 * 1. Scrapes & extracts clean text (URLs), or validates PDF
 * 2. Validates content length, estimates word count
 * 3. Checks deduplication (content_hash) — skipped for PDFs
 * 4. Runs pre-flight credit guard
 * 5. Uploads PDF to storage (if applicable)
 * 6. Creates narration row with status = 'pending'
 * 7. Calls Modal analyze-text endpoint
 *
 * POST /functions/v1/process-content
 * Body (JSON): { source_type: 'url' | 'text', url?: string, text?: string, voice_id: string }
 * Body (multipart/form-data): file (PDF), source_type='pdf', voice_id
 * Auth: Bearer token (user JWT)
 */

import { createServiceClient } from '../_shared/supabase-client.ts';
import { corsHeaders } from '../_shared/cors.ts';
import { DOMParser } from 'https://deno.land/x/deno_dom@v0.1.45/deno-dom-wasm.ts';
import { Readability } from 'https://esm.sh/@mozilla/readability@0.5.0?bundle&no-dts&target=denonext';

const MAX_CHARACTERS = 150_000;

Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Authenticate user
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return jsonError('UNAUTHORIZED', 'Missing Authorization header', 401);
    }

    const supabase = createServiceClient();

    // Verify JWT and get user
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return jsonError('UNAUTHORIZED', 'Invalid token', 401);
    }

    // Detect content type (multipart for PDF, JSON for URL/text)
    const contentType = req.headers.get('Content-Type') || '';
    const isMultipart = contentType.includes('multipart/form-data');

    let source_type: string;
    let url: string | undefined;
    let text: string | undefined;
    let voice_id: string;
    let pdfFile: File | null = null;

    if (isMultipart) {
      const formData = await req.formData();
      pdfFile = formData.get('file') as File | null;
      source_type = (formData.get('source_type') as string) || 'pdf';
      voice_id = (formData.get('voice_id') as string) || '';
      console.log('Multipart parsed:', { source_type, voice_id: voice_id ? 'present' : 'EMPTY', hasFile: !!pdfFile });
    } else {
      const body = await req.json();
      source_type = body.source_type;
      url = body.url;
      text = body.text;
      voice_id = body.voice_id;
    }

    // Validate input
    if (!source_type || !voice_id) {
      console.error('Validation failed:', { source_type, voice_id, isMultipart });
      return jsonError('INVALID_INPUT', `source_type and voice_id are required (got source_type=${source_type || 'empty'}, voice_id=${voice_id ? 'present' : 'empty'})`, 400);
    }

    // ---------------------------------------------------------------
    // 1. Extract content
    // ---------------------------------------------------------------
    let content_raw: string;
    let title: string;
    let author: string | null = null;
    let source_url: string | null = null;

    if (source_type === 'url') {
      if (!url) return jsonError('INVALID_INPUT', 'url is required for source_type=url', 400);
      source_url = url;

      const fetched = await fetch(url, {
        headers: { 'User-Agent': 'Narrate/1.0 (personal audiobook reader)' },
      });

      if (!fetched.ok) {
        // Check for paywall indicators
        if (fetched.status === 402 || fetched.status === 403) {
          return jsonError('PAYWALL_DETECTED', 'We couldn\'t access this article.', 403);
        }
        return jsonError('FETCH_FAILED', `Failed to fetch URL: ${fetched.status}`, 502);
      }

      const html = await fetched.text();

      // Check for common paywall patterns in the HTML
      const paywallPatterns = [
        'paywall', 'subscribe to continue', 'premium content',
        'members only', 'sign up to read',
      ];
      const htmlLower = html.toLowerCase();
      const isPaywalled = paywallPatterns.some(p => htmlLower.includes(p))
        && html.length < 2000; // Short page + paywall words = likely paywalled

      if (isPaywalled) {
        return jsonError('PAYWALL_DETECTED', 'We couldn\'t access this article.', 403);
      }

      // Parse with Readability
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');
      const reader = new Readability(doc);
      const article = reader.parse();

      if (!article || !article.textContent?.trim()) {
        return jsonError('PARSE_FAILED', 'Could not extract readable content from this URL', 422);
      }

      content_raw = article.textContent;
      title = article.title || new URL(url).hostname;
      author = article.byline || null;

    } else if (source_type === 'text') {
      if (!text) return jsonError('INVALID_INPUT', 'text is required for source_type=text', 400);
      content_raw = text;
      title = text.substring(0, 60).split('\n')[0] || 'Untitled';
      author = null;

    } else if (source_type === 'pdf') {
      if (!pdfFile) return jsonError('INVALID_INPUT', 'PDF file is required', 400);

      // Validate MIME type
      if (pdfFile.type !== 'application/pdf') {
        return jsonError('INVALID_INPUT', 'File must be a PDF', 400);
      }

      // Validate file size (50MB max)
      const MAX_PDF_SIZE = 50 * 1024 * 1024;
      if (pdfFile.size > MAX_PDF_SIZE) {
        return jsonError('FILE_TOO_LARGE', 'PDF must be under 50MB', 413);
      }

      // Title from filename
      title = pdfFile.name?.replace(/\.pdf$/i, '') || 'Untitled PDF';
      author = null;
      source_url = null;

      // We don't have content_raw yet — Modal will extract it from the PDF
      // Estimate word count from file size for credit calculation (~250 words per page, ~3KB per page)
      content_raw = ''; // Will be filled by Modal

    } else {
      return jsonError('INVALID_INPUT', `Unsupported source_type: ${source_type}`, 400);
    }

    // ---------------------------------------------------------------
    // 2. Validate content length
    // ---------------------------------------------------------------
    if (source_type !== 'pdf' && content_raw.length > MAX_CHARACTERS) {
      return jsonError('CONTENT_TOO_LONG', `Content exceeds ${MAX_CHARACTERS} character limit`, 413);
    }

    // For PDFs, estimate from file size since we don't have text yet
    const word_count = source_type === 'pdf' && pdfFile
      ? Math.ceil((pdfFile.size / 3000) * 250)
      : content_raw.split(/\s+/).filter(Boolean).length;

    // ---------------------------------------------------------------
    // 3. Deduplication check (SHA-256 hash) — skip for PDFs
    // ---------------------------------------------------------------
    let content_hash: string | null = null;

    if (source_type !== 'pdf') {
      const encoder = new TextEncoder();
      const hashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(content_raw));
      content_hash = Array.from(new Uint8Array(hashBuffer))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');

      // Check if an identical narration already exists for this voice
      const { data: existingNarration } = await supabase
        .from('narrations')
        .select('id, audio_url, status')
        .eq('content_hash', content_hash)
        .eq('voice_id', voice_id)
        .eq('status', 'completed')
        .limit(1)
        .single();

      if (existingNarration?.audio_url) {
        // Deduplication hit — link user to existing audio at zero cost
        const { data: newNarration, error: insertError } = await supabase
          .from('narrations')
          .insert({
            user_id: user.id,
            voice_id,
            title,
            author,
            content_raw,
            source_type,
            source_url,
            audio_url: existingNarration.audio_url,
            word_count,
            content_hash,
            status: 'completed',
          })
          .select('id')
          .single();

        if (insertError) throw insertError;

        return jsonOk({ narration_id: newNarration.id, deduplicated: true });
      }
    }

    // ---------------------------------------------------------------
    // 4. Pre-flight credit guard
    // ---------------------------------------------------------------
    // Estimate cost: ceil((word_count / 150) * 60) seconds * voice cost_multiplier
    const { data: voice, error: voiceError } = await supabase
      .from('voices')
      .select('tier, cost_multiplier')
      .eq('id', voice_id)
      .single();

    if (voiceError || !voice) {
      return jsonError('INVALID_VOICE', 'Voice not found', 404);
    }

    // Check voice tier access
    const { data: userCredits } = await supabase
      .from('user_credits')
      .select('subscription_status, balance_seconds')
      .eq('user_id', user.id)
      .single();

    if (!userCredits) {
      return jsonError('NO_CREDITS', 'User credits not found', 500);
    }

    if (voice.tier === 'pro' && userCredits.subscription_status === 'free') {
      return jsonError('PRO_VOICE_REQUIRED', 'This voice is available on Pro.', 403);
    }

    const estimatedSeconds = Math.ceil((word_count / 150) * 60) * Number(voice.cost_multiplier);

    if (userCredits.balance_seconds < estimatedSeconds) {
      return jsonError('INSUFFICIENT_CREDITS', 'Not enough credits for this narration', 402);
    }

    // Deduct credits atomically
    const { data: deductResult } = await supabase.rpc('deduct_credits', {
      p_user_id: user.id,
      p_cost_seconds: estimatedSeconds,
      p_reason: `narration:${title.substring(0, 50)}`,
    });

    if (!deductResult) {
      return jsonError('INSUFFICIENT_CREDITS', 'Credit deduction failed (race condition guard)', 402);
    }

    // ---------------------------------------------------------------
    // 5. Upload PDF to storage (if applicable)
    // ---------------------------------------------------------------
    let pdf_storage_path: string | null = null;

    if (source_type === 'pdf' && pdfFile) {
      // Generate storage path
      pdf_storage_path = `${user.id}/${crypto.randomUUID()}.pdf`;

      // Upload PDF to storage
      const pdfBuffer = await pdfFile.arrayBuffer();
      const { error: uploadError } = await supabase.storage
        .from('pdfs')
        .upload(pdf_storage_path, pdfBuffer, {
          contentType: 'application/pdf',
        });

      if (uploadError) {
        return jsonError('UPLOAD_FAILED', 'Failed to upload PDF', 500);
      }
    }

    // ---------------------------------------------------------------
    // 6. Create narration row
    // ---------------------------------------------------------------
    const { data: narration, error: narrationError } = await supabase
      .from('narrations')
      .insert({
        user_id: user.id,
        voice_id,
        title,
        author,
        content_raw: source_type === 'pdf' ? null : content_raw,
        source_type,
        source_url,
        word_count,
        content_hash,
        pdf_storage_path,
        status: 'pending',
      })
      .select('id')
      .single();

    if (narrationError) throw narrationError;

    // ---------------------------------------------------------------
    // 7. Trigger Modal analyze-text endpoint (async, fire-and-forget)
    // ---------------------------------------------------------------
    const modalAnalyzeEndpoint = Deno.env.get('MODAL_ANALYZE_ENDPOINT');
    const modalApiKey = Deno.env.get('MODAL_API_KEY');

    if (modalAnalyzeEndpoint && modalApiKey) {
      // Fire and forget — don't await, let Modal process asynchronously
      fetch(modalAnalyzeEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${modalApiKey}`,
        },
        body: JSON.stringify({
          narration_id: narration.id,
          content_raw: source_type === 'pdf' ? null : content_raw,
          voice_id,
          source_type,
          pdf_storage_path,
        }),
      }).catch(err => {
        console.error('Failed to trigger analyze-text:', err);
      });
    }

    return jsonOk({
      narration_id: narration.id,
      estimated_seconds: estimatedSeconds,
      deduplicated: false,
    });

  } catch (err) {
    console.error('process-content error:', err);
    return jsonError('INTERNAL_ERROR', 'An unexpected error occurred', 500);
  }
});

// ---------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------

function jsonOk(data: Record<string, unknown>) {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function jsonError(code: string, message: string, status: number) {
  return new Response(JSON.stringify({ error: code, message }), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
