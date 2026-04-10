import os
from flask import Flask, render_template, request, redirect, url_for, session, abort, flash
from flask_migrate import Migrate
from dotenv import load_dotenv
from models import db, Event, Guest, RSVP

load_dotenv()

app = Flask(__name__)
app.config["SECRET_KEY"] = os.environ["SECRET_KEY"]
app.config["SQLALCHEMY_DATABASE_URI"] = os.environ.get("DATABASE_URL", "sqlite:///cookery.db")
app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False

db.init_app(app)
migrate = Migrate(app, db)


# ---------------------------------------------------------------------------
# Public: RSVP
# ---------------------------------------------------------------------------

@app.route("/rsvp/<token>", methods=["GET", "POST"])
def rsvp(token):
    guest = Guest.query.filter_by(rsvp_token=token).first_or_404()
    event = guest.event

    if request.method == "POST":
        attending = request.form.get("attending") == "yes"
        headcount = int(request.form.get("headcount", 1))
        note = request.form.get("note", "").strip()

        if guest.rsvp:
            guest.rsvp.attending = attending
            guest.rsvp.headcount = headcount
            guest.rsvp.note = note
        else:
            db.session.add(RSVP(guest_id=guest.id, attending=attending,
                                headcount=headcount, note=note))
        db.session.commit()
        return render_template("rsvp_confirm.html", guest=guest, event=event, attending=attending)

    return render_template("rsvp.html", guest=guest, event=event)


# ---------------------------------------------------------------------------
# Admin
# ---------------------------------------------------------------------------

def admin_required():
    if not session.get("admin"):
        abort(403)


@app.route("/admin/login", methods=["GET", "POST"])
def admin_login():
    if request.method == "POST":
        if request.form.get("password") == os.environ["ADMIN_PASSWORD"]:
            session["admin"] = True
            return redirect(url_for("admin_dashboard"))
        flash("Wrong password.")
    return render_template("admin_login.html")


@app.route("/admin/logout")
def admin_logout():
    session.pop("admin", None)
    return redirect(url_for("admin_login"))


@app.route("/admin")
def admin_dashboard():
    admin_required()
    events = Event.query.order_by(Event.date.desc()).all()
    return render_template("admin_dashboard.html", events=events)


@app.route("/admin/events/new", methods=["GET", "POST"])
def admin_new_event():
    admin_required()
    if request.method == "POST":
        from datetime import datetime
        event = Event(
            name=request.form["name"],
            date=datetime.fromisoformat(request.form["date"]),
            location=request.form.get("location", ""),
            description=request.form.get("description", ""),
            photos_album_url=request.form.get("photos_album_url", ""),
        )
        db.session.add(event)
        db.session.commit()
        return redirect(url_for("admin_event", event_id=event.id))
    return render_template("admin_new_event.html")


@app.route("/admin/events/<int:event_id>")
def admin_event(event_id):
    admin_required()
    event = Event.query.get_or_404(event_id)
    return render_template("admin_event.html", event=event)


@app.route("/admin/events/<int:event_id>/guests/add", methods=["POST"])
def admin_add_guest(event_id):
    admin_required()
    event = Event.query.get_or_404(event_id)
    name = request.form["name"].strip()
    email = request.form["email"].strip().lower()
    if name and email:
        db.session.add(Guest(event_id=event.id, name=name, email=email))
        db.session.commit()
    return redirect(url_for("admin_event", event_id=event_id))


@app.route("/admin/events/<int:event_id>/send", methods=["POST"])
def admin_send_invites(event_id):
    admin_required()
    from gmail import send_invites
    event = Event.query.get_or_404(event_id)
    sent = send_invites(event)
    flash(f"Sent {sent} invitation(s).")
    return redirect(url_for("admin_event", event_id=event_id))


# ---------------------------------------------------------------------------

if __name__ == "__main__":
    app.run(debug=True)
