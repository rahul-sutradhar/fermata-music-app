import logging
import requests
import re
import html
from app.core.config import settings

logger = logging.getLogger("fermata.lyrics")

def split_and_clean_artists(artist_name: str) -> list[str]:
    if not artist_name:
        return []
    # Split by comma, semicolon, feat, ft, and, &, or various dashes (hyphen, en-dash, em-dash)
    parts = re.split(r',|;|feat\.?|ft\.?|\band\b|&|–|-|—', artist_name, flags=re.IGNORECASE)
    cleaned = []
    for p in parts:
        # Strip whitespaces and clean up special wrapping characters
        c = p.strip()
        c = re.sub(r'^[^\w]+|[^\w]+$', '', c)
        if c and len(c) > 1:
            cleaned.append(c)
    return cleaned

def clean_html(html_content: str) -> str:
    # Remove script and style tags completely
    clean = re.sub(r'<(script|style)[^>]*>([\s\S]*?)</\1>', ' ', html_content, flags=re.IGNORECASE)
    # Replace common line breaks with newlines
    clean = re.sub(r'<br\s*/?>', '\n', clean, flags=re.IGNORECASE)
    clean = re.sub(r'</?(p|div|li|h[1-6])[^>]*>', '\n', clean, flags=re.IGNORECASE)
    # Strip remaining HTML tags
    clean = re.sub(r'<[^>]+>', ' ', clean)
    # Decode HTML entities (e.g. &amp;, &quot;)
    clean = html.unescape(clean)
    # Trim and filter empty lines
    lines = [line.strip() for line in clean.split('\n')]
    filtered = []
    for line in lines:
        if line:
            filtered.append(line)
    return '\n'.join(filtered)

def search_web_for_lyrics(song_name: str, artist_name: str) -> str | None:
    try:
        from ddgs import DDGS
    except ImportError:
        try:
            from duckduckgo_search import DDGS
        except ImportError:
            logger.warning("[lyrics] ddgs/duckduckgo_search is not available.")
            return None

    query = f"{song_name} {artist_name} lyrics"
    logger.info(f"[lyrics][search] Querying DuckDuckGo for: {query!r}")
    try:
        with DDGS() as ddgs:
            results = list(ddgs.text(query, max_results=4))
        
        if not results:
            logger.warning("[lyrics][search] No search results returned.")
            return None
        
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        }
        
        context_parts = []
        for idx, r in enumerate(results[:3]):
            url = r.get("href")
            title = r.get("title")
            body = r.get("body")
            if not url:
                continue
            
            # Skip media sharing URLs directly for text scraping
            if any(domain in url for domain in ["youtube.com", "youtu.be", "gaana.com", "spotify.com"]):
                context_parts.append(f"Source: {url}\nTitle: {title}\nSnippet: {body}")
                continue
                
            logger.info(f"[lyrics][search] Scraping page: {url}")
            try:
                resp = requests.get(url, headers=headers, timeout=6)
                if resp.status_code == 200:
                    text_content = clean_html(resp.text)
                    context_parts.append(f"Source: {url}\nTitle: {title}\nContent:\n{text_content[:2000]}")
                else:
                    context_parts.append(f"Source: {url}\nTitle: {title}\nSnippet: {body}")
            except Exception as e:
                logger.warning(f"[lyrics][search] Failed scraping {url}: {e}")
                context_parts.append(f"Source: {url}\nTitle: {title}\nSnippet: {body}")
                
        return "\n\n====================\n\n".join(context_parts)
    except Exception as e:
        logger.warning(f"[lyrics][search] Exception: {e}")
        return None

def fetch_lrclib_lyrics(song_name: str, artist_name: str) -> str | None:
    # Try exact match on full artist name, then on individual split artist tokens
    artists_to_try = [artist_name]
    split_artists = split_and_clean_artists(artist_name)
    for sa in split_artists:
        if sa not in artists_to_try:
            artists_to_try.append(sa)
            
    for artist in artists_to_try:
        try:
            params = {"track_name": song_name, "artist_name": artist}
            logger.info(f"[lyrics][lrclib] Exact match request for title={song_name!r} artist={artist!r}")
            r = requests.get(
                "https://lrclib.net/api/get",
                params=params,
                headers={"User-Agent": "FermataApp/1.0 (github.com/fermata-music)"},
                timeout=6,
            )
            if r.status_code == 200:
                lyrics = (r.json().get("plainLyrics") or "").strip()
                if lyrics:
                    logger.info(f"[lyrics][lrclib] Exact match successful for artist {artist}")
                    return lyrics
        except Exception as e:
            logger.warning(f"[lyrics][lrclib] Exact match failed for artist {artist}: {e}")

    # Fall back to fuzzy search queries on LrcLib
    logger.info("[lyrics][lrclib] Exact match failed. Running fuzzy searches...")
    search_queries = [song_name]
    if split_artists:
        search_queries.insert(0, f"{song_name} {split_artists[0]}")
        
    for q in search_queries:
        try:
            logger.info(f"[lyrics][lrclib] Querying LrcLib search with q={q!r}")
            r_search = requests.get(
                "https://lrclib.net/api/search",
                params={"q": q},
                headers={"User-Agent": "FermataApp/1.0 (github.com/fermata-music)"},
                timeout=6,
            )
            if r_search.status_code == 200:
                results = r_search.json()
                for res in results:
                    plain_lyrics = (res.get("plainLyrics") or "").strip()
                    if not plain_lyrics:
                        continue
                    
                    res_title = (res.get("name") or "").lower()
                    res_artist = (res.get("artistName") or "").lower()
                    
                    # Validate match to avoid picking the wrong track
                    if song_name.lower() in res_title or res_title in song_name.lower():
                        artist_matched = False
                        if not split_artists:
                            artist_matched = True
                        for sa in split_artists:
                            if sa.lower() in res_artist or res_artist in sa.lower():
                                artist_matched = True
                                break
                        
                        if artist_matched:
                            logger.info(f"[lyrics][lrclib] Found fuzzy match: name='{res.get('name')}' artist='{res.get('artistName')}'")
                            return plain_lyrics
        except Exception as e:
            logger.warning(f"[lyrics][lrclib] Fuzzy search query {q!r} failed: {e}")
            
    return None

def fetch_lyrics_robustly(
    song_name: str,
    artist_name: str,
    album_title: str | None = None,
    duration_seconds: int | None = None,
    genres: str | None = None,
    youtube_url: str | None = None,
    feedback: str | None = None
) -> str | None:
    # 1. Try LrcLib first (unless feedback is provided)
    if not feedback:
        lyrics = fetch_lrclib_lyrics(song_name, artist_name)
        if lyrics:
            return lyrics

        # 2. Try lyrics.ovh
        try:
            import urllib.parse
            url = f"https://api.lyrics.ovh/v1/{urllib.parse.quote(artist_name)}/{urllib.parse.quote(song_name)}"
            r = requests.get(url, timeout=6)
            if r.status_code == 200:
                lyrics = r.json().get("lyrics", "").strip()
                if lyrics:
                    logger.info("[lyrics][ovh] Found lyrics via lyrics.ovh")
                    return lyrics
        except Exception as e:
            logger.warning(f"[lyrics][ovh] Failed to fetch: {e}")

    # 3. Fall back to search-enhanced LLM RAG
    if not settings.mistral_api_key:
        logger.warning("[lyrics] MISTRAL_API_KEY is not set. Skipping search LLM tier.")
        return None

    # Retrieve web search context using DDGS
    web_context = search_web_for_lyrics(song_name, artist_name)
    
    try:
        from langchain_mistralai import ChatMistralAI
        from langchain_core.messages import HumanMessage
        
        llm = ChatMistralAI(
            model=settings.mistral_model or "mistral-small-latest",
            api_key=settings.mistral_api_key,
            temperature=0.1
        )
        
        prompt = (
            f"You are a music cataloging assistant. Retrieve and format the complete and accurate lyrics for the song with the following metadata:\n"
            f"- Song Title: '{song_name}'\n"
            f"- Artist(s): '{artist_name}'\n"
        )
        if album_title:
            prompt += f"- Album/Movie: '{album_title}'\n"
        if duration_seconds:
            prompt += f"- Duration: {duration_seconds} seconds\n"
        if genres:
            prompt += f"- Genres: '{genres}'\n"
        if youtube_url:
            prompt += f"- YouTube URL of the song: '{youtube_url}'\n"
        if feedback:
            prompt += f"- User Correction/Feedback Hint: '{feedback}'\n"
            
        if web_context:
            prompt += (
                f"\nHere is real-time search context gathered from the web for this query:\n"
                f"```\n{web_context}\n```\n"
                f"Use this web context to extract the real lyrics of the song. Do not make them up or hallucinate.\n"
            )
        else:
            prompt += (
                "\nWarning: Web search context was not available. Please retrieve the lyrics from your knowledge "
                "or analyze the YouTube video context if possible. If you are absolutely sure you don't know the lyrics, "
                "return 'Lyrics not found'.\n"
            )
            
        prompt += (
            "\nConstraints:\n"
            "- Output ONLY the lyrics — no introductory text, no explanations, no chords, no html formatting.\n"
            "- Keep section headers like [Verse 1], [Chorus], [Bridge] clean and correctly placed."
        )
        
        logger.info("[lyrics][llm] Invoking Mistral with web-search context...")
        response = llm.invoke([HumanMessage(content=prompt)])
        result = response.content.strip()
        logger.info(f"[lyrics][llm] LLM responded ({len(result)} chars)")
        
        if result and "lyrics not found" not in result.lower() and len(result) > 50:
            return result
            
    except Exception as e:
        logger.error(f"[lyrics][llm] Exception during LLM query: {e}")
        
    return None
