"""Branded transactional emails: one layout, sent as HTML with a plain-text twin."""
from dataclasses import dataclass
from html import escape

from src.core.config import settings

# Inline styles only: most mail clients drop <style> blocks and CSS variables.
_ACCENT = "#6d5cf6"
_TEXT = "#1f2330"
_MUTED = "#636a7e"
_LINE = "#e6e8ef"
_PAGE = "#f4f5f9"


@dataclass(frozen=True)
class Email:
    subject: str
    text: str
    html: str


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
    product = settings.product_name
    home = settings.frontend_url.rstrip("/")

    text_lines = [title, "", *paragraphs]
    if action:
        text_lines += ["", f"{action[0]}: {action[1]}"]
    if code:
        text_lines += ["", f"{code[0]}: {code[1]}"]
    if note:
        text_lines += ["", note]
    text_lines += ["", "—", f"{product} · {home}"]

    body = "".join(
        f'<p style="margin:0 0 16px;font-size:15px;line-height:24px;color:{_TEXT};">{escape(paragraph)}</p>'
        for paragraph in paragraphs
    )
    if action:
        label, url = escape(action[0]), escape(action[1], quote=True)
        body += (
            '<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:8px 0 24px;"><tr>'
            f'<td style="border-radius:10px;background:{_ACCENT};">'
            f'<a href="{url}" style="display:inline-block;padding:13px 22px;font-size:15px;font-weight:600;'
            f'color:#ffffff;text-decoration:none;border-radius:10px;">{label}</a></td></tr></table>'
            f'<p style="margin:0 0 16px;font-size:13px;line-height:20px;color:{_MUTED};">'
            "Si el botón no funciona, copia este enlace en tu navegador:<br>"
            f'<a href="{url}" style="color:{_ACCENT};word-break:break-all;">{escape(action[1])}</a></p>'
        )
    if code:
        body += (
            f'<p style="margin:0 0 6px;font-size:13px;color:{_MUTED};">{escape(code[0])}</p>'
            f'<p style="margin:0 0 20px;padding:12px 14px;border:1px solid {_LINE};border-radius:8px;'
            f'font-family:ui-monospace,Menlo,Consolas,monospace;font-size:14px;color:{_TEXT};word-break:break-all;">'
            f"{escape(code[1])}</p>"
        )
    if note:
        body += f'<p style="margin:0;font-size:13px;line-height:20px;color:{_MUTED};">{escape(note)}</p>'

    initial = escape(product[:1].upper() or "S")
    html = f"""<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light"><title>{escape(subject)}</title></head>
<body style="margin:0;padding:0;background:{_PAGE};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">{escape(paragraphs[0] if paragraphs else title)}</div>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:{_PAGE};"><tr><td align="center" style="padding:32px 16px;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:560px;">
<tr><td style="padding:0 4px 20px;">
<table role="presentation" cellspacing="0" cellpadding="0" border="0"><tr>
<td style="width:32px;height:32px;border-radius:8px;background:{_ACCENT};color:#ffffff;font-size:16px;font-weight:700;text-align:center;line-height:32px;">{initial}</td>
<td style="padding-left:10px;font-size:16px;font-weight:700;color:{_TEXT};">{escape(product)}</td>
</tr></table></td></tr>
<tr><td style="background:#ffffff;border:1px solid {_LINE};border-radius:14px;padding:32px 28px;">
<h1 style="margin:0 0 16px;font-size:22px;line-height:30px;font-weight:650;color:{_TEXT};">{escape(title)}</h1>
{body}
</td></tr>
<tr><td style="padding:20px 4px 0;font-size:12px;line-height:18px;color:{_MUTED};">
Has recibido este correo porque se ha usado tu dirección en <a href="{escape(home, quote=True)}" style="color:{_MUTED};">{escape(product)}</a>. Si no has sido tú, puedes ignorarlo.
</td></tr>
</table></td></tr></table>
</body></html>"""
    return Email(subject=subject, text="\n".join(text_lines), html=html)
