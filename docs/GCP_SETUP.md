# GCP + deployment setup

> **Status (2026-07-18): all infrastructure below is already provisioned** in
> project `intricate-reef-424222-d6` (Firestore, service accounts, Workload
> Identity Federation, Secret Manager, GitHub variables), the app is deployed to
> Cloud Run, and the routine is seeded. The **only remaining step is creating the
> Google OAuth client** — see [Remaining: create the OAuth client](#remaining-create-the-oauth-client)
> at the bottom. The rest of this document is the full reproducible guide.

Live URL: **https://workout-log-qectzihgmq-ew.a.run.app**

One-time setup to run the app on **Cloud Run + Firestore** (both within GCP's
always-free tier for a single user). Commands assume your project
`intricate-reef-424222-d6`; change `PROJECT` / `REGION` if needed.

```bash
export PROJECT=intricate-reef-424222-d6
export REGION=europe-west1
export SERVICE=workout-log
gcloud config set project "$PROJECT"
```

## 1. Enable APIs

```bash
gcloud services enable \
  run.googleapis.com \
  firestore.googleapis.com \
  cloudbuild.googleapis.com \
  artifactregistry.googleapis.com \
  secretmanager.googleapis.com \
  iamcredentials.googleapis.com
```

## 2. Create the Firestore database (Native mode)

```bash
gcloud firestore databases create --location="$REGION" --type=firestore-native
```

## 3. Create the Google OAuth client (for "Sign in with Google")

This part is in the Cloud Console (no CLI):

1. **APIs & Services → OAuth consent screen** → External → fill app name +
   your email. Under *Test users* add **goncalo.mestre1998@gmail.com**
   (keeping the app in "Testing" is fine — only test users can sign in, which
   is exactly the single-user restriction we want).
2. **APIs & Services → Credentials → Create credentials → OAuth client ID →
   Web application**.
   - Authorized redirect URI: you'll get the Cloud Run URL after the first
     deploy (step 6). For now put a placeholder; you'll come back and set
     `https://SERVICE-xxxx.a.run.app/auth/callback`.
3. Copy the **Client ID** and **Client secret**.

## 4. Store secrets in Secret Manager

```bash
# OAuth client secret from step 3:
printf '%s' 'YOUR_OAUTH_CLIENT_SECRET' | gcloud secrets create GOOGLE_CLIENT_SECRET --data-file=-

# A random session-signing key:
openssl rand -base64 48 | tr -d '\n' | gcloud secrets create SESSION_SECRET --data-file=-
```

Grant the Cloud Run runtime service account access to them (the default compute
SA is used unless you set another):

```bash
export RUNTIME_SA="$(gcloud projects describe "$PROJECT" --format='value(projectNumber)')-compute@developer.gserviceaccount.com"
for S in GOOGLE_CLIENT_SECRET SESSION_SECRET; do
  gcloud secrets add-iam-policy-binding "$S" \
    --member="serviceAccount:$RUNTIME_SA" --role=roles/secretmanager.secretAccessor
done
# The runtime SA also needs Firestore access:
gcloud projects add-iam-policy-binding "$PROJECT" \
  --member="serviceAccount:$RUNTIME_SA" --role=roles/datastore.user
```

## 5. Workload Identity Federation (keyless deploys from GitHub Actions)

```bash
# Deploy service account
gcloud iam service-accounts create gh-deployer --display-name="GitHub Actions deployer"
export DEPLOY_SA="gh-deployer@$PROJECT.iam.gserviceaccount.com"

# Roles it needs to build + deploy
for R in roles/run.admin roles/cloudbuild.builds.editor roles/artifactregistry.admin \
         roles/storage.admin roles/iam.serviceAccountUser; do
  gcloud projects add-iam-policy-binding "$PROJECT" --member="serviceAccount:$DEPLOY_SA" --role="$R"
done

# Workload Identity pool + GitHub provider
gcloud iam workload-identity-pools create github --location=global --display-name="GitHub"
export POOL_ID="$(gcloud iam workload-identity-pools describe github --location=global --format='value(name)')"

gcloud iam workload-identity-pools providers create-oidc github \
  --location=global --workload-identity-pool=github \
  --display-name="GitHub OIDC" \
  --attribute-mapping="google.subject=assertion.sub,attribute.repository=assertion.repository" \
  --attribute-condition="assertion.repository=='gmestre98/workout-log'" \
  --issuer-uri="https://token.actions.githubusercontent.com"

# Let the GitHub repo impersonate the deploy SA
gcloud iam service-accounts add-iam-policy-binding "$DEPLOY_SA" \
  --role=roles/iam.workloadIdentityUser \
  --member="principalSet://iam.googleapis.com/$POOL_ID/attribute.repository/gmestre98/workout-log"

# This value goes into the GitHub variable WIF_PROVIDER:
gcloud iam workload-identity-pools providers describe github \
  --location=global --workload-identity-pool=github --format='value(name)'
```

## 6. First deploy (to get the URL)

You can deploy the first time locally to learn the service URL:

```bash
gcloud run deploy "$SERVICE" --source . --region "$REGION" --allow-unauthenticated \
  --set-env-vars "WORKOUT_STORE=firestore,GOOGLE_CLOUD_PROJECT=$PROJECT,COOKIE_SECURE=true" \
  --set-secrets "GOOGLE_CLIENT_SECRET=GOOGLE_CLIENT_SECRET:latest,SESSION_SECRET=SESSION_SECRET:latest"
```

Note the URL (e.g. `https://workout-log-xxxx.a.run.app`). Then:

- In the OAuth client (step 3) set the redirect URI to `<URL>/auth/callback`.
- Set the GitHub variable `OAUTH_REDIRECT_URL` to the same value.

## 7. GitHub repo Variables and Secrets

**Settings → Secrets and variables → Actions**

Variables:

| Name | Example |
|------|---------|
| `GCP_PROJECT_ID` | `intricate-reef-424222-d6` |
| `GCP_REGION` | `europe-west1` |
| `SERVICE_NAME` | `workout-log` |
| `WIF_PROVIDER` | output of step 5 |
| `DEPLOY_SA` | `gh-deployer@intricate-reef-424222-d6.iam.gserviceaccount.com` |
| `GOOGLE_CLIENT_ID` | your OAuth client ID |
| `ALLOWED_EMAIL` | `goncalo.mestre1998@gmail.com` |
| `OAUTH_REDIRECT_URL` | `https://workout-log-xxxx.a.run.app/auth/callback` |

Secrets (`GOOGLE_CLIENT_SECRET`, `SESSION_SECRET`) live in **Secret Manager**
(step 4); the workflow reads them from there, so nothing else is needed in
GitHub. After this, every push to `main` deploys automatically.

## 8. Seed your routine

```bash
gcloud auth application-default login
cd scripts && npm ci
GOOGLE_CLOUD_PROJECT=$PROJECT npm run seed
```

This loads your 12 July exercises. Add `-- --force` to overwrite.

---

## Remaining: create the OAuth client

This is the only step that can't be scripted (Google has no API to create a
web OAuth client on a personal, org-less project). In the Cloud Console:

1. **APIs & Services → OAuth consent screen**
   - User type: **External** → Create.
   - App name: `Workout Log`; user support email + developer email: your Gmail.
   - Scopes: leave the defaults (email, profile, openid — no verification needed).
   - **Test users → Add** `goncalo.mestre1998@gmail.com`. Keeping the app in
     *Testing* is the single-user lock: only listed test users can sign in.
   - Save.

2. **APIs & Services → Credentials → Create credentials → OAuth client ID**
   - Application type: **Web application**, name `Workout Log`.
   - **Authorized redirect URI:**
     `https://workout-log-qectzihgmq-ew.a.run.app/auth/callback`
   - Create, then copy the **Client ID** and **Client secret**.

3. Wire the values in (from a terminal with `gcloud` + `gh`):

   ```bash
   # real client secret into Secret Manager (adds a new version)
   printf '%s' 'PASTE_CLIENT_SECRET' | \
     gcloud secrets versions add GOOGLE_CLIENT_SECRET --data-file=- \
     --project=intricate-reef-424222-d6

   # client ID as a GitHub Actions variable
   gh variable set GOOGLE_CLIENT_ID --repo gmestre98/workout-log --body 'PASTE_CLIENT_ID'
   ```

4. Redeploy so the new values take effect:

   ```bash
   gh workflow run Deploy --repo gmestre98/workout-log
   ```

5. Open **https://workout-log-qectzihgmq-ew.a.run.app** and **Sign in with
   Google**. Add it to your phone home screen (Share → Add to Home Screen) to
   install the PWA.

`OAUTH_REDIRECT_URL`, `ALLOWED_EMAIL`, and all other variables/secrets are
already set.

