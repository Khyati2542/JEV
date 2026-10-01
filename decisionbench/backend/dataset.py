"""Dataset loading. JSON only - there is no database in this project."""
from __future__ import annotations

import json
import random
from collections import Counter
from functools import lru_cache
from typing import Any, Dict, List, Optional

from .config import CATEGORIES, DATA_PATH

REQUIRED_KEYS = {"id", "text", "category", "difficulty", "reason"}


@lru_cache(maxsize=1)
def load() -> Dict[str, Any]:
    with open(DATA_PATH, "r", encoding="utf-8") as fh:
        raw = json.load(fh)

    tickets: List[Dict[str, Any]] = raw["tickets"]
    seen: set[str] = set()
    for t in tickets:
        missing = REQUIRED_KEYS - set(t)
        if missing:
            raise ValueError(f"ticket {t.get('id')!r} missing keys: {sorted(missing)}")
        if t["category"] not in CATEGORIES:
            raise ValueError(f"ticket {t['id']} has unknown category {t['category']!r}")
        if t["difficulty"] not in {"easy", "medium", "hard"}:
            raise ValueError(f"ticket {t['id']} has unknown difficulty {t['difficulty']!r}")
        if t["id"] in seen:
            raise ValueError(f"duplicate ticket id {t['id']!r}")
        seen.add(t["id"])

    return {
        "tickets": tickets,
        "by_id": {t["id"]: t for t in tickets},
        "categories": raw.get("categories", CATEGORIES),
    }


def all_tickets() -> List[Dict[str, Any]]:
    return load()["tickets"]


def get(ticket_id: str) -> Optional[Dict[str, Any]]:
    return load()["by_id"].get(ticket_id)


def filtered(difficulty: Optional[str] = None, limit: Optional[int] = None) -> List[Dict[str, Any]]:
    rows = all_tickets()
    if difficulty:
        rows = [t for t in rows if t["difficulty"] == difficulty]
    if limit:
        rows = rows[:limit]
    return rows


def random_by_difficulty(difficulty: str, rng: Optional[random.Random] = None) -> Optional[Dict[str, Any]]:
    pool = [t for t in all_tickets() if t["difficulty"] == difficulty]
    if not pool:
        return None
    return (rng or random).choice(pool)


def stats() -> Dict[str, Any]:
    rows = all_tickets()
    return {
        "total": len(rows),
        "by_difficulty": dict(Counter(t["difficulty"] for t in rows)),
        "by_category": dict(Counter(t["category"] for t in rows)),
        "categories": CATEGORIES,
    }
