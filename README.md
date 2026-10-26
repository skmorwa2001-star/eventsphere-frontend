# EventSphere

An event management app. Organizers publish events and check attendees in with a QR scanner; participants browse events, register and receive a QR ticket.

- **Backend:** FastAPI + SQLAlchemy (SQLite locally, PostgreSQL in deployment)
- **Frontend:** plain HTML, CSS and JavaScript with a white glassmorphism design (no build step)

## Features

| Role | What they can do |
|---|---|
| Visitor | See the home page with live events, dates and details, and **register for an event without an account** (the form asks whatever the organizer chose, then shows a QR ticket) |
| Participant | Sign up / log in, view event details, register, get a QR ticket, cancel a registration |
| Organizer | Create, edit and delete events (with date and time), view attendees and analytics, remove attendees, check in tickets by QR scan, image upload or typed code, **add volunteers and choose which events they can check in**, **choose what information each event's registration form collects** (institute, mobile number, class, custom fields…), **download participant lists as CSV with those columns**, **approve check-in devices and optionally limit check-in to the event network** |
| Volunteer | Log in with an account made by an organizer and check in tickets only for the events assigned to them, from a device the organizer has approved |

## Folder structure

```
EventSphere/
├── README.md
├── docs/                      ← API, user guide, security, deployment, testing, troubleshooting
├── tests/e2e_frontend.js      ← browser-simulation test of both pages
├── tests/a11y_frontend.js     ← accessibility + keyboard audit
├── backend/
│   ├── main.py                ← API routes, auth, email codes, devices, CSV
│   ├── models.py              ← database tables
│   ├── schemas.py             ← request validation
│   ├── database.py            ← engine + session
│   ├── clean_legacy_db.py     ← one-time fixer for databases from older versions
│   ├── requirements.txt
│   ├── pytest.ini, tests/     ← automated API tests
│   └── .env.example           ← copy to .env
├── index.html, app.html       ← home page and the app
├── css/  style.css, home.css
└── js/   config.js (backend address), api.js, app.js, home.js, jsQR.js
```

The tables and every database upgrade are created automatically when the backend starts, so the old `create_tables.py` and `migrate_database.py` are no longer needed and can be deleted.

## Quick start

**1. Backend**
```bash
cd backend
python -m venv venv
venv\Scripts\activate          # Windows   (macOS/Linux: source venv/bin/activate)
pip install -r requirements.txt
uvicorn main:app --reload      # http://127.0.0.1:8000
```
Interactive API docs are available at <http://127.0.0.1:8000/docs>.

**2. Frontend**

Serve the project folder (the one containing `index.html`) on **port 5500**, for example with the VS Code *Live Server* extension, or `python -m http.server 5500`. Then open <http://127.0.0.1:5500/index.html>.

The backend only accepts requests from the sites listed in `CORS_ORIGINS` (default: ports 5500 on `127.0.0.1` and `localhost`). To use another address, add it to `CORS_ORIGINS` in `backend/.env`.

**3. Backend address**

The frontend calls `http://127.0.0.1:8000`. When you deploy, change that one line in `js/config.js`. The status pill in the header (● running / ● offline) can also override it for your own browser.

## Configuration

| Setting | Where | Default |
|---|---|---|
| Database | `DATABASE_URL` in `backend/.env` | `sqlite:///./eventsphere.db` |
| JWT signing key | `SECRET_KEY` in `backend/.env` (32+ chars; copy `.env.example`) | random temporary key |
| Hide `/docs` in production | `ENVIRONMENT=production` | off |
| Email sending | `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM`, `EMAIL_VERIFICATION` (`auto`/`on`/`off`) | email off |
| Reverse proxies in front of the API | `PROXY_HOPS` (e.g. `1` on Render) | `0` |
| Allowed websites (CORS) | `CORS_ORIGINS` | ports 5500 on `127.0.0.1` and `localhost` |
| Backend URL for the frontend | `js/config.js` | `http://127.0.0.1:8000` |

PostgreSQL example: `DATABASE_URL=postgresql+psycopg://user:password@localhost:5432/eventsphere`

## Email (verification codes and password reset)

EventSphere can email 6-digit codes to:
- confirm new accounts (a new user must enter the code before logging in),
- reset a forgotten password,
- confirm an attendee's email when an organizer turns on **Verify attendee emails** for an event.

Add SMTP settings to `backend/.env` (see `.env.example`):
```
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=you@example.com
SMTP_PASSWORD=your-app-password
SMTP_FROM=EventSphere <you@example.com>
```
Any SMTP provider works. A Gmail account with an *App password*, or the free tier of services such as Brevo, Mailgun or Resend, is enough for small events (check each provider's current free limits). Email turns on automatically once `SMTP_HOST` is set. Without SMTP everything works as before and the email options are hidden.

**Testing without an email account:** set `EMAIL_VERIFICATION=on` and leave SMTP empty. The backend then prints each email (including the code) in the terminal where `uvicorn` runs. Never do this in production: set `ENVIRONMENT=production` and real SMTP settings.

Existing accounts are treated as already verified, so nobody gets locked out when you switch email on.

## Event ownership

Each event belongs to the organizer who created it. Only that organizer can edit, delete, manage (view attendees, remove attendees) or check in tickets for it. Other organizers can see the event but get a 403 if they try. Events created before this feature have no owner; assign one with `UPDATE events SET organizer_id = <user id> WHERE organizer_id IS NULL;` or delete and recreate them.

## Database upgrades

If you already have an `eventsphere.db` from an older version, run `python clean_legacy_db.py` first (a dry run that only reports problems), then `python clean_legacy_db.py --apply` (makes a backup, then fixes them).


On startup `main.py` creates missing tables and adds the `users.role` and `events.event_date` columns to existing databases automatically. Restart the server after updating the code.

## Further reading

- [API reference](docs/API.md)
- [User guide and scanner testing](docs/USER_GUIDE.md)
- [Security guide](docs/SECURITY.md)
- [Design system and accessibility](docs/DESIGN.md)
- [Deployment checklist](docs/DEPLOYMENT.md)
- [Testing](docs/TESTING.md)
- [Troubleshooting](docs/TROUBLESHOOTING.md)

## Known limitations

- **Security basics only.** Login returns a JWT (valid 12 hours) and organizer actions are checked on the server, but set a strong `SECRET_KEY` in `.env` before any real deployment and serve the API over HTTPS.
- **"My Tickets"** is stored in the participant's browser, since the API has no endpoint that lists a user's registrations.
- **Registering** is open to anyone who calls the API directly; in the app the email is locked to the logged-in account.
