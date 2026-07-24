import os
import subprocess
import tempfile
from typing import Dict, Any
from app.core.config import settings

def transcode_to_hls(input_file_path: str, track_id: int) -> Dict[str, Any]:
    """
    Transcodes a raw audio file into encrypted HLS segments (.ts) and a playlist (.m3u8).
    Returns a dict containing:
      - 'temp_dir': The directory containing all generated HLS files.
      - 'playlist_name': The filename of the playlist (always 'playlist.m3u8').
      - 'key_name': The filename of the key file (always 'enc.key').
      - 'key_bytes': The raw 16-byte encryption key.
    """
    # 1. Create a secure temp directory to hold the HLS chunks
    temp_dir = tempfile.mkdtemp(prefix=f"fermata_hls_{track_id}_")
    
    playlist_name = "playlist.m3u8"
    key_name = "enc.key"
    
    playlist_path = os.path.join(temp_dir, playlist_name)
    key_file_path = os.path.join(temp_dir, key_name)
    key_info_path = os.path.join(temp_dir, "key_info.txt")
    
    # 2. Generate a random 16-byte encryption key
    key_bytes = os.urandom(16)
    with open(key_file_path, "wb") as f:
        f.write(key_bytes)
        
    # 3. Create the key info file for FFmpeg
    # Format of key info file:
    # Line 1: Key URI (the URL the player calls to fetch the key)
    # Line 2: Path to the key file on disk
    key_uri = f"{settings.backend_url.rstrip('/')}/api/v1/tracks/{track_id}/key"
    with open(key_info_path, "w", encoding="utf-8") as f:
        f.write(f"{key_uri}\n")
        f.write(f"{key_file_path}\n")
        
    # 4. Construct and run the FFmpeg transcoding command
    # Segments are sliced every 6 seconds.
    cmd = [
        "ffmpeg",
        "-y",
        "-i", input_file_path,
        "-c:a", "aac",
        "-b:a", "192k",
        "-hls_time", "6",
        "-hls_key_info_file", key_info_path,
        "-hls_playlist_type", "vod",
        "-hls_segment_filename", os.path.join(temp_dir, "segment_%03d.ts"),
        playlist_path
    ]
    
    try:
        result = subprocess.run(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            check=True,
            text=True
        )
    except subprocess.CalledProcessError as e:
        # Clean up on failure
        try:
            import shutil
            shutil.rmtree(temp_dir)
        except Exception:
            pass
        raise RuntimeError(f"FFmpeg transcoding failed: {e.stderr}") from e
        
    # 5. Return references to upload and clean up later
    return {
        "temp_dir": temp_dir,
        "playlist_name": playlist_name,
        "key_name": key_name,
        "key_bytes": key_bytes
    }
