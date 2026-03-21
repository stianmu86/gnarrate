"""
Narrate — generate-audio Modal Worker (Phase 2)

Receives narration_id and voice_id after analyze-text completes.
Reads content_cleaned from Supabase, generates TTS audio chunk-by-chunk
using edge-tts (Microsoft Edge TTS), stitches with FFmpeg, uploads to
Supabase Storage.

MVP uses edge-tts for reliable, high-quality TTS without GPU.
Production will swap in CosyVoice on A10G for custom voice cloning.

Endpoint: POST /generate-audio
Body: { narration_id, voice_id }

⚠️  ALWAYS reads from content_cleaned, NEVER content_raw.
⚠️  Uses SUPABASE_SERVICE_ROLE_KEY for full write access.
"""

from __future__ import annotations

import modal
import os
import re
import io
import json
import tempfile
import subprocess
import asyncio
from pathlib import Path

app = modal.App("narrate-generate-audio")

# ---------------------------------------------------------------------------
# Container image — lightweight (no GPU needed for edge-tts MVP)
# ---------------------------------------------------------------------------
image = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install("ffmpeg")
    .pip_install(
        "edge-tts",       # Microsoft Edge TTS (high quality, free)
        "supabase",
        "httpx",
        "mutagen",        # ID3 tag writing
        "fastapi",
    )
)

# ---------------------------------------------------------------------------
# Voice mapping: our voice IDs → edge-tts voice names
# ---------------------------------------------------------------------------
VOICE_MAP = {
    # Default mappings for our 6 seed voices
    "The Neutral": "en-US-AriaNeural",
    "Warm": "en-US-JennyNeural",
    "Smooth": "en-US-GuyNeural",
    "Deep": "en-GB-RyanNeural",
    "Storyteller": "en-US-DavisNeural",
    "Resonant Male": "en-GB-ThomasNeural",
}

# Fallback voice
DEFAULT_VOICE = "en-US-AriaNeural"

MAX_CHUNK_CHARS = 500
AUDIO_BITRATE = "128k"
SAMPLE_RATE = 24000  # edge-tts outputs 24kHz


def split_into_chunks(text: str, max_chars: int = MAX_CHUNK_CHARS) -> list[str]:
    """
    Split content_cleaned into chunks by sentence boundary.
    Max max_chars per chunk. Never split mid-sentence.
    """
    sentences = re.split(r'(?<=[.!?])\s+', text)
    chunks: list[str] = []
    current = ""

    for sentence in sentences:
        # If a single sentence exceeds max, split at clause boundaries
        if len(sentence) > max_chars:
            if current:
                chunks.append(current.strip())
                current = ""
            # Split long sentence at commas or semicolons
            parts = re.split(r'(?<=[,;])\s+', sentence)
            for part in parts:
                if len(current) + len(part) + 1 > max_chars:
                    if current:
                        chunks.append(current.strip())
                    current = part
                else:
                    current = f"{current} {part}".strip() if current else part
        elif len(current) + len(sentence) + 1 > max_chars:
            if current:
                chunks.append(current.strip())
            current = sentence
        else:
            current = f"{current} {sentence}".strip() if current else sentence

    if current.strip():
        chunks.append(current.strip())

    return chunks if chunks else [text]


def stitch_audio_files(chunk_paths: list[str], output_path: str) -> float:
    """
    Merge individual chunk MP3 files into a single MP3 using FFmpeg.
    Returns duration in seconds.
    """
    if len(chunk_paths) == 1:
        # Single chunk — just copy/re-encode to consistent format
        subprocess.run(
            [
                "ffmpeg", "-y",
                "-i", chunk_paths[0],
                "-codec:a", "libmp3lame",
                "-b:a", AUDIO_BITRATE,
                "-ar", str(SAMPLE_RATE),
                output_path,
            ],
            check=True,
            capture_output=True,
        )
    else:
        # Create concat list file
        list_path = output_path + ".list.txt"
        with open(list_path, "w") as f:
            for p in chunk_paths:
                f.write(f"file '{p}'\n")

        subprocess.run(
            [
                "ffmpeg", "-y",
                "-f", "concat",
                "-safe", "0",
                "-i", list_path,
                "-codec:a", "libmp3lame",
                "-b:a", AUDIO_BITRATE,
                "-ar", str(SAMPLE_RATE),
                output_path,
            ],
            check=True,
            capture_output=True,
        )
        os.unlink(list_path)

    # Get duration using ffprobe
    result = subprocess.run(
        [
            "ffprobe", "-v", "quiet",
            "-show_entries", "format=duration",
            "-of", "csv=p=0",
            output_path,
        ],
        capture_output=True,
        text=True,
    )
    return float(result.stdout.strip())


def write_id3_tags(mp3_path: str, title: str, artist: str | None = None):
    """
    Inject ID3 tags for native car/watch player support.
    """
    from mutagen.mp3 import MP3
    from mutagen.id3 import ID3, TIT2, TPE1, TALB

    audio = MP3(mp3_path, ID3=ID3)
    try:
        audio.add_tags()
    except Exception:
        pass  # Tags may already exist

    audio.tags.add(TIT2(encoding=3, text=title))
    if artist:
        audio.tags.add(TPE1(encoding=3, text=artist))
    audio.tags.add(TALB(encoding=3, text="Narrate"))
    audio.save()


async def _synthesize_chunk_async(
    text: str,
    voice: str,
    output_path: str,
) -> None:
    """
    Synthesize a single text chunk to an MP3 file using edge-tts.
    """
    import edge_tts

    communicate = edge_tts.Communicate(text, voice)
    await communicate.save(output_path)


def synthesize_chunk(text: str, voice: str, output_path: str) -> None:
    """Sync wrapper for async edge-tts synthesis."""
    asyncio.run(_synthesize_chunk_async(text, voice, output_path))


@app.function(
    image=image,
    timeout=600,      # 10-minute hard cap
    memory=2048,      # 2 GB RAM (no GPU needed for edge-tts)
    secrets=[modal.Secret.from_name("narrate-secrets")],
)
@modal.fastapi_endpoint(method="POST")
def generate_audio(item: dict) -> dict:
    """
    Main TTS generation endpoint.

    Receives { narration_id, voice_id }.
    1. Reads content_cleaned from Supabase (NEVER content_raw)
    2. Splits into chunks
    3. Runs TTS inference per chunk, incrementing completed_chunks
    4. Stitches with FFmpeg → .mp3 128kbps
    5. Writes ID3 tags
    6. Uploads to Supabase Storage audio bucket
    7. Updates narrations row: status=completed, audio_url, duration_seconds
    """
    from supabase import create_client

    narration_id = item["narration_id"]
    voice_id = item["voice_id"]

    supabase_url = os.environ["SUPABASE_URL"]
    supabase_key = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
    supabase = create_client(supabase_url, supabase_key)

    try:
        # ------------------------------------------------------------------
        # 1. Fetch narration data — ALWAYS use content_cleaned
        # ------------------------------------------------------------------
        narration = (
            supabase.table("narrations")
            .select("content_cleaned, title, author, user_id, total_chunks")
            .eq("id", narration_id)
            .single()
            .execute()
            .data
        )

        if not narration or not narration.get("content_cleaned"):
            raise ValueError(
                f"No content_cleaned found for narration {narration_id}. "
                "TTS must ALWAYS read from content_cleaned, never content_raw."
            )

        content = narration["content_cleaned"]
        title = narration["title"]
        author = narration.get("author")
        user_id = narration["user_id"]

        # ------------------------------------------------------------------
        # 2. Split into chunks
        # ------------------------------------------------------------------
        chunks = split_into_chunks(content)
        total_chunks = len(chunks)

        # Update total_chunks if it changed (may differ from analyze-text estimate)
        supabase.table("narrations").update({
            "total_chunks": total_chunks,
            "status": "processing",
        }).eq("id", narration_id).execute()

        # ------------------------------------------------------------------
        # 3. Fetch voice config — map to edge-tts voice name
        # ------------------------------------------------------------------
        voice = (
            supabase.table("voices")
            .select("provider_voice_id, name")
            .eq("id", voice_id)
            .single()
            .execute()
            .data
        )

        # Use voice name to look up edge-tts voice, fallback to default
        voice_name = voice.get("name", "")
        edge_voice = VOICE_MAP.get(voice_name, DEFAULT_VOICE)
        print(f"Using edge-tts voice: {edge_voice} (for '{voice_name}')")

        # ------------------------------------------------------------------
        # 4. TTS inference — chunk by chunk
        # ------------------------------------------------------------------
        tmpdir = tempfile.mkdtemp()
        chunk_paths: list[str] = []

        for i, chunk_text in enumerate(chunks):
            chunk_path = os.path.join(tmpdir, f"chunk_{i:04d}.mp3")

            # Generate audio for this chunk
            synthesize_chunk(
                text=chunk_text,
                voice=edge_voice,
                output_path=chunk_path,
            )

            chunk_paths.append(chunk_path)

            # Increment completed_chunks after each successful chunk
            supabase.table("narrations").update({
                "completed_chunks": i + 1,
            }).eq("id", narration_id).execute()

        # ------------------------------------------------------------------
        # 5. Stitch chunks → MP3
        # ------------------------------------------------------------------
        mp3_path = os.path.join(tmpdir, f"{narration_id}.mp3")
        duration_seconds = stitch_audio_files(chunk_paths, mp3_path)

        # ------------------------------------------------------------------
        # 6. Write ID3 tags
        # ------------------------------------------------------------------
        write_id3_tags(mp3_path, title=title, artist=author)

        # ------------------------------------------------------------------
        # 7. Upload to Supabase Storage
        # ------------------------------------------------------------------
        storage_path = f"{user_id}/{narration_id}.mp3"

        with open(mp3_path, "rb") as f:
            supabase.storage.from_("audio").upload(
                path=storage_path,
                file=f.read(),
                file_options={"content-type": "audio/mpeg"},
            )

        # Construct the audio URL (public URL for authenticated access)
        audio_url = f"{supabase_url}/storage/v1/object/audio/{storage_path}"

        # ------------------------------------------------------------------
        # 8. Update narrations row — COMPLETED
        # ------------------------------------------------------------------
        supabase.table("narrations").update({
            "status": "completed",
            "audio_url": audio_url,
            "duration_seconds": int(duration_seconds),
            "completed_chunks": total_chunks,
        }).eq("id", narration_id).execute()

        # Cleanup temp files
        _cleanup_temp(tmpdir)

        return {
            "status": "completed",
            "narration_id": narration_id,
            "duration_seconds": int(duration_seconds),
            "total_chunks": total_chunks,
            "audio_url": audio_url,
        }

    except Exception as e:
        # ------------------------------------------------------------------
        # FAILURE: log error, update status, refund credits
        # ------------------------------------------------------------------
        error_detail = str(e)
        print(f"generate-audio FAILED for {narration_id}: {error_detail}")

        # Log to narration_errors
        supabase.table("narration_errors").insert({
            "narration_id": narration_id,
            "error_code": "TTS_GENERATION_FAILED",
            "error_detail": error_detail[:2000],
        }).execute()

        # Update status to failed
        supabase.table("narrations").update({
            "status": "failed",
        }).eq("id", narration_id).execute()

        # Refund credits — look up the cost from credit_transactions
        try:
            tx = (
                supabase.table("credit_transactions")
                .select("delta_seconds, user_id")
                .like("reason", f"narration:%")
                .eq("user_id", narration["user_id"])
                .order("created_at", desc=True)
                .limit(1)
                .single()
                .execute()
                .data
            )
            if tx and tx["delta_seconds"] < 0:
                supabase.rpc("refund_credits", {
                    "p_user_id": tx["user_id"],
                    "p_cost_seconds": abs(tx["delta_seconds"]),
                    "p_reason": f"tts_failed:{narration_id}",
                }).execute()
        except Exception as refund_err:
            print(f"Refund failed for {narration_id}: {refund_err}")

        return {
            "status": "failed",
            "narration_id": narration_id,
            "error": error_detail[:500],
        }


def _cleanup_temp(tmpdir: str) -> None:
    """Remove temporary audio files."""
    import shutil
    try:
        shutil.rmtree(tmpdir, ignore_errors=True)
    except Exception:
        pass
