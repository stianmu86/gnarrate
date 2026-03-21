#!/usr/bin/env python3
"""
Local runner for analyze-text — bypasses Modal, runs directly.
Use this for development when Modal can't reach local Supabase.

Usage:
  python3 modal/run_local.py <narration_id> [voice_id]

This reads the narration's content_raw from the database,
sanitises it, detects chapters, counts chunks, and updates the row.
The narration status moves from 'pending' → 'processing' → 'completed' (minus audio).
"""
import sys
import os
import re
import json

from supabase import create_client


# --- Inlined from analyze_text.py (avoids Modal decorator import issues) ---

MAX_CHUNK_CHARS = 500

def sanitize_text(text: str) -> str:
    text = re.sub(r'https?://\S+', '', text)
    text = re.sub(r'\[\d+\]', '', text)
    ad_patterns = [
        r'(?i)advertisement\s*', r'(?i)sponsored\s+content\s*',
        r'(?i)click here to\s+', r'(?i)subscribe to our newsletter\s*',
        r'(?i)share this article\s*', r'(?i)follow us on\s+\w+\s*',
    ]
    for pattern in ad_patterns:
        text = re.sub(pattern, '', text)
    text = re.sub(r'\n{3,}', '\n\n', text)
    text = re.sub(r' {2,}', ' ', text)
    return text.strip()

def estimate_chapters(text: str) -> list:
    chapters = []
    lines = text.split('\n')
    char_pos = 0
    for line in lines:
        stripped = line.strip()
        if (stripped and len(stripped) < 80 and not stripped.endswith('.')
                and not stripped.endswith(',') and stripped[0].isupper()):
            chapters.append({"title": stripped, "start_char": char_pos})
        char_pos += len(line) + 1
    if not chapters:
        chapters = [{"title": "Full Text", "start_char": 0}]
    return chapters

def count_chunks(text: str) -> int:
    sentences = re.split(r'(?<=[.!?])\s+', text)
    chunks, current = [], ""
    for s in sentences:
        if len(current) + len(s) + 1 > MAX_CHUNK_CHARS:
            if current: chunks.append(current)
            current = s
        else:
            current = f"{current} {s}".strip() if current else s
    if current: chunks.append(current)
    return len(chunks) if chunks else 1

def generate_summary(text: str) -> str:
    sentences = re.split(r'(?<=[.!?])\s+', text[:1000])
    return sentences[0][:200] if sentences else text[:200]

SUPABASE_URL = os.environ.get("SUPABASE_URL", "http://127.0.0.1:54321")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY",
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU"
)


def process_narration(narration_id: str):
    """Run the full analyze-text pipeline locally."""
    sb = create_client(SUPABASE_URL, SUPABASE_KEY)

    # Fetch the narration
    result = sb.table("narrations").select("*").eq("id", narration_id).single().execute()
    narration = result.data

    if not narration:
        print(f"ERROR: Narration {narration_id} not found")
        sys.exit(1)

    print(f"Processing: {narration['title']}")
    print(f"Status: {narration['status']}")
    print(f"Word count: {narration['word_count']}")

    # Update status to processing
    sb.table("narrations").update({"status": "processing"}).eq("id", narration_id).execute()
    print("→ Status set to 'processing'")

    # Sanitise
    content_raw = narration["content_raw"]
    content_cleaned = sanitize_text(content_raw)
    print(f"→ Sanitised: {len(content_raw)} → {len(content_cleaned)} chars")

    # Chapters
    chapters = estimate_chapters(content_cleaned)
    print(f"→ Detected {len(chapters)} chapter(s)")

    # Count chunks
    total_chunks = count_chunks(content_cleaned)
    print(f"→ Total chunks: {total_chunks}")

    # Summary
    summary = generate_summary(content_cleaned)
    print(f"→ Summary: {summary[:80]}...")

    # Update the narration row
    sb.table("narrations").update({
        "content_cleaned": content_cleaned,
        "chapters": chapters,
        "total_chunks": total_chunks,
        "completed_chunks": total_chunks,  # Mark all chunks as done (no TTS yet)
        "status": "completed",
        "duration_seconds": int(narration["word_count"] / 150 * 60) if narration["word_count"] else 60,
    }).eq("id", narration_id).execute()

    print(f"✓ Narration '{narration['title']}' processed and set to 'completed'")


def process_all_pending():
    """Process all pending narrations."""
    sb = create_client(SUPABASE_URL, SUPABASE_KEY)
    result = sb.table("narrations").select("id, title").eq("status", "pending").execute()

    if not result.data:
        print("No pending narrations found.")
        return

    print(f"Found {len(result.data)} pending narration(s)")
    for n in result.data:
        print(f"\n--- {n['title']} ---")
        process_narration(n["id"])


if __name__ == "__main__":
    if len(sys.argv) > 1:
        narration_id = sys.argv[1]
        if narration_id == "--all":
            process_all_pending()
        else:
            process_narration(narration_id)
    else:
        print("Usage:")
        print("  python3 modal/run_local.py <narration_id>  # Process one")
        print("  python3 modal/run_local.py --all           # Process all pending")
        sys.exit(1)
