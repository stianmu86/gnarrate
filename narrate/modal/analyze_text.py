"""
Narrate — analyze-text Modal Function (Phase 1.3)

Receives content_raw from the process-content Edge Function.
Uses Llama 3.1 to:
  1. Chapter detection — JSON array of { title, start_char }
  2. Metadata — 1-sentence summary
  3. Sanitisation — strip URLs, footnote markers, ad fragments → content_cleaned
  4. Set total_chunks on the narrations row

Endpoint: POST /analyze-text
Body: { narration_id, content_raw, voice_id }
Auth: Bearer modal API key
"""

import modal
import os
import re
import json
import math
from supabase import create_client

app = modal.App("narrate-analyze-text")

image = (
    modal.Image.debian_slim(python_version="3.11")
    .pip_install("supabase", "httpx", "fastapi", "pymupdf")
)

MAX_CHUNK_CHARS = 500


def sanitize_text(text: str) -> str:
    """
    Strip non-narratable content from raw text:
    - URLs
    - Footnote markers [1], [2], etc.
    - Common ad fragments
    - Excessive whitespace
    """
    # Remove URLs
    text = re.sub(r'https?://\S+', '', text)
    # Remove footnote markers like [1], [2], [12]
    text = re.sub(r'\[\d+\]', '', text)
    # Remove common ad/tracking fragments
    ad_patterns = [
        r'(?i)advertisement\s*',
        r'(?i)sponsored\s+content\s*',
        r'(?i)click here to\s+',
        r'(?i)subscribe to our newsletter\s*',
        r'(?i)share this article\s*',
        r'(?i)follow us on\s+\w+\s*',
    ]
    for pattern in ad_patterns:
        text = re.sub(pattern, '', text)
    # Collapse multiple whitespace/newlines
    text = re.sub(r'\n{3,}', '\n\n', text)
    text = re.sub(r' {2,}', ' ', text)
    return text.strip()


def extract_pdf_text_and_chapters(pdf_bytes: bytes) -> tuple:
    """
    Extract text and structural chapters from a PDF using PyMuPDF.
    Returns (full_text, chapters, page_count) where chapters have start_char positions.

    Chapter detection priority:
    1. PDF Table of Contents / Bookmarks (highest quality)
    2. Font-size-based heading detection (fallback)
    3. No chapters found → returns single "Full Text" chapter
    """
    import fitz  # PyMuPDF

    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    page_count = doc.page_count

    if page_count > 200:
        doc.close()
        raise ValueError(f"PDF has {page_count} pages (maximum is 200)")

    # Extract text page by page, tracking character offsets
    full_text = ""
    page_char_offsets = []  # [(page_num, start_char)]

    for page_num in range(page_count):
        page = doc[page_num]
        page_char_offsets.append((page_num, len(full_text)))
        page_text = page.get_text("text")
        full_text += page_text + "\n\n"

    # Check for scanned/image-only PDF
    if len(full_text.strip()) < 100 and page_count > 0:
        doc.close()
        raise ValueError("This PDF contains no extractable text. It may be a scanned document.")

    # Check character limit
    if len(full_text) > 150000:
        doc.close()
        raise ValueError(f"PDF content exceeds 150,000 character limit ({len(full_text)} chars)")

    chapters = []

    # Strategy A: Try PDF Table of Contents / Bookmarks
    toc = doc.get_toc()
    if toc:
        for level, title, page_num in toc:
            if level <= 2:  # Only top 2 heading levels
                # Map page number to character offset
                idx = min(page_num - 1, len(page_char_offsets) - 1)
                idx = max(0, idx)
                char_offset = page_char_offsets[idx][1] if page_char_offsets else 0
                chapters.append({"title": title.strip(), "start_char": char_offset})

    # Strategy B: Font-size-based heading detection
    if not chapters:
        chapters = _detect_headings_by_font(doc, page_char_offsets)

    # Fallback: single chapter
    if not chapters:
        chapters = [{"title": "Full Text", "start_char": 0}]

    doc.close()
    return full_text, chapters, page_count


def _detect_headings_by_font(doc, page_char_offsets: list) -> list:
    """
    Detect headings by analyzing font sizes across the document.
    Headings are text blocks with font size significantly larger than the median body text.
    """
    import fitz  # PyMuPDF

    # Collect all font sizes to compute median
    all_sizes = []
    for page in doc:
        blocks = page.get_text("dict")["blocks"]
        for block in blocks:
            if "lines" not in block:
                continue
            for line in block["lines"]:
                for span in line["spans"]:
                    if span["text"].strip():
                        all_sizes.append(span["size"])

    if not all_sizes:
        return []

    # Compute median font size
    sorted_sizes = sorted(all_sizes)
    median_size = sorted_sizes[len(sorted_sizes) // 2]
    heading_threshold = median_size * 1.3  # 30% larger than median

    chapters = []

    for page_num in range(doc.page_count):
        page = doc[page_num]
        page_start_char = page_char_offsets[page_num][1] if page_num < len(page_char_offsets) else 0

        blocks = page.get_text("dict")["blocks"]
        block_char_offset = 0

        for block in blocks:
            if "lines" not in block:
                continue

            block_text = ""
            max_font_size = 0
            is_bold = False

            for line in block["lines"]:
                for span in line["spans"]:
                    block_text += span["text"]
                    max_font_size = max(max_font_size, span["size"])
                    if "bold" in span["font"].lower() or (span.get("flags", 0) & 2 ** 4):
                        is_bold = True

            block_text = block_text.strip()

            # Heading criteria: larger font, short text, doesn't end with period
            if (
                block_text
                and len(block_text) < 100
                and max_font_size >= heading_threshold
                and not block_text.endswith('.')
                and not block_text.endswith(',')
            ):
                chapters.append({
                    "title": block_text,
                    "start_char": page_start_char + block_char_offset,
                })

            block_char_offset += len(block_text) + 2  # approximate offset

    return chapters


def estimate_chapters(text: str) -> list[dict]:
    """
    Basic chapter detection based on paragraph structure.
    In production, this would use Llama 3.1 for smarter detection.
    Returns: [{ "title": str, "start_char": int }]
    """
    chapters = []
    lines = text.split('\n')
    char_pos = 0

    for line in lines:
        stripped = line.strip()
        # Heuristic: short lines (< 80 chars) that look like headings
        if (
            stripped
            and len(stripped) < 80
            and not stripped.endswith('.')
            and not stripped.endswith(',')
            and stripped[0].isupper()
        ):
            chapters.append({
                "title": stripped,
                "start_char": char_pos,
            })
        char_pos += len(line) + 1  # +1 for newline

    # If no chapters detected, create a single chapter
    if not chapters:
        chapters = [{"title": "Full Text", "start_char": 0}]

    return chapters


def generate_summary(text: str) -> str:
    """
    Generate a 1-sentence summary.
    In production, this would use Llama 3.1.
    """
    # Simple fallback: first sentence
    sentences = re.split(r'(?<=[.!?])\s+', text[:1000])
    if sentences:
        return sentences[0][:200]
    return text[:200]


def count_chunks(text: str) -> int:
    """
    Split text by sentences, max MAX_CHUNK_CHARS per chunk.
    Returns the total number of chunks.
    """
    sentences = re.split(r'(?<=[.!?])\s+', text)
    chunks = []
    current_chunk = ""

    for sentence in sentences:
        if len(current_chunk) + len(sentence) + 1 > MAX_CHUNK_CHARS:
            if current_chunk:
                chunks.append(current_chunk)
            current_chunk = sentence
        else:
            current_chunk = f"{current_chunk} {sentence}".strip() if current_chunk else sentence

    if current_chunk:
        chunks.append(current_chunk)

    return len(chunks) if chunks else 1


@app.function(
    image=image,
    secrets=[modal.Secret.from_name("narrate-secrets")],
    timeout=120,
)
@modal.fastapi_endpoint(method="POST")
def analyze_text(item: dict) -> dict:
    """
    Main endpoint. Receives { narration_id, content_raw, voice_id, source_type?, pdf_storage_path? }.
    Processes text (or extracts from PDF) and updates the narrations row.
    """
    narration_id = item["narration_id"]
    content_raw = item.get("content_raw")  # May be None for PDFs
    voice_id = item["voice_id"]
    source_type = item.get("source_type", "text")
    pdf_storage_path = item.get("pdf_storage_path")

    supabase_url = os.environ["SUPABASE_URL"]
    supabase_key = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
    supabase = create_client(supabase_url, supabase_key)

    try:
        # Update status to processing
        supabase.table("narrations").update({
            "status": "processing"
        }).eq("id", narration_id).execute()

        # PDF extraction path
        if source_type == "pdf" and pdf_storage_path:
            # Download PDF from Supabase Storage
            pdf_bytes = supabase.storage.from_("pdfs").download(pdf_storage_path)

            # Extract text and structural chapters
            extracted_text, pdf_chapters, page_count = extract_pdf_text_and_chapters(pdf_bytes)

            content_raw = extracted_text
            content_cleaned = sanitize_text(content_raw)
            chapters = pdf_chapters

            # Update narration row with extracted content
            supabase.table("narrations").update({
                "content_raw": content_raw,
                "word_count": len(content_raw.split()),
                "pdf_page_count": page_count,
            }).eq("id", narration_id).execute()
        else:
            # Existing text/URL path
            content_cleaned = sanitize_text(content_raw)
            chapters = estimate_chapters(content_cleaned)

        # Task 2: Metadata (summary)
        summary = generate_summary(content_cleaned)

        # Task 4: Count chunks
        total_chunks = count_chunks(content_cleaned)

        # Update narrations row
        supabase.table("narrations").update({
            "content_cleaned": content_cleaned,
            "chapters": json.dumps(chapters),
            "total_chunks": total_chunks,
        }).eq("id", narration_id).execute()

        # Trigger TTS generation
        # Use httpx stream to fire the request without waiting for full response
        modal_narrate_endpoint = os.environ.get("MODAL_NARRATE_ENDPOINT")
        if modal_narrate_endpoint:
            import httpx
            try:
                # Send the POST — Modal queues the GPU job on receipt
                # We wait for the full response since the analyze-text
                # function has a 120s timeout and the GPU worker updates
                # status independently via Supabase
                resp = httpx.post(
                    modal_narrate_endpoint,
                    json={
                        "narration_id": narration_id,
                        "voice_id": voice_id,
                    },
                    timeout=httpx.Timeout(
                        connect=10.0,
                        read=5.0,   # Don't wait for GPU to finish
                        write=10.0,
                        pool=10.0,
                    ),
                )
                print(f"TTS trigger response: {resp.status_code}")
            except httpx.ReadTimeout:
                # Expected: request was sent, GPU is working
                print("TTS trigger sent (read timeout — GPU processing)")
            except Exception as e:
                print(f"TTS trigger error: {e}")

        return {
            "status": "ok",
            "narration_id": narration_id,
            "total_chunks": total_chunks,
            "chapters_count": len(chapters),
            "summary": summary,
        }

    except Exception as e:
        # Log error and update status
        supabase.table("narration_errors").insert({
            "narration_id": narration_id,
            "error_code": "ANALYZE_FAILED",
            "error_detail": str(e),
        }).execute()

        supabase.table("narrations").update({
            "status": "failed"
        }).eq("id", narration_id).execute()

        # Refund credits
        supabase.rpc("refund_credits", {
            "p_user_id": supabase.table("narrations")
                .select("user_id")
                .eq("id", narration_id)
                .single()
                .execute()
                .data["user_id"],
            "p_cost_seconds": 0,  # Will be calculated from transaction log
            "p_reason": f"analyze_failed:{narration_id}",
        }).execute()

        return {"status": "error", "error": str(e)}
