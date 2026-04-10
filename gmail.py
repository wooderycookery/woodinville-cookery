"""Gmail API integration for sending invitations."""
import os
import base64
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

from google.oauth2.credentials import Credentials
from google.auth.transport.requests import Request
from google_auth_oauthlib.flow import InstalledAppFlow
from googleapiclient.discovery import build

from flask import render_template, url_for

SCOPES = ["https://www.googleapis.com/auth/gmail.send"]
TOKEN_FILE = "gmail_token.json"
CREDENTIALS_FILE = "gmail_credentials.json"


def _get_service():
    creds = None
    if os.path.exists(TOKEN_FILE):
        creds = Credentials.from_authorized_user_file(TOKEN_FILE, SCOPES)
    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            creds.refresh(Request())
        else:
            flow = InstalledAppFlow.from_client_secrets_file(CREDENTIALS_FILE, SCOPES)
            creds = flow.run_local_server(port=0)
        with open(TOKEN_FILE, "w") as f:
            f.write(creds.to_json())
    return build("gmail", "v1", credentials=creds)


def _build_message(guest, event, rsvp_url):
    msg = MIMEMultipart("alternative")
    msg["Subject"] = f"You're invited: {event.name}"
    msg["From"] = os.environ["GMAIL_SENDER"]
    msg["To"] = guest.email

    html = render_template("email_invite.html", guest=guest, event=event, rsvp_url=rsvp_url)
    msg.attach(MIMEText(html, "html"))
    return {"raw": base64.urlsafe_b64encode(msg.as_bytes()).decode()}


def send_invites(event):
    """Send invitations to all guests who haven't received one yet. Returns count sent."""
    from app import app as flask_app
    service = _get_service()
    sent = 0
    for guest in event.guests:
        if guest.invite_sent:
            continue
        with flask_app.app_context():
            rsvp_url = url_for("rsvp", token=guest.rsvp_token, _external=True)
            message = _build_message(guest, event, rsvp_url)
        service.users().messages().send(userId="me", body=message).execute()
        guest.invite_sent = True
        sent += 1
    from models import db
    db.session.commit()
    return sent
