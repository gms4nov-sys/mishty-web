# Mishty Web — Backend + Admin Panel

Backend server for the Mishty Web agency website. Serves the public site,
exposes a JSON API for services/gallery/blog, stores contact form
submissions, and includes a full admin panel to manage everything.

## Folder structure

```
mishty-project/
├── site/          → the public website (index.html, about.html, etc.)
└── backend/        → this Node.js server + admin panel
```

The backend serves the `site/` folder as the public website — keep both
folders side by side, exactly as downloaded.

## Setup

1. Make sure Node.js **v18 or newer** is installed (`node --version`).
2. Open a terminal inside the `backend/` folder.
3. Install dependencies:
   ```
   npm install
   ```
4. Copy `.env.example` to `.env` and fill in real values:
   ```
   cp .env.example .env
   ```
   - `SESSION_SECRET` — a long random string. Generate one with:
     `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
   - `ADMIN_USERNAME` / `ADMIN_PASSWORD` — your real admin login. **Set a
     strong password here before your first deploy** — if left blank, the
     server will generate and print a random one-time password instead of
     using a predictable default (see "Default admin login" below).
   - `CORS_ORIGIN` — your live site's domain(s), comma-separated. Leave
     blank while developing locally.
   - `NODE_ENV=production` on a real deploy (enables secure cookies, etc.)
5. Start the server:
   ```
   npm start
   ```
6. Open your browser:
   - Public site → http://localhost:4000
   - Admin panel → http://localhost:4000/admin

## Default admin login

On first run, an admin account is created automatically using
`ADMIN_USERNAME` / `ADMIN_PASSWORD` from your `.env` file. If
`ADMIN_PASSWORD` is not set, the server generates a random password and
prints it **once**, to the console, on that first run only — copy it down
immediately, or set `ADMIN_PASSWORD` in `.env` before starting so it's
predictable across restarts.

**Change this password from Admin Panel → Settings after your first
login**, either way.

## What the admin panel controls

- **Service Catalog** — the Category → Technology → Package structure
  that powers the homepage "What we do" section, the Services page,
  the catalog/package pages, and the enquiry form. This is the single
  source of truth for every service shown on the site.
- **Gallery** — portfolio/case study items shown on the gallery page,
  with category filtering.
- **Blog** — blog posts shown on the blog page (title, excerpt, tag,
  published/draft status).
- **Enquiries** — leads submitted through the Service Catalog + Package
  Selection flow.
- **Messages** — every enquiry submitted through the website's contact
  form, with read/unread status.
- **Settings** — contact details, branding, payment details, and your
  admin password.

Any change made in the admin panel reflects immediately on the live
site — the public pages fetch this content live from the backend.

## Database

Uses SQLite (`db/mishtyweb.db`, created automatically on first run) via
[`better-sqlite3`](https://www.npmjs.com/package/better-sqlite3) — no
separate database server needed, and no special Node version required
(works on any Node 18+). The file is created inside `backend/db/` the
first time you run `npm start`.

The `.db-wal` / `.db-shm` files that appear alongside it are SQLite's
write-ahead-log files — they're regenerated automatically and are
git-ignored on purpose; never commit or ship them, as they can contain a
copy of recent live data (enquiries, messages, etc.).

## Security notes

- Admin forms are protected against CSRF (cross-site request forgery) —
  every form includes a per-session token that's verified on submit.
- The admin login endpoint is rate-limited (10 attempts / 15 min per IP).
- The public contact and enquiry forms are rate-limited (8 submissions /
  10 min per IP) and include a honeypot field to filter basic bot spam.
- Image uploads are restricted to JPG/PNG/GIF/WEBP (no SVG — SVGs can
  embed `<script>` and enable stored XSS) and are checked against their
  real file signature, not just their extension.
- Session cookies are `httpOnly`, `sameSite=lax`, and `secure` when
  `NODE_ENV=production` (requires serving over HTTPS in production).
- Security headers are set via `helmet`. Content-Security-Policy is left
  off by default because the admin UI and site use inline
  `onclick`/`onsubmit` attributes; enabling a strict CSP would need those
  moved to external scripts first.
- CORS for `/api/*` is restricted to the origins listed in `CORS_ORIGIN`
  in production — set this to your real domain(s) before going live.

## Notes

- The contact form on `site/contact.html` submits to `POST /api/contact`.
- The enquiry form on `site/enquiry.html` submits to `POST /api/enquiry`.
- Public read-only endpoints: `GET /api/catalog`, `GET /api/gallery`,
  `GET /api/blog`, `GET /api/testimonials`, `GET /api/client-logos`.
- Sessions last 8 hours; you'll need to log in again after that.
- Enquiries and Messages lists in the admin panel are paginated (20 per
  page) once they grow past one page.
