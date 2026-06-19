CREATE TABLE IF NOT EXISTS itpeflash_accounts (
    user_id UUID PRIMARY KEY,
    email TEXT NOT NULL,
    data_version INTEGER NOT NULL DEFAULT 1 CHECK (data_version = 1),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS itpeflash_notes (
    user_id UUID NOT NULL REFERENCES itpeflash_accounts(user_id) ON DELETE RESTRICT,
    note_id TEXT NOT NULL,
    note_data JSONB NOT NULL CHECK (jsonb_typeof(note_data) = 'object'),
    source_kind TEXT NOT NULL,
    source_key TEXT NOT NULL,
    source_hash CHAR(64),
    position INTEGER NOT NULL DEFAULT 0 CHECK (position >= 0),
    user_modified BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, note_id)
);

CREATE TABLE IF NOT EXISTS itpeflash_statuses (
    user_id UUID NOT NULL,
    note_id TEXT NOT NULL,
    status TEXT NOT NULL CHECK (
        status IN ('unchecked', 'memorized', 'review', 'difficult')
    ),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, note_id),
    FOREIGN KEY (user_id, note_id)
        REFERENCES itpeflash_notes(user_id, note_id)
        ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS itpeflash_notes_user_position_idx
    ON itpeflash_notes(user_id, position);

CREATE INDEX IF NOT EXISTS itpeflash_notes_source_idx
    ON itpeflash_notes(source_kind, source_key);
