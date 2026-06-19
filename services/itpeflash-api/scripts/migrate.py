from __future__ import annotations

import argparse
import hashlib
import os
from pathlib import Path
from uuid import UUID

import psycopg
from psycopg.types.json import Jsonb

from scripts.importer import (
    TARGET_EMAIL,
    TARGET_USER_ID,
    SeedCard,
    build_seed_cards,
)


SERVICE_ROOT = Path(__file__).resolve().parents[1]
MIGRATIONS_DIR = SERVICE_ROOT / "migrations"
DEFAULT_DEFINITION_PATH = SERVICE_ROOT / "seed/definition.js"
DEFAULT_JUMO_PATH = SERVICE_ROOT / "seed/jumo.js"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Create ITPE Flash tables and non-destructively seed cards."
    )
    parser.add_argument(
        "--database-url",
        default=os.getenv("DATABASE_URL"),
        help="PostgreSQL DSN. Defaults to DATABASE_URL.",
    )
    parser.add_argument(
        "--definition-path",
        type=Path,
        default=Path(
            os.getenv("ITPEFLASH_DEFINITION_DATA", str(DEFAULT_DEFINITION_PATH))
        ),
    )
    parser.add_argument(
        "--jumo-path",
        type=Path,
        default=Path(os.getenv("ITPEFLASH_JUMO_DATA", str(DEFAULT_JUMO_PATH))),
    )
    parser.add_argument("--target-user-id", default=TARGET_USER_ID)
    parser.add_argument("--target-email", default=TARGET_EMAIL)
    parser.add_argument(
        "--schema-only",
        action="store_true",
        help="Apply schema migrations without seeding cards.",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Transform and validate source data without connecting to PostgreSQL.",
    )
    return parser.parse_args()


def table_names(connection: psycopg.Connection) -> list[str]:
    rows = connection.execute(
        """
        SELECT schemaname || '.' || tablename AS name
        FROM pg_catalog.pg_tables
        WHERE schemaname NOT IN ('pg_catalog', 'information_schema')
        ORDER BY schemaname, tablename
        """
    ).fetchall()
    return [row[0] for row in rows]


def ensure_migration_table(connection: psycopg.Connection) -> None:
    connection.execute(
        """
        CREATE TABLE IF NOT EXISTS itpeflash_schema_migrations (
            version TEXT PRIMARY KEY,
            checksum CHAR(64) NOT NULL,
            applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
        """
    )


def apply_migrations(connection: psycopg.Connection) -> None:
    ensure_migration_table(connection)
    applied = {
        row[0]: row[1].strip()
        for row in connection.execute(
            "SELECT version, checksum FROM itpeflash_schema_migrations"
        ).fetchall()
    }
    for migration_path in sorted(MIGRATIONS_DIR.glob("*.sql")):
        sql = migration_path.read_text(encoding="utf-8")
        checksum = hashlib.sha256(sql.encode("utf-8")).hexdigest()
        previous_checksum = applied.get(migration_path.name)
        if previous_checksum:
            if previous_checksum != checksum:
                raise RuntimeError(
                    f"Applied migration changed on disk: {migration_path.name}"
                )
            print(f"migration unchanged: {migration_path.name}")
            continue
        connection.execute(sql, prepare=False)
        connection.execute(
            """
            INSERT INTO itpeflash_schema_migrations (version, checksum)
            VALUES (%s, %s)
            """,
            (migration_path.name, checksum),
        )
        print(f"migration applied: {migration_path.name}")


def seed_cards(
    connection: psycopg.Connection,
    cards: list[SeedCard],
    target_user_id: UUID,
    target_email: str,
) -> tuple[int, int, int]:
    connection.execute(
        """
        INSERT INTO itpeflash_accounts (user_id, email, updated_at)
        VALUES (%s, %s, NOW())
        ON CONFLICT (user_id) DO UPDATE
        SET email = EXCLUDED.email,
            updated_at = NOW()
        """,
        (target_user_id, target_email),
    )
    existing = {
        row[0]: {
            "source_kind": row[1],
            "source_hash": row[2].strip() if row[2] else None,
            "user_modified": row[3],
        }
        for row in connection.execute(
            """
            SELECT note_id, source_kind, source_hash, user_modified
            FROM itpeflash_notes
            WHERE user_id = %s
            """,
            (target_user_id,),
        ).fetchall()
    }

    inserted = 0
    updated = 0
    preserved = 0
    rows = []
    for position, card in enumerate(cards):
        current = existing.get(card.note["id"])
        if current is None:
            inserted += 1
        elif (
            current["source_kind"] != "user"
            and not current["user_modified"]
            and current["source_hash"] != card.source_hash
        ):
            updated += 1
        else:
            preserved += 1
        rows.append(
            (
                target_user_id,
                card.note["id"],
                Jsonb(card.note),
                card.source_kind,
                card.source_key,
                card.source_hash,
                position,
            )
        )

    connection.executemany(
        """
        INSERT INTO itpeflash_notes (
            user_id,
            note_id,
            note_data,
            source_kind,
            source_key,
            source_hash,
            position,
            user_modified
        )
        VALUES (%s, %s, %s, %s, %s, %s, %s, FALSE)
        ON CONFLICT (user_id, note_id) DO UPDATE
        SET note_data = EXCLUDED.note_data,
            source_kind = EXCLUDED.source_kind,
            source_key = EXCLUDED.source_key,
            source_hash = EXCLUDED.source_hash,
            position = EXCLUDED.position,
            updated_at = NOW()
        WHERE itpeflash_notes.source_kind <> 'user'
          AND NOT itpeflash_notes.user_modified
          AND itpeflash_notes.source_hash IS DISTINCT FROM EXCLUDED.source_hash
        """,
        rows,
    )
    return inserted, updated, preserved


def main() -> None:
    args = parse_args()
    target_user_id = UUID(args.target_user_id)
    target_email = args.target_email.strip().lower()
    if not target_email:
        raise SystemExit("--target-email must not be empty")

    cards: list[SeedCard] = []
    if not args.schema_only:
        cards = build_seed_cards(args.definition_path, args.jumo_path)
        source_counts: dict[str, int] = {}
        for card in cards:
            source_counts[card.source_kind] = source_counts.get(card.source_kind, 0) + 1
        print(f"validated cards: total={len(cards)} sources={source_counts}")

    if args.dry_run:
        print("dry-run complete: no database connection and no writes")
        return
    if not args.database_url:
        raise SystemExit("DATABASE_URL or --database-url is required")

    with psycopg.connect(args.database_url) as connection:
        before = table_names(connection)
        print(f"tables before migration ({len(before)}): {before}")
        with connection.transaction():
            apply_migrations(connection)
            if cards:
                inserted, updated, preserved = seed_cards(
                    connection,
                    cards,
                    target_user_id,
                    target_email,
                )
                print(
                    "seed result: "
                    f"inserted={inserted} updated={updated} preserved={preserved}"
                )
        after = table_names(connection)
        print(f"tables after migration ({len(after)}): {after}")


if __name__ == "__main__":
    main()
