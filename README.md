# Workout Log

A mobile-first PWA to configure a workout routine and track how much of it you
complete each day — a replacement for the monthly tracking spreadsheet.

- **Configure** exercises grouped by time slot (Wake up / Pre lunch / Evening),
  each with planned sets, reps-or-duration, rest, muscle group and equipment.
- **Track** daily: tick each set off and adjust the actual reps when you do
  fewer than planned. Completion % is computed as *reps done ÷ reps planned*.
- **Stats** per month: average completion, days above 50%, days above 0%, and a
  per-day chart — the same figures the spreadsheet produced.

## Stack

| Part | Tech |
|------|------|
| Backend | Go — one binary serving the JSON API and the built frontend |
| Database | Google Cloud Firestore (accessed behind a `Store` interface) |
| Frontend | React + TypeScript + Vite, installable as a PWA |
| Auth | Google SSO, restricted to a single allowed email |
| Scripts | TypeScript (`scripts/`) — routine seeding |
| CI/CD | GitHub Actions → Cloud Run |
| Hosting | Cloud Run + Firestore (GCP free tier) |

## Layout

```
backend/    Go server (cmd/server) + internal packages (domain, store, stats, api, auth)
frontend/   React + TS PWA
scripts/    TypeScript tooling (Firestore seed)
docs/       GCP_SETUP.md — one-time cloud setup
.github/    CI (test/build) and Deploy (Cloud Run) workflows
```

## Local development

The Go server serves the API; Vite serves the UI and proxies `/api` + `/auth`
to it. Run the backend with the in-memory store so you don't need Firestore or
Google auth locally:

```bash
# terminal 1 — API on :8080, in-memory data, auth disabled shim not needed
cd backend
WORKOUT_STORE=memory \
  go run ./cmd/server
```

> Note: Google SSO needs real OAuth credentials. For pure UI work, set
> `DEV_AUTH_EMAIL=you@local` — this bypasses auth entirely (dev only; it is
> never set by the deploy workflow and `--set-env-vars` would clear it anyway).
> For end-to-end local auth instead, set `GOOGLE_CLIENT_ID`,
> `GOOGLE_CLIENT_SECRET`, `OAUTH_REDIRECT_URL=http://localhost:8080/auth/callback`,
> `ALLOWED_EMAIL`, and `COOKIE_SECURE=false`.

```bash
# terminal 2 — UI on :5173
cd frontend
npm install
npm run dev
```

## Tests

```bash
cd backend  && go test ./... -race     # domain, store, stats, api, auth
cd frontend && npm run test            # format helpers, api client, App
cd scripts  && npm run test            # routine parser
```

## Deploy

See [docs/GCP_SETUP.md](docs/GCP_SETUP.md) for the one-time GCP setup. After
that, pushing to `main` runs CI and deploys to Cloud Run automatically.
