"""Generate bilingual (German + English) match reports using the Anthropic API."""

import json

import anthropic

_SYSTEM_PROMPT = (
    "You write concise match reports for a junior floorball club called Kloten-Dietlikon Jets. "
    "Write in a factual but engaging tone. 3–5 sentences per language. "
    "Focus on the Jets' perspective. Do not open with the final score. "
    "Return exactly two paragraphs separated by a line containing only '---': "
    "first German (Deutsch), then English."
)


def generate_match_report(facts: dict) -> tuple[str, str]:
    """Call Claude API with game facts and return (german_report, english_report)."""
    client = anthropic.Anthropic()
    response = client.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=600,
        system=[{
            "type": "text",
            "text": _SYSTEM_PROMPT,
            "cache_control": {"type": "ephemeral"},
        }],
        messages=[{"role": "user", "content": json.dumps(facts, ensure_ascii=False)}],
    )
    text = response.content[0].text
    parts = text.split("---", 1)
    de = parts[0].strip()
    en = parts[1].strip() if len(parts) > 1 else ""
    return de, en
