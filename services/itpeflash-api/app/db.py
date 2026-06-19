from __future__ import annotations

from datetime import datetime, timezone

import psycopg
from psycopg.rows import dict_row
from psycopg.types.json import Jsonb

from .models import AuthenticatedUser, Snapshot


class SnapshotRepository:
    def __init__(self, database_url: str) -> None:
        self._database_url = database_url

    def _connect(self) -> psycopg.Connection:
        return psycopg.connect(self._database_url, row_factory=dict_row)

    def ping(self) -> None:
        with self._connect() as connection:
            connection.execute("SELECT 1")

    def load(self, user: AuthenticatedUser) -> Snapshot:
        with self._connect() as connection:
            with connection.transaction():
                connection.execute(
                    """
                    INSERT INTO itpeflash_accounts (user_id, email)
                    VALUES (%s, %s)
                    ON CONFLICT (user_id) DO UPDATE
                    SET email = EXCLUDED.email
                    """,
                    (user.id, user.email),
                )
                note_rows = connection.execute(
                    """
                    SELECT note_data
                    FROM itpeflash_notes
                    WHERE user_id = %s
                    ORDER BY position, created_at, note_id
                    """,
                    (user.id,),
                ).fetchall()
                status_rows = connection.execute(
                    """
                    SELECT note_id, status
                    FROM itpeflash_statuses
                    WHERE user_id = %s
                    """,
                    (user.id,),
                ).fetchall()
                account = connection.execute(
                    """
                    SELECT updated_at
                    FROM itpeflash_accounts
                    WHERE user_id = %s
                    """,
                    (user.id,),
                ).fetchone()

        return Snapshot(
            version=1,
            notes=[row["note_data"] for row in note_rows],
            statuses={row["note_id"]: row["status"] for row in status_rows},
            updatedAt=account["updated_at"] if account else None,
        )

    def save(self, user: AuthenticatedUser, snapshot: Snapshot) -> Snapshot:
        now = datetime.now(timezone.utc)
        note_rows = [
            (
                user.id,
                note.id,
                Jsonb(note.model_dump(mode="json")),
                f"user:{note.id}",
                position,
            )
            for position, note in enumerate(snapshot.notes)
        ]
        status_rows = [
            (user.id, note_id, card_status)
            for note_id, card_status in snapshot.statuses.items()
        ]

        with self._connect() as connection:
            with connection.transaction():
                connection.execute(
                    """
                    INSERT INTO itpeflash_accounts (user_id, email, updated_at)
                    VALUES (%s, %s, %s)
                    ON CONFLICT (user_id) DO UPDATE
                    SET email = EXCLUDED.email,
                        updated_at = EXCLUDED.updated_at
                    """,
                    (user.id, user.email, now),
                )
                if note_rows:
                    connection.executemany(
                        """
                        INSERT INTO itpeflash_notes (
                            user_id,
                            note_id,
                            note_data,
                            source_kind,
                            source_key,
                            position,
                            user_modified
                        )
                        VALUES (%s, %s, %s, 'user', %s, %s, FALSE)
                        ON CONFLICT (user_id, note_id) DO UPDATE
                        SET note_data = EXCLUDED.note_data,
                            position = EXCLUDED.position,
                            user_modified = (
                                itpeflash_notes.user_modified
                                OR itpeflash_notes.note_data IS DISTINCT FROM EXCLUDED.note_data
                            ),
                            updated_at = NOW()
                        """,
                        note_rows,
                    )
                if status_rows:
                    connection.executemany(
                        """
                        INSERT INTO itpeflash_statuses (user_id, note_id, status)
                        VALUES (%s, %s, %s)
                        ON CONFLICT (user_id, note_id) DO UPDATE
                        SET status = EXCLUDED.status,
                            updated_at = NOW()
                        """,
                        status_rows,
                    )

        # The API intentionally never removes rows omitted from a client snapshot.
        return self.load(user)
