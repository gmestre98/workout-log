# Workout Log — repo notes for Claude

Mobile-first PWA to configure a workout routine and track daily completion.
See [README.md](README.md) for the full overview and [docs/GCP_SETUP.md](docs/GCP_SETUP.md)
for one-time cloud setup.

## Workflow preference

**Ship directly to `main`.** In this repo the owner wants changes merged to
`main` and deployed directly — no PR/review step needed. Commit the work to
`main` and push; do not open a feature branch or a pull request unless asked.

Pushing to `main` triggers CI (`.github/workflows/ci.yml`), and once CI passes
the Deploy workflow (`.github/workflows/deploy.yml`) ships to Cloud Run
automatically. So "deploy" = push to `main` and let the workflows run; there is
no separate manual deploy step.

## Stack

- **Backend**: Go, one binary in `backend/cmd/server` serving the JSON API and
  the built frontend. Firestore behind a `Store` interface.
- **Frontend**: React + TypeScript + Vite PWA in `frontend/`.
- **Scripts**: TypeScript tooling in `scripts/` (Firestore routine seeding).
- **Auth**: Google SSO, restricted to a single allowed email.
- **CI/CD**: GitHub Actions → Cloud Run.

## Tests & checks (what CI runs)

```bash
cd backend  && go vet ./... && go build ./... && go test ./... -race
cd frontend && npm run lint && npm run test && npm run build
cd scripts  && npm run lint && npm run test
```

CI runs the frontend on **Node 22**. Newer local Node (24+) exposes a global
`localStorage` that shadows jsdom's and makes the `localStorage`-based tests
(e.g. `src/timer.test.ts`) throw locally; those same tests pass on CI's Node 22.

## Frontend theming

Color themes are driven by a `data-theme` attribute on `<html>`
(`light` / `dark`, absent = follow the OS). `frontend/src/theme.ts` reads/writes
the choice (localStorage) and applies it; the toggle lives in the Today-screen
profile popup (`frontend/src/components/ProfileMenu.tsx`).
