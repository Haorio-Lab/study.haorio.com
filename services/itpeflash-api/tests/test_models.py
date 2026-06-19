from __future__ import annotations

import pytest
from pydantic import ValidationError

from app.models import Note, Snapshot


def make_note(note_id: str = "note-1") -> Note:
    return Note(
        id=note_id,
        title="테스트 카드",
        domain="테스트",
        tags=[],
        importance=2,
        source="test",
        created="2026-06-20",
        summary="summary",
        problem="problem",
        content="<p>content</p>",
        mnemonics=[],
        memo="",
        deleted=False,
    )


def test_snapshot_accepts_current_card_contract() -> None:
    snapshot = Snapshot(
        notes=[make_note()],
        statuses={"note-1": "review"},
    )

    assert snapshot.version == 1
    assert snapshot.notes[0].id == "note-1"


def test_snapshot_rejects_duplicate_note_ids() -> None:
    with pytest.raises(ValidationError, match="unique ids"):
        Snapshot(notes=[make_note(), make_note()])


def test_snapshot_rejects_status_for_unknown_note() -> None:
    with pytest.raises(ValidationError, match="reference notes"):
        Snapshot(notes=[make_note()], statuses={"missing": "review"})
