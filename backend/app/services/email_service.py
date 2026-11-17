"""SMTP email delivery service for password resets and workspace invitations."""

from __future__ import annotations

import logging
import smtplib
from email.message import EmailMessage
from urllib.parse import urlencode

from app.core.config import get_settings

logger = logging.getLogger(__name__)


def send_email(
    to_email: str,
    subject: str,
    text_body: str,
    html_body: str | None = None,
) -> bool:
    """Sends a transactional email via the configured SMTP server.

    Args:
        to_email (str): Recipient email address.
        subject (str): Email subject line.
        text_body (str): Plain-text fallback body.
        html_body (str | None, optional): Optional HTML alternative body. Defaults to None.

    Returns:
        bool: True if the email was accepted by the SMTP server, False otherwise.
    """
    settings = get_settings()
    if not settings.smtp_host:
        logger.warning("[Email] SMTP_HOST is not configured; skipping email delivery.")
        return False

    msg = EmailMessage()
    msg["From"] = settings.smtp_from
    msg["To"] = to_email
    msg["Subject"] = subject
    msg.set_content(text_body)
    if html_body:
        msg.add_alternative(html_body, subtype="html")

    try:
        with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=10) as smtp:
            if settings.smtp_use_tls:
                smtp.starttls()
            if settings.smtp_user and settings.smtp_password:
                smtp.login(settings.smtp_user, settings.smtp_password.get_secret_value())
            smtp.send_message(msg)
        return True
    except Exception as exc:
        logger.error(f"[Email] Failed to send email to '{to_email}': {exc}")
        return False


def send_password_reset_email(to_email: str, reset_token: str) -> bool:
    """Sends a password reset link and verification token to the user's email address.

    Args:
        to_email (str): Target user email address.
        reset_token (str): Raw single-use reset token valid for 30 minutes.

    Returns:
        bool: True if the email was delivered to SMTP, False otherwise.
    """
    settings = get_settings()
    base_url = settings.frontend_url.rstrip("/")
    reset_url = f"{base_url}/?{urlencode({'reset_token': reset_token})}"

    subject = "Reset your password — Enterprise AI Agent Platform"
    text_body = (
        "You requested a password reset.\n\n"
        f"Click this link to set a new password (valid for 30 minutes):\n{reset_url}\n\n"
        "If you did not request this, you can safely ignore this email."
    )
    html_body = f"""
    <div style="font-family:Inter,Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#1f2328;">
      <h2 style="margin:0 0 12px;font-size:18px;">Reset your password</h2>
      <p style="margin:0 0 16px;color:#59636e;font-size:14px;">
        Click the button below to choose a new password (this link is valid for 30 minutes).
      </p>
      <p style="margin:0 0 20px;">
        <a href="{reset_url}" style="display:inline-block;padding:10px 18px;background:#1f2328;color:#ffffff;text-decoration:none;border-radius:6px;font-size:14px;font-weight:500;">
          Reset password
        </a>
      </p>
      <p style="margin:0;color:#59636e;font-size:12px;">
        If you did not request a password reset, you can safely ignore this email.
      </p>
    </div>
    """
    return send_email(to_email=to_email, subject=subject, text_body=text_body, html_body=html_body)


def send_workspace_invitation_email(
    to_email: str,
    workspace_name: str,
    role: str,
    invite_token: str,
) -> bool:
    """Sends a workspace invitation link to a colleague's email address.

    Args:
        to_email (str): Invited recipient email address.
        workspace_name (str): Target workspace display name.
        role (str): Assigned RBAC role.
        invite_token (str): Raw invitation token valid for 7 days.

    Returns:
        bool: True if the email was delivered to SMTP, False otherwise.
    """
    settings = get_settings()
    base_url = settings.frontend_url.rstrip("/")
    invite_url = f"{base_url}/?{urlencode({'invite_token': invite_token})}"

    subject = f"Invitation to join {workspace_name} — Enterprise AI Agent Platform"
    text_body = (
        f"You have been invited to join the '{workspace_name}' workspace with the '{role}' role.\n\n"
        f"Click this link to accept the invitation (valid for 7 days):\n{invite_url}"
    )
    html_body = f"""
    <div style="font-family:Inter,Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#1f2328;">
      <h2 style="margin:0 0 12px;font-size:18px;">Invitation to join {workspace_name}</h2>
      <p style="margin:0 0 16px;color:#59636e;font-size:14px;">
        You have been invited with the <strong>{role}</strong> role.
      </p>
      <p style="margin:0 0 20px;">
        <a href="{invite_url}" style="display:inline-block;padding:10px 18px;background:#1f2328;color:#ffffff;text-decoration:none;border-radius:6px;font-size:14px;font-weight:500;">
          Join workspace
        </a>
      </p>
      <p style="margin:0;color:#59636e;font-size:12px;">
        This invitation link is valid for 7 days.
      </p>
    </div>
    """
    return send_email(to_email=to_email, subject=subject, text_body=text_body, html_body=html_body)
