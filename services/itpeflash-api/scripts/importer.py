from __future__ import annotations

import hashlib
import html
import json
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Iterable
from urllib.parse import urljoin


DOMAINS = {
    "소프트웨어 공학",
    "데이터베이스",
    "테스트",
    "인공지능",
    "경영컨설팅",
    "빅데이터분석",
    "보안",
    "알고리즘",
    "네트워크",
    "UML",
    "디자인패턴",
    "프로젝트 관리",
    "법제도",
    "신기술",
    "주간기술동향",
    "CAOS",
    "풀이문제",
}

DOMAIN_ALIASES = {
    "인공지능": "인공지능",
    "데이터분석": "빅데이터분석",
    "빅데이터 분석": "빅데이터분석",
    "빅데이터파트1": "빅데이터분석",
    "빅데이터파트2": "빅데이터분석",
    "소프트웨어공학": "소프트웨어 공학",
    "소공": "소프트웨어 공학",
    "테스트": "테스트",
    "보안": "보안",
    "신기술": "신기술",
    "디지털서비스": "신기술",
    "법제도": "법제도",
    "법/제도": "법제도",
    "주기동": "주간기술동향",
    "경영/컨설팅": "경영컨설팅",
    "경영": "경영컨설팅",
    "프로젝트관리": "프로젝트 관리",
    "프로젝트 관리": "프로젝트 관리",
    "감리": "프로젝트 관리",
    "DB": "데이터베이스",
    "데이터베이스": "데이터베이스",
    "알고리즘": "알고리즘",
    "네트워크": "네트워크",
    "CA/OS": "CAOS",
    "UML": "UML",
}

DESIGN_PATTERN_TERMS = (
    "디자인 패턴",
    "디자인패턴",
    "design pattern",
    "singleton",
    "factory",
    "adapter",
    "bridge",
    "builder",
    "command",
    "composite",
    "decorator",
    "facade",
    "observer",
    "prototype",
    "proxy",
    "strategy",
    "template method",
    "visitor",
)

JUMO_IMAGE_BASE_URL = "https://study.haorio.com/apps/jumo/assets/images/"
TARGET_USER_ID = "c152558c-dc3e-4ce3-872f-c9958db33b37"
TARGET_EMAIL = "jw_hoy@naver.com"


LEGACY_NOTE = {
    "id": "sample-itil-v4-svs",
    "title": "ITIL v4.0 서비스 가치 시스템(SVS)과 서비스 가치 사슬",
    "domain": "경영컨설팅",
    "tags": ["ITIL", "SVS", "서비스가치사슬"],
    "importance": 3,
    "source": "정의 삑삑이 기존 카드",
    "created": "2026-06-18",
    "summary": "ITIL v4.0의 SVS 구성과 서비스 가치 사슬 활동을 연결해서 암기",
    "problem": (
        "ITIL v4.0의 서비스 가치 시스템(Service Value System, SVS) 구성요소와 "
        "서비스 가치 사슬(Service Value Chain) 활동을 설명하시오."
    ),
    "content": (
        "<p><strong>SVS(Service Value System)</strong>는 다양한 조직 요소와 활동을 "
        "통합·조정하여 가치 중심 방향성을 제공하고, 지속적으로 가치를 창출하는 "
        "체계다.</p><p><strong>SVS 구성:</strong> 기회/수요 → 서비스 가치사슬 → "
        "가이드 원칙 → 거버넌스 → 관리 실행 → 지속적 개선 → 가치</p>"
        "<p><strong>서비스 가치 사슬 활동:</strong> 계획, 참여, 설계 및 전환, 획득 및 "
        "구축, 운영, 개선</p><table><tr><th>구분</th><th>암기 포인트</th></tr>"
        "<tr><td>SVS</td><td>기서가거지가</td></tr><tr><td>SVC</td>"
        "<td>계참설획운개</td></tr><tr><td>가이드 원칙</td><td>가치 중심, 현재 "
        "상태 시작, 반복적 피드백, 협업과 투명성, 전체론적 사고, 단순·실용, "
        "자동화 활용</td></tr></table>"
    ),
    "mnemonics": [
        "SVS: 기서가거지가 = 기회/수요, 서비스 가치사슬, 가이드 원칙, 거버넌스, 관리 실행, 지속적 개선, 가치",
        "SVC: 계참설획운개 = 계획, 참여, 설계 및 전환, 획득 및 구축, 운영, 개선",
        "ITIL v4는 라이프사이클보다 가치 흐름과 지속적 개선을 강조",
    ],
    "memo": (
        "새 계정에 자동 제공되는 샘플 카드입니다. 수정하거나 삭제해도 내 계정에만 "
        "반영됩니다."
    ),
    "deleted": False,
}


@dataclass(frozen=True, slots=True)
class SeedCard:
    note: dict[str, Any]
    source_kind: str
    source_key: str
    source_hash: str


def load_js_assignment(path: Path) -> dict[str, Any]:
    raw = path.read_text(encoding="utf-8-sig")
    assignment = raw.find("=")
    if assignment < 0:
        raise ValueError(f"JavaScript assignment was not found: {path}")
    payload = raw[assignment + 1 :].strip()
    if payload.endswith(";"):
        payload = payload[:-1].rstrip()
    data = json.loads(payload)
    if not isinstance(data, dict):
        raise ValueError(f"Expected a JSON object in {path}")
    return data


def clean_text(value: Any) -> str:
    text = str(value or "").replace("\x00", " ").replace("\u00a0", " ")
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    lines = [re.sub(r"[ \t]+", " ", line).strip() for line in text.split("\n")]
    return re.sub(r"\n{3,}", "\n\n", "\n".join(lines)).strip()


def text_to_html(value: Any) -> str:
    text = clean_text(value)
    if not text:
        return ""
    paragraphs = []
    for paragraph in text.split("\n\n"):
        escaped = html.escape(paragraph).replace("\n", "<br>")
        paragraphs.append(f"<p>{escaped}</p>")
    return "".join(paragraphs)


def short_summary(value: Any, limit: int = 160) -> str:
    text = clean_text(value)
    line = next((line for line in text.split("\n") if line), "")
    if len(line) <= limit:
        return line
    return f"{line[: limit - 1].rstrip()}…"


def normalize_domain(category: Any, question: Any) -> str:
    raw_category = clean_text(category)
    if raw_category == "UML/디패":
        lowered = clean_text(question).lower()
        if any(term in lowered for term in DESIGN_PATTERN_TERMS):
            return "디자인패턴"
        return "UML"
    domain = DOMAIN_ALIASES.get(raw_category)
    if domain is None:
        raise ValueError(f"Unmapped definition category: {raw_category!r}")
    return domain


def unique_tags(values: Iterable[Any]) -> list[str]:
    result: list[str] = []
    for value in values:
        tag = clean_text(value)
        if tag and tag not in result:
            result.append(tag)
    return result


def make_seed_card(note: dict[str, Any], source_kind: str, source_key: str) -> SeedCard:
    canonical = json.dumps(
        note, ensure_ascii=False, sort_keys=True, separators=(",", ":")
    )
    return SeedCard(
        note=note,
        source_kind=source_kind,
        source_key=source_key,
        source_hash=hashlib.sha256(canonical.encode("utf-8")).hexdigest(),
    )


def transform_definition(data: dict[str, Any]) -> list[SeedCard]:
    created = clean_text(data.get("generatedAt"))[:10]
    result: list[SeedCard] = []
    for sheet in data.get("sheets", []):
        sheet_name = clean_text(sheet.get("name"))
        for card in sheet.get("cards", []):
            source_id = clean_text(card.get("id"))
            title = clean_text(card.get("question"))
            definition = clean_text(card.get("definition"))
            keywords = clean_text(card.get("keywords"))
            raw_category = clean_text(card.get("category"))
            content_parts = ["<h3>정의</h3>", text_to_html(definition)]
            if keywords:
                content_parts.extend(["<h3>핵심 내용</h3>", text_to_html(keywords)])
            note = {
                "id": f"definition-{source_id}",
                "title": title,
                "domain": normalize_domain(raw_category, title),
                "tags": unique_tags(["정의 삑삑이", raw_category]),
                "importance": 2,
                "source": f"정의 삑삑이 · {sheet_name}",
                "created": created,
                "summary": short_summary(definition),
                "problem": f"{title}에 대해 설명하시오.",
                "content": "".join(content_parts),
                "mnemonics": [],
                "memo": (
                    f"원본 범주: {raw_category}\n원본 시트: {sheet_name}\n"
                    f"원본 ID: {source_id}"
                ),
                "deleted": False,
            }
            result.append(make_seed_card(note, "definition", source_id))
    return result


def _section_body(section: dict[str, Any]) -> str:
    title = clean_text(section.get("title"))
    body = clean_text(section.get("body"))
    lines = body.split("\n")
    if lines and clean_text(lines[0]) == title:
        body = "\n".join(lines[1:]).strip()
    return body


def _jumo_summary(card: dict[str, Any]) -> str:
    for section in card.get("sections", []):
        body = _section_body(section)
        for line in body.split("\n"):
            if "개념" in line and ":" in line:
                return short_summary(line.split(":", 1)[1])
    sections = card.get("sections", [])
    return short_summary(_section_body(sections[0])) if sections else ""


def _jumo_content(card: dict[str, Any]) -> str:
    chunks: list[str] = []
    question = clean_text(card.get("question"))
    for section in card.get("sections", []):
        title = clean_text(section.get("title"))
        body = _section_body(section)
        if title:
            chunks.append(f"<h3>{html.escape(title)}</h3>")
        if body:
            chunks.append(text_to_html(body))
        for image_index, image in enumerate(section.get("images", []), start=1):
            filename = Path(clean_text(image.get("src"))).name
            if not filename:
                continue
            image_url = urljoin(JUMO_IMAGE_BASE_URL, filename)
            alt = html.escape(f"{question} 참고 이미지 {image_index}", quote=True)
            chunks.append(
                f'<figure><img src="{image_url}" alt="{alt}" loading="lazy"></figure>'
            )
    return "".join(chunks)


def transform_jumo(data: dict[str, Any]) -> list[SeedCard]:
    created = clean_text(data.get("generatedAt"))[:10]
    result: list[SeedCard] = []
    for source_file in data.get("files", []):
        for card in source_file.get("cards", []):
            source_id = clean_text(card.get("id"))
            file_name = clean_text(card.get("fileName") or source_file.get("name"))
            sheet = clean_text(card.get("sheet"))
            question_no = clean_text(card.get("questionNo"))
            question = clean_text(card.get("question"))
            intent = clean_text(card.get("intent"))
            note = {
                "id": f"jumo-{source_id}",
                "title": question,
                "domain": "풀이문제",
                "tags": unique_tags(["주모 삑삑이", sheet]),
                "importance": 2,
                "source": (f"주모 삑삑이 · {file_name} · {sheet} · {question_no}번"),
                "created": created,
                "summary": _jumo_summary(card),
                "problem": question,
                "content": _jumo_content(card),
                "mnemonics": [],
                "memo": (
                    f"출제 의도:\n{intent}\n\n원본 파일: {file_name}\n"
                    f"원본 시트: {sheet}\n원본 문항: {question_no}\n원본 ID: {source_id}"
                ).strip(),
                "deleted": False,
            }
            result.append(make_seed_card(note, "jumo", source_id))
    return result


def build_seed_cards(definition_path: Path, jumo_path: Path) -> list[SeedCard]:
    legacy = make_seed_card(LEGACY_NOTE.copy(), "legacy", LEGACY_NOTE["id"])
    cards = [legacy]
    cards.extend(transform_definition(load_js_assignment(definition_path)))
    cards.extend(transform_jumo(load_js_assignment(jumo_path)))

    note_ids = [card.note["id"] for card in cards]
    if len(note_ids) != len(set(note_ids)):
        raise ValueError("Transformed cards contain duplicate note ids")
    invalid_domains = {card.note["domain"] for card in cards} - DOMAINS
    if invalid_domains:
        raise ValueError(
            f"Transformed cards contain invalid domains: {invalid_domains}"
        )
    return cards
