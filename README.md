# Dark View store

Static store (`index.html`, `data.json`, `images/`) plus three Vercel serverless routes in `api/` that power the admin dashboard: the AI assistant, saving changes, and photo upload.

## Set up on Vercel
1. Import this GitHub repo into Vercel (Framework: Other, no build command).
2. Project → Settings → Environment Variables, add:
   - `ANTHROPIC_API_KEY`: from console.anthropic.com (powers the AI assistant)
   - `GITHUB_TOKEN`: a fine-grained token for THIS repo only, permission "Contents: Read and write" (lets the admin save changes and photos)
   - `GITHUB_REPO`: `owner/repo` of this repo (e.g. `Waris33-3/DARKVIEW`)
   - optional: `GITHUB_BRANCH` (default `main`), `ANTHROPIC_MODEL`
3. Redeploy once so the variables apply.

## How it works
- Open the site, tap **Admin**, enter the password (default `Darkview2026`; change it first thing in Settings).
- Edit products, prices, delivery, text, or ask the AI. Press **Publish changes**: the change is committed to `data.json` and Vercel redeploys in about a minute.
- Uploaded photos are committed to `images/` (shrunk to 1400px). They appear after the redeploy.
- The API checks the admin password on the server for every action.

## Limits
- Orders and the leaderboard need a database and are not active here (customers still order through WhatsApp / bank transfer).
- Video upload is not supported; paste a video link instead.
- `data.json` is public and holds the password hash, so use a long password.
