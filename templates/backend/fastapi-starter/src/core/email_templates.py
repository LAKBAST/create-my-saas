"""Branded transactional emails: one layout, sent as HTML with a plain-text twin.

The layout and the texts live in `email/` (synced from templates/shared/email),
so every backend sends the same emails.
"""
import json
import re
from dataclasses import dataclass
from functools import cache
from html import escape
from pathlib import Path

from src.core.config import settings

EMAIL_DIRECTORY = Path(__file__).resolve().parents[2] / "email"
_PLACEHOLDER = re.compile(r"\{\{\{(\w+)\}\}\}|\{\{(\w+)\}\}")


@dataclass(frozen=True)
class Email:
    subject: str
    text: str
    html: str


@cache
def _assets() -> tuple[str, dict]:
    layout = (EMAIL_DIRECTORY / "layout.html").read_text(encoding="utf-8")
    return layout, json.loads((EMAIL_DIRECTORY / "email.json").read_text(encoding="utf-8"))


def fill(template: str, values: dict[str, str]) -> str:
    """{{name}} is HTML-escaped, {{{name}}} is inserted as is; unknown names stay empty."""
    def replace(match: re.Match[str]) -> str:
        raw, escaped = match.groups()
        return values.get(raw, "") if raw else escape(values.get(escaped, ""), quote=True)
    return _PLACEHOLDER.sub(replace, template)


def _plain(template: str, values: dict[str, str]) -> str:
    return _PLACEHOLDER.sub(lambda match: values.get(match.group(1) or match.group(2), ""), template)


def render_email(
    *,
    subject: str,
    title: str,
    paragraphs: list[str],
    action: tuple[str, str] | None = None,
    code: tuple[str, str] | None = None,
    note: str | None = None,
) -> Email:
    """`action` is (button label, URL); `code` is (label, value) for tokens typed by hand."""
    layout, config = _assets()
    fragments = config["fragments"]
    product = settings.product_name
    home = settings.frontend_url.rstrip("/")
    accent = settings.email_accent_color or config["accent"]

    body = "".join(fill(fragments["paragraph"], {"text": paragraph}) for paragraph in paragraphs)
    if action:
        body += fill(fragments["action"], {"label": action[0], "url": action[1], "accent": accent})
    if code:
        body += fill(fragments["code"], {"label": code[0], "value": code[1]})
    if note:
        body += fill(fragments["note"], {"text": note})
    html = fill(layout, {
        "lang": config["lang"], "subject": subject, "preheader": paragraphs[0] if paragraphs else title,
        "accent": accent, "initial": product[:1].upper() or "S", "product": product, "title": title,
        "body": body, "footer": fill(fragments["footer"], {"home": home, "product": product}),
    })

    text_lines = [title, "", *paragraphs]
    if action:
        text_lines += ["", f"{action[0]}: {action[1]}"]
    if code:
        text_lines += ["", f"{code[0]}: {code[1]}"]
    if note:
        text_lines += ["", note]
    text_lines += ["", "—", f"{product} · {home}"]
    return Email(subject=subject, text="\n".join(text_lines), html=html)


def render_message(key: str, *, url: str | None = None, code: str | None = None, **values: str) -> Email:
    """Renders one of the shared messages in email.json (email_verification, password_reset...)."""
    message = _assets()[1]["messages"][key]
    return render_email(
        subject=_plain(message["subject"], values),
        title=_plain(message["title"], values),
        paragraphs=[_plain(paragraph, values) for paragraph in message["paragraphs"]],
        action=(message["action"], url) if url and "action" in message else None,
        code=(message["code"], code) if code and "code" in message else None,
        note=_plain(message["note"], values) if "note" in message else None,
    )
