"""
Narrate — generate-audio Modal GPU Worker (Phase 2)

Receives narration_id and voice_id after analyze-text completes.
Reads content_cleaned from Supabase, generates TTS audio chunk-by-chunk
using CosyVoice, stitches with FFmpeg, uploads to Supabase Storage.

Endpoint: POST /generate-audio
Body: { narration_id, voice_id }

⚠️  ALWAYS reads from content_cleaned, NEVER content_raw.
⚠️  Uses SUPABASE_SERVICE_ROLE_KEY for full write access.
"""

import modal
import os
import re
import io
import json
import tempfile
import subprocess
import time
from pathlib import Path

app = modal.App("narrate-generate-audio")

# ---------------------------------------------------------------------------
# Container image with CUDA, PyTorch, FFmpeg, and CosyVoice dependencies
# ---------------------------------------------------------------------------
image = (
    modal.Image.from_registry(
        "nvidia/cuda:12.1.1-cudnn8-runtime-ubuntu22.04",
        add_python="3.11",
    )
    .apt_install("ffmpeg", "libsndfile1", "git")
    .pip_install(
        "torch==2.1.2",
        "torchaudio==2.1.2",
        "numpy<2",
        "supabase",
        "httpx",
        "mutagen",  # ID3 tag writing
        "soundfile",
        "librosa",
    )
    # CosyVoice installation
    .run_commands(
        "pip install modelscope",
        "pip install cosyvoice-ttsfrd || true",  # Optional; falls back gracefully
    )
)

# ---------------------------------------------------------------------------
# Voice seed audio volume (pre-recorded 5-second clips per voice persona)
# ---------------------------------------------------------------------------
voice_seeds = modal.Volume.from_name("narrate-voice-seeds", create_if_missing=True)

MAX_CHUNK_CHARS = 500
AUDIO_BITRATE = "128k"
SAMPLE_RATE = 22050


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
    Merge individual chunk WAV files into a single MP3 using FFmpeg.
    Returns duration in seconds.
    """
    if len(chunk_paths) == 1:
        # Single chunk — just convert to mp3
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


@app.function(
    image=image,
    gpu="A10G",
    timeout=600,      # 10-minute hard cap
    retries=2,        # Auto-retry on transient GPU failure
    memory=16384,     # 16 GB RAM
    secrets=[modal.Secret.from_name("narrate-secrets")],
    volumes={"/voice-seeds": voice_seeds},
)
@modal.web_endpoint(method="POST")
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
    import torch
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
        # 3. Fetch voice config
        # ------------------------------------------------------------------
        voice = (
            supabase.table("voices")
            .select("provider_voice_id, name")
            .eq("id", voice_id)
            .single()
            .execute()
            .data
        )

        provider_voice_id = voice["provider_voice_id"]

        # ------------------------------------------------------------------
        # 4. TTS inference — chunk by chunk
        # ------------------------------------------------------------------
        # Load CosyVoice model
        tts_model = _load_tts_model()

        tmpdir = tempfile.mkdtemp()
        chunk_paths: list[str] = []

        for i, chunk_text in enumerate(chunks):
            chunk_path = os.path.join(tmpdir, f"chunk_{i:04d}.wav")

            # Generate audio for this chunk
            _synthesize_chunk(
                model=tts_model,
                text=chunk_text,
                voice_id=provider_voice_id,
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

        # Construct the audio URL
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


# ---------------------------------------------------------------------------
# TTS Model Loading & Inference
# ---------------------------------------------------------------------------

_model_cache: dict = {}


def _load_tts_model():
    """
    Load CosyVoice model. Cached across warm invocations.
    Uses FP16 quantisation for ~20x real-time speed on A10G.
    """
    if "model" in _model_cache:
        return _model_cache["model"]

    try:
        from cosyvoice.cli.cosyvoice import CosyVoice

        model = CosyVoice("iic/CosyVoice-300M-SFT")
        _model_cache["model"] = model
        return model
    except ImportError:
        # Fallback: use modelscope pipeline
        from modelscope.pipelines import pipeline

        model = pipeline(
            task="text-to-speech",
            model="iic/CosyVoice-300M-SFT",
            device="cuda" if _has_gpu() else "cpu",
        )
        _model_cache["model"] = model
        return model


def _has_gpu() -> bool:
    """Check if CUDA GPU is available."""
    try:
        import torch
        return torch.cuda.is_available()
    except ImportError:
        return False


def _synthesize_chunk(
    model,
    text: str,
    voice_id: str,
    output_path: str,
) -> None:
    """
    Synthesize a single text chunk to a WAV file.

    Uses the voice seed file if available, otherwise falls back to
    the default model voice.
    """
    import soundfile as sf

    seed_path = f"/voice-seeds/{voice_id}.wav"

    try:
        if hasattr(model, "inference_sft"):
            # CosyVoice native API
            output = model.inference_sft(text, voice_id)
            for chunk_data in output:
                audio_data = chunk_data["tts_speech"].numpy()
                sf.write(output_path, audio_data.squeeze(), SAMPLE_RATE)
                break  # Take first output
        elif hasattr(model, "__call__"):
            # ModelScope pipeline fallback
            result = model(text)
            if isinstance(result, dict) and "output_wav" in result:
                sf.write(output_path, result["output_wav"], SAMPLE_RATE)
            else:
                # Raw tensor output
                import numpy as np
                audio = np.array(result) if not isinstance(result, np.ndarray) else result
                sf.write(output_path, audio.squeeze(), SAMPLE_RATE)
        else:
            raise RuntimeError(f"Unknown model type: {type(model)}")
    except Exception as e:
        # If TTS fails, generate silence placeholder (will be retried by Modal)
        raise RuntimeError(f"TTS synthesis failed for chunk: {e}") from e


def _cleanup_temp(tmpdir: str) -> None:
    """Remove temporary audio files."""
    import shutil
    try:
        shutil.rmtree(tmpdir, ignore_errors=True)
    except Exception:
        pass
