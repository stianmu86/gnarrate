/**
 * Narrate — process-content Edge Function
 *
 * Accepts a URL, raw text, or (future) PDF.
 * 1. Scrapes & extracts clean text via Readability (for URLs)
 * 2. Runs pre-flight credit guard
 * 3. Checks deduplication (content_hash)
 * 4. Creates narration row with content_raw, status = 'pending'
 * 5. Calls Modal analyze-text endpoint
 *
 * POST /functions/v1/process-content
 * Body: { source_type: 'url' | 'text', url?: string, text?: string, voice_id: string }
 * Auth: Bearer token (user JWT)
 */

import { createServiceClient } from '../_shared/supabase-client.ts';
import { corsHeaders } from '../_shared/cors.ts';
import { DOMParser } from 'https://esm.sh/linkedom@0.16.11';
import { Readability } from 'https://esm.sh/@mozilla/readability@0.5.0';
import { createHash } from 'https://deno.land/std@0.208.0/crypto/mod.ts';

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

    const body = await req.json();
    const { source_type, url, text, voice_id } = body;

    // Validate input
    if (!source_type || !voice_id) {
      return jsonError('INVALID_INPUT', 'source_type and voice_id are required', 400);
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

    } else {
      return jsonError('INVALID_INPUT', `Unsupported source_type: ${source_type}`, 400);
    }

    // ---------------------------------------------------------------
    // 2. Validate content length
    // ---------------------------------------------------------------
    if (content_raw.length > MAX_CHARACTERS) {
      return jsonError('CONTENT_TOO_LONG', `Content exceeds ${MAX_CHARACTERS} character limit`, 413);
    }

    const word_count = content_raw.split(/\s+/).filter(Boolean).length;

    // ---------------------------------------------------------------
    // 3. Deduplication check (SHA-256 hash)
    // ---------------------------------------------------------------
    const encoder = new TextEncoder();
    const hashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(content_raw));
    const content_hash = Array.from(new Uint8Array(hashBuffer))
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
    // 5. Create narration row
    // ---------------------------------------------------------------
    const { data: narration, error: narrationError } = await supabase
      .from('narrations')
      .insert({
        user_id: user.id,
        voice_id,
        title,
        author,
        content_raw,
        source_type,
        source_url,
        word_count,
        content_hash,
        status: 'pending',
      })
      .select('id')
      .single();

    if (narrationError) throw narrationError;

    // ---------------------------------------------------------------
    // 6. Trigger Modal analyze-text endpoint (async, fire-and-forget)
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
          content_raw,
          voice_id,
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
