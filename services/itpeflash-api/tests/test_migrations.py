from __future__ import annotations

import re
from pathlib import Path


MIGRATIONS_DIR = Path(__file__).resolve().parents[1] / "migrations"


def test_migrations_are_non_destructive_and_prefixed() -> None:
    sql = "\n".join(
        path.read_text(encoding="utf-8")
        for path in sorted(MIGRATIONS_DIR.glob("*.sql"))
    )

    assert not re.search(
        r"^\s*(DROP|DELETE|TRUNCATE)\b", sql, re.IGNORECASE | re.MULTILINE
    )
    created_tables = re.findall(
        r"CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+([a-zA-Z0-9_]+)",
        sql,
        re.IGNORECASE,
    )
    assert created_tables
    assert all(name.startswith("itpeflash_") for name in created_tables)
