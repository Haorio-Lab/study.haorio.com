from __future__ import annotations

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator


CardStatus = Literal["unchecked", "memorized", "review", "difficult"]


class Note(BaseModel):
    model_config = ConfigDict(extra="allow")

    id: str = Field(min_length=1, max_length=200)
    title: str = Field(min_length=1)
    domain: str = Field(min_length=1)
    tags: list[str] = Field(default_factory=list, max_length=50)
    importance: int = Field(default=2, ge=1, le=3)
    source: str = ""
    created: str = ""
    summary: str = ""
    problem: str = ""
    content: str = ""
    mnemonics: list[str] = Field(default_factory=list, max_length=100)
    memo: str = ""
    deleted: bool = False


class Snapshot(BaseModel):
    version: Literal[1] = 1
    notes: list[Note] = Field(default_factory=list, max_length=5000)
    statuses: dict[str, CardStatus] = Field(default_factory=dict)
    updatedAt: datetime | None = None

    @model_validator(mode="after")
    def validate_relations(self) -> "Snapshot":
        note_ids = [note.id for note in self.notes]
        if len(note_ids) != len(set(note_ids)):
            raise ValueError("notes must have unique ids")
        unknown_status_ids = set(self.statuses) - set(note_ids)
        if unknown_status_ids:
            raise ValueError("statuses must reference notes in the same snapshot")
        return self


class AuthenticatedUser(BaseModel):
    id: UUID
    email: str = Field(min_length=3)
