import secrets
from flask_sqlalchemy import SQLAlchemy

db = SQLAlchemy()


class Event(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(200), nullable=False)
    date = db.Column(db.DateTime, nullable=False)
    location = db.Column(db.String(300))
    description = db.Column(db.Text)
    photos_album_url = db.Column(db.String(500))
    guests = db.relationship("Guest", backref="event", lazy=True)

    def __repr__(self):
        return f"<Event {self.name}>"


class Guest(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    event_id = db.Column(db.Integer, db.ForeignKey("event.id"), nullable=False)
    name = db.Column(db.String(200), nullable=False)
    email = db.Column(db.String(200), nullable=False)
    rsvp_token = db.Column(db.String(64), unique=True, nullable=False,
                           default=lambda: secrets.token_urlsafe(32))
    invite_sent = db.Column(db.Boolean, default=False)

    rsvp = db.relationship("RSVP", backref="guest", uselist=False, lazy=True)

    def __repr__(self):
        return f"<Guest {self.name} ({self.email})>"


class RSVP(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    guest_id = db.Column(db.Integer, db.ForeignKey("guest.id"), nullable=False)
    attending = db.Column(db.Boolean)
    headcount = db.Column(db.Integer, default=1)
    note = db.Column(db.Text)

    def __repr__(self):
        return f"<RSVP guest_id={self.guest_id} attending={self.attending}>"
