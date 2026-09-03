"""ISO-8601 UTC with a 'Z' suffix — the storage format for every timestamp."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def parse(iso: str) -> datetime:
    return datetime.fromisoformat(iso.replace("Z", "+00:00"))


def iso_plus_days(frm: str, days: int) -> str:
    return (parse(frm) + timedelta(days=days)).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def iso_plus_minutes(frm: str, minutes: int) -> str:
    return (parse(frm) + timedelta(minutes=minutes)).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def is_future(iso: str, ref: str | None = None) -> bool:
    return parse(iso) > parse(ref or now_iso())
