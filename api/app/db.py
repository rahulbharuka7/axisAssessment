"""SQLite access. Row shapes match the Postgres DDL in docs/01 and docs/05."""
from __future__ import annotations

import json
import sqlite3
import uuid as _uuid
from pathlib import Path
from typing import Any, Iterable

from .config import DB_PATH, SCHEMA_PATH


def uuid() -> str:
    return str(_uuid.uuid4())


def connect(path: str | None = None) -> sqlite3.Connection:
    target = path or DB_PATH
    if target != ":memory:":
        Path(target).parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(target, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.executescript(SCHEMA_PATH.read_text())
    return conn


_conn: sqlite3.Connection | None = None


def get_db() -> sqlite3.Connection:
    global _conn
    if _conn is None:
        _conn = connect()
    return _conn


def set_db(conn: sqlite3.Connection) -> None:
    global _conn
    _conn = conn


def one(conn: sqlite3.Connection, sql: str, params: Iterable[Any] = ()) -> dict[str, Any] | None:
    row = conn.execute(sql, tuple(params)).fetchone()
    return dict(row) if row else None


def many(conn: sqlite3.Connection, sql: str, params: Iterable[Any] = ()) -> list[dict[str, Any]]:
    return [dict(r) for r in conn.execute(sql, tuple(params)).fetchall()]


def run(conn: sqlite3.Connection, sql: str, params: Iterable[Any] = ()) -> sqlite3.Cursor:
    cur = conn.execute(sql, tuple(params))
    conn.commit()
    return cur


def loads(value: str | None, default: Any = None) -> Any:
    return json.loads(value) if value else default
