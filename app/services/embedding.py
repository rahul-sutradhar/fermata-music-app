"""Embedding service for generating text embeddings and chunking lyrics."""

import os
import random
import time
import requests
from typing import List
from dotenv import load_dotenv

load_dotenv()


def get_embedding(text: str, max_retries: int = 5) -> List[float]:
    """
    Generate a 384-dimensional embedding for text using the Hugging Face serverless Inference API.
    Uses the modern active router endpoint: router.huggingface.co/hf-inference
    """
    if not text or not text.strip():
        return [0.0] * 384

    # Support multiple token casings
    token = (
        os.getenv("HUGGINGFACE_API_KEY")
        or os.getenv("HF_API_TOKEN")
        or os.getenv("hf_api_token")
        or os.getenv("huggingface_api_key")
    )
    if not token:
        raise RuntimeError(
            "Hugging Face API key is not configured. Please set HF_API_TOKEN or HUGGINGFACE_API_KEY "
            "in your environment variables (.env)."
        )

    # Active Hugging Face router endpoints for sentence embeddings / feature extraction
    # Using paraphrase-multilingual-MiniLM-L12-v2 (384-dim, 50+ languages incl. Bengali/Hindi/Tamil)
    # so cross-lingual lyric searches work (e.g. Romanized Bengali matching Bengali-script lyrics)
    urls = [
        "https://router.huggingface.co/hf-inference/models/sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2",
        "https://router.huggingface.co/hf-inference/models/sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2/pipeline/feature-extraction",
    ]

    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
    }
    payload = {"inputs": text}

    for url in urls:
        backoff = 1.0
        for attempt in range(max_retries):
            try:
                res = requests.post(url, json=payload, headers=headers, timeout=10)

                if res.status_code == 200:
                    embedding = res.json()
                    
                    # Squeeze potential nested lists (e.g. [[[...]]]) down to a 1D vector
                    while isinstance(embedding, list) and len(embedding) > 0 and isinstance(embedding[0], list):
                        embedding = embedding[0]

                    if isinstance(embedding, list) and len(embedding) == 384:
                        return embedding

                elif res.status_code == 503:
                    # Model is loading on HF side
                    data = res.json() if res.headers.get("Content-Type") == "application/json" else {}
                    estimated_time = data.get("estimated_time", 15.0)
                    sleep_time = min(estimated_time, backoff)
                    print(
                        f"[Embedding] HF model loading... Waiting {sleep_time:.1f}s (Attempt {attempt+1}/{max_retries})",
                        flush=True,
                    )
                    time.sleep(sleep_time)
                    backoff *= 2
                    continue
                else:
                    # Non-retryable HTTP error for this URL; try next route
                    break

            except Exception as e:
                if attempt == max_retries - 1:
                    print(f"[Embedding] Connection to {url} failed: {str(e)}", flush=True)
                time.sleep(backoff + random.uniform(0, 0.2))
                backoff *= 2

    raise RuntimeError(
        "Failed to generate embedding from Hugging Face Inference API. "
        "Please verify your network connection and that your token is valid."
    )


def chunk_lyrics(lyrics: str, chunk_size: int = 4, overlap: int = 1) -> List[str]:
    """
    Segments lyrics into small overlapping chunks (default: 4 lines per chunk, 1 line overlap).
    Helpful for catching matches on half-remembered lines.
    """
    if not lyrics or not lyrics.strip():
        return []

    # Filter out empty lines
    lines = [line.strip() for line in lyrics.splitlines() if line.strip()]
    if not lines:
        return []

    chunks = []
    step = max(1, chunk_size - overlap)

    for i in range(0, len(lines), step):
        chunk_lines = lines[i : i + chunk_size]
        chunks.append("\n".join(chunk_lines))
        # Stop once the last line has been included in a chunk
        if i + chunk_size >= len(lines):
            break

    return chunks
