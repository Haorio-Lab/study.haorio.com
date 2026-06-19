from __future__ import annotations

import json
from collections import Counter
from pathlib import Path

from scripts.importer import DOMAINS, build_seed_cards


SERVICE_ROOT = Path(__file__).resolve().parents[1]
DEFINITION_PATH = SERVICE_ROOT / "seed/definition.js"
JUMO_PATH = SERVICE_ROOT / "seed/jumo.js"
NOTE_KEYS = {
    "id",
    "title",
    "domain",
    "tags",
    "importance",
    "source",
    "created",
    "summary",
    "problem",
    "content",
    "mnemonics",
    "memo",
    "deleted",
}


def test_seed_card_counts_and_shape() -> None:
    cards = build_seed_cards(DEFINITION_PATH, JUMO_PATH)
    counts = Counter(card.source_kind for card in cards)

    assert len(cards) == 1643
    assert counts == {"legacy": 1, "definition": 1350, "jumo": 292}
    assert len({card.note["id"] for card in cards}) == len(cards)
    assert all(set(card.note) == NOTE_KEYS for card in cards)
    assert all(card.note["domain"] in DOMAINS for card in cards)
    assert all(len(card.source_hash) == 64 for card in cards)


def test_seed_cards_are_clean_and_jumo_images_use_public_urls() -> None:
    cards = build_seed_cards(DEFINITION_PATH, JUMO_PATH)
    serialized = json.dumps([card.note for card in cards], ensure_ascii=False)
    jumo_html = "".join(
        card.note["content"] for card in cards if card.source_kind == "jumo"
    )

    assert "\x00" not in serialized
    assert jumo_html.count("<img ") == 1214
    assert "./assets/images/" not in jumo_html
    assert 'src="https://study.haorio.com/apps/jumo/assets/images/' in jumo_html


def test_expected_id_prefixes_are_stable() -> None:
    cards = build_seed_cards(DEFINITION_PATH, JUMO_PATH)
    counts = Counter(
        "legacy"
        if card.note["id"] == "sample-itil-v4-svs"
        else card.note["id"].split("-", 1)[0]
        for card in cards
    )

    assert counts == {"legacy": 1, "definition": 1350, "jumo": 292}
