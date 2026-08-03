import base64
import os
import shutil
import tempfile
import modal

# ---------------------------------------------------------------------------
# Image definition
# We bake the Demucs model weights (htdemucs_6s, ~1 GB) into the image layer so
# they are cached once at build time and never re-downloaded on cold starts.
# ---------------------------------------------------------------------------

def _download_model():
    """
    Pre-download the htdemucs_6s model weights into the image layer.
    This function runs once at image build time (modal.Image.run_function).
    Subsequent container starts reuse the cached weights from the image.
    """
    import subprocess
    # Trigger a no-op demucs run on a silent 1-second audio file so that
    # demucs downloads + caches the htdemucs_6s checkpoint into the image.
    tmp = tempfile.mkdtemp()
    silent_wav = os.path.join(tmp, "silent.wav")
    out_dir = os.path.join(tmp, "out")
    # Generate a 1-second silent WAV (44100 Hz, mono)
    subprocess.run(
        ["ffmpeg", "-f", "lavfi", "-i", "anullsrc=r=44100:cl=mono",
         "-t", "1", "-ar", "44100", silent_wav],
        check=True, capture_output=True,
    )
    # Demucs will download the model and write a stub output — we don't care
    # about the output, only that the checkpoint is cached in ~/.cache/torch
    subprocess.run(
        ["demucs", "-n", "htdemucs_6s", "-o", out_dir, silent_wav],
        check=True, capture_output=True,
    )
    shutil.rmtree(tmp, ignore_errors=True)


demucs_image = (
    modal.Image.debian_slim()
    .apt_install("ffmpeg")
    .pip_install("demucs", "pycryptodome", "soundfile")
    # Bake the model weights into the image — runs ONCE at build time.
    .run_function(_download_model)
)

# ---------------------------------------------------------------------------
# Modal App — scales to zero automatically between invocations.
# ---------------------------------------------------------------------------
app = modal.App("demucs-splitter")


@app.function(
    image=demucs_image,
    gpu="T4",       # Nvidia T4 — cheapest GPU tier ($0.000164/sec), sufficient for htdemucs
    timeout=600,    # 10 min max — long tracks may take a while
)
def split_audio(file_bytes: bytes, filename: str, model: str = "htdemucs_6s") -> dict:
    """
    Takes raw audio file bytes, runs Demucs splitting,
    converts the separated stems to MP3, and returns their base64-encoded strings.

    Cold start: model weights are pre-baked in the image — no download needed.
    """
    import subprocess

    temp_dir = tempfile.mkdtemp()
    try:
        # 1. Write the input audio to a temp file
        input_path = os.path.join(temp_dir, filename)
        with open(input_path, "wb") as f:
            f.write(file_bytes)

        # 2. Run Demucs — uses cached model weights from the image layer
        out_dir = os.path.join(temp_dir, "output")
        result = subprocess.run(
            ["demucs", "-n", model, "-o", out_dir, input_path],
            capture_output=True,
            text=True,
        )
        if result.returncode != 0:
            raise RuntimeError(f"Demucs separation failed: {result.stderr}")

        # 3. Locate stem files
        # Output structure: out_dir/{model}/{track_name}/{stem}.wav
        htdemucs_dir = os.path.join(out_dir, model)
        if not os.path.exists(htdemucs_dir):
            raise RuntimeError(f"Demucs output root directory not found for model: {model}")

        song_dirs = os.listdir(htdemucs_dir)
        if not song_dirs:
            raise RuntimeError("Demucs output song directory not found")
        song_dir = os.path.join(htdemucs_dir, song_dirs[0])

        # 4. Convert each stem WAV → MP3 and base64-encode for transport
        if model == "htdemucs_6s":
            targets = ["vocals", "drums", "bass", "other", "guitar", "piano"]
        else:
            targets = ["vocals", "drums", "bass", "other"]
            
        separated: dict[str, str] = {}

        for target in targets:
            wav_path = os.path.join(song_dir, f"{target}.wav")
            mp3_path = os.path.join(song_dir, f"{target}.mp3")

            if not os.path.exists(wav_path):
                raise RuntimeError(f"Separated stem '{target}' was not generated")

            conv = subprocess.run(
                ["ffmpeg", "-y", "-i", wav_path, "-b:a", "192k", mp3_path],
                capture_output=True,
            )
            read_path = mp3_path if (conv.returncode == 0 and os.path.exists(mp3_path)) else wav_path

            with open(read_path, "rb") as f:
                separated[target] = base64.b64encode(f.read()).decode("utf-8")

        return separated

    finally:
        shutil.rmtree(temp_dir, ignore_errors=True)


@app.function(
    image=demucs_image,
    gpu="T4",
    timeout=600,
)
def decrypt_and_split_hls(segments: list, key_bytes: bytes, model: str = "htdemucs_6s") -> dict:
    """
    Decrypts AES-128-CBC encrypted HLS `.ts` segments using their sequence
    numbers as IVs, concatenates them into a single audio stream, then passes
    the result to ``split_audio`` for Demucs processing.
    """
    from Crypto.Cipher import AES

    # Sort segments by filename to ensure correct ordering
    sorted_segments = sorted(segments, key=lambda x: x["name"])

    compiled_bytes = bytearray()
    for idx, seg in enumerate(sorted_segments):
        enc_data = base64.b64decode(seg["data_b64"])
        # HLS AES-128-CBC: IV is the 16-byte big-endian segment sequence number
        iv = idx.to_bytes(16, byteorder="big")
        cipher = AES.new(key_bytes, AES.MODE_CBC, iv=iv)
        compiled_bytes.extend(cipher.decrypt(enc_data))

    # Delegate to split_audio
    return split_audio.local(bytes(compiled_bytes), "compiled.ts", model=model)
