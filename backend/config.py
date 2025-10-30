"""Configuration helpers for the Armonia backend."""

from __future__ import annotations

import os
from pathlib import Path
from typing import Iterable

from dotenv import load_dotenv


def _candidate_paths() -> Iterable[Path]:
    root = Path(__file__).resolve().parent
    yield root.parent / ".env"
    yield root / ".env"


def load_environment() -> None:
    """Load environment variables from known .env locations without overriding."""
    seen: set[Path] = set()
    for candidate in _candidate_paths():
        if candidate in seen or not candidate.exists():
            continue
        load_dotenv(candidate, override=False)
        seen.add(candidate)


load_environment()

OPENAI_API_KEY: str | None = os.getenv("OPENAI_API_KEY")
OPENAI_MODEL: str = os.getenv("OPENAI_MODEL", "gpt-4o-mini")
FRONTEND_ORIGIN: str = os.getenv("FRONTEND_ORIGIN", "*")

