"""Secure HTTPS delivery for credentials that must never enter API responses."""
import asyncio
import json
from urllib import error, request

from src.core.config import settings


class EmailDeliveryError(RuntimeError):
    pass


async def send_secure_email(*, recipient: str, subject: str, body: str) -> None:
    """Send through the shared authenticated adapter. Development may suppress mail."""
    if not settings.email_delivery_configured:
        if settings.environment in {"production", "staging"}:
            raise EmailDeliveryError("Secure email delivery is not configured.")
        return

    def deliver() -> None:
        message = {"to": recipient, "subject": subject, "text": body}
        if settings.email_from:
            message["from"] = settings.email_from
        payload = json.dumps(message).encode("utf-8")
        email_request = request.Request(
            settings.email_delivery_url,
            data=payload,
            headers={
                "Authorization": f"Bearer {settings.email_delivery_token}",
                "Content-Type": "application/json",
                # Cloudflare-fronted providers such as Resend reject urllib's default agent (error 1010).
                "User-Agent": "create-my-saas-email/1.0",
            },
            method="POST",
        )
        with request.urlopen(email_request, timeout=10) as response:
            if not 200 <= response.status < 300:
                raise EmailDeliveryError("Secure email delivery is unavailable.")

    try:
        await asyncio.to_thread(deliver)
    except EmailDeliveryError:
        raise
    except (error.URLError, OSError, TimeoutError, ValueError) as exc:
        raise EmailDeliveryError("Secure email delivery is unavailable.") from exc
