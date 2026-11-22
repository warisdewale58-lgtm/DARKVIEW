# Dark View store

Static store (`index.html`, `data.json`, `images/`) plus three Vercel serverless routes in `api/` that power the admin dashboard: the AI assistant, saving changes, and photo upload.

The site works with no configuration at all — the storefront is fully self-contained in `index.html`. The environment variables below are only needed for the **Admin** panel (publishing changes, uploading photos, the AI assistant).

## Set up on Vercel
1. Import this GitHub repo into Vercel.
2. On the import screen leave **Framework Preset: Other**, **Build Command** empty, **Output Directory** empty and **Root Directory** empty. `vercel.json` already pins this (`framework: null`, no build, static root), so the site deploys as plain files and `api/*.js` becomes Serverless Functions.

   > If the deployed URL shows `404: NOT_FOUND`, the project is almost always pointed at the wrong directory: check that **Root Directory** is empty (not `.` or a subfolder) and that the project's Production Branch is `main`.
3. Project → Settings → Environment Variables, add:
   - `GITHUB_REPO`: `owner/repo` of this repo — `warisdewale58-lgtm/DARKVIEW`
   - `GITHUB_TOKEN`: a fine-grained token for THIS repo only, permission "Contents: Read and write" (lets the admin save changes and photos)
   - `ANTHROPIC_API_KEY`: from console.anthropic.com (powers the AI assistant; optional)
   - optional: `GITHUB_BRANCH` (default `main`), `ANTHROPIC_MODEL` (default `claude-sonnet-4-5`)
4. Redeploy once so the variables apply.

Without `GITHUB_TOKEN` / `GITHUB_REPO` the storefront still loads and the admin area still unlocks, but **Publish changes**, **photo upload** and the **AI assistant** answer with a "not configured" / GitHub error instead of saving.

## How it works
- Open the site, tap **Admin**, enter the password (default `Darkview2026`; change it first thing in Settings).
- Edit products, prices, delivery, text, or ask the AI. Press **Publish changes**: the change is committed to `data.json` and Vercel redeploys in about a minute.
- Uploaded photos are committed to `images/` (shrunk to 1400px). They appear after the redeploy.
- The API checks the admin password on the server for every action.

## Limits
- Orders and the leaderboard need a database and are not active here (customers still order through WhatsApp / bank transfer).
- Video upload is not supported; paste a video link instead.
- `data.json` is public and holds the password hash, so use a long password.

## Troubleshooting
| What you see | Cause | Fix |
| --- | --- | --- |
| `404: NOT_FOUND` on the deployment URL | Wrong Root Directory or a failed build, so no files were published | Settings → General → Root Directory empty; then Redeploy |
| `GITHUB_TOKEN is not set on Vercel.` | API env var missing | Add it in Settings → Environment Variables, then Redeploy |
| `GitHub cannot find owner/repo on branch main.` | `GITHUB_REPO` wrong, `GITHUB_BRANCH` not `main`, or the token has no access | Set `GITHUB_REPO=warisdewale58-lgtm/DARKVIEW`, `GITHUB_BRANCH=main`, re-issue the token with Contents: read and write |
| `GitHub refused the save (401/403)` | Token expired or lacks Contents write | Re-issue the fine-grained token for this repo |
| `The site changed while you were editing.` | Someone else saved `data.json` first | Reload the page and publish again |
| AI answers with `The AI service returned 404` | `ANTHROPIC_MODEL` is not a model your key can use | Set `ANTHROPIC_MODEL` to a valid model id, e.g. `claude-sonnet-4-5` |
