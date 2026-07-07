import logging
import smtplib
from email.mime.text import MIMEText

from app.config import settings

logger = logging.getLogger(__name__)


def email_configured() -> bool:
    return bool(settings.smtp_host and settings.smtp_user and settings.smtp_password)


def send_email(to: str, subject: str, body: str) -> bool:
    """Envoie un email texte. Retourne False (sans lever) si SMTP absent ou en échec,
    pour ne jamais révéler à l'appelant si un compte existe."""
    if not email_configured():
        logger.warning("SMTP non configuré — email non envoyé à %s (%s)", to, subject)
        return False
    msg = MIMEText(body, "plain", "utf-8")
    msg["Subject"] = subject
    msg["From"] = settings.smtp_from or settings.smtp_user
    msg["To"] = to
    try:
        if settings.smtp_port == 465:
            with smtplib.SMTP_SSL(settings.smtp_host, settings.smtp_port, timeout=15) as s:
                s.login(settings.smtp_user, settings.smtp_password)
                s.sendmail(msg["From"], [to], msg.as_string())
        else:
            with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=15) as s:
                s.starttls()
                s.login(settings.smtp_user, settings.smtp_password)
                s.sendmail(msg["From"], [to], msg.as_string())
        logger.info("email envoyé à %s (%s)", to, subject)
        return True
    except Exception as exc:
        logger.error("send_email vers %s : %s", to, exc)
        return False
