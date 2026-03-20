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
    .pip_install("supabase", "httpx")
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
    retries=1,
)
@modal.web_endpoint(method="POST")
def analyze_text(item: dict) -> dict:
    """
    Main endpoint. Receives { narration_id, content_raw, voice_id }.
    Processes text and updates the narrations row.
    """
    narration_id = item["narration_id"]
    content_raw = item["content_raw"]
    voice_id = item["voice_id"]

    supabase_url = os.environ["SUPABASE_URL"]
    supabase_key = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
    supabase = create_client(supabase_url, supabase_key)

    try:
        # Update status to processing
        supabase.table("narrations").update({
            "status": "processing"
        }).eq("id", narration_id).execute()

        # Task 3: Sanitise → content_cleaned
        content_cleaned = sanitize_text(content_raw)

        # Task 1: Chaptering
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
        modal_narrate_endpoint = os.environ.get("MODAL_NARRATE_ENDPOINT")
        if modal_narrate_endpoint:
            import httpx
            httpx.post(
                modal_narrate_endpoint,
                json={
                    "narration_id": narration_id,
                    "voice_id": voice_id,
                },
                timeout=5.0,
            )

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
