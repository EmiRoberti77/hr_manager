"""Parse and validate YouTube URLs for training videos."""

from __future__ import annotations

import re
from urllib.parse import parse_qs, urlparse

_YOUTUBE_HOSTS = frozenset(
    {
        "youtube.com",
        "www.youtube.com",
        "m.youtube.com",
        "youtu.be",
        "www.youtu.be",
    }
)

_VIDEO_ID_RE = re.compile(r"^[a-zA-Z0-9_-]{11}$")


def parse_youtube_video_id(url: str) -> str:
    """Extract an 11-character YouTube video ID from a URL.

    Supports watch?v=, youtu.be/, and /embed/ forms.
    Raises ValueError for invalid or non-YouTube URLs.
    """
    parsed = urlparse(url.strip())
    host = (parsed.hostname or "").lower()
    if host not in _YOUTUBE_HOSTS:
        raise ValueError("URL must be a YouTube link")

    video_id: str | None = None

    if host.endswith("youtu.be"):
        path = parsed.path.lstrip("/")
        if path:
            video_id = path.split("/")[0]
    elif "/embed/" in parsed.path:
        video_id = parsed.path.split("/embed/")[-1].split("/")[0]
    elif parsed.path.rstrip("/") == "/watch":
        qs = parse_qs(parsed.query)
        ids = qs.get("v", [])
        if ids:
            video_id = ids[0]

    if not video_id or not _VIDEO_ID_RE.match(video_id):
        raise ValueError("Could not parse a valid YouTube video ID from URL")

    return video_id
