# Dark View store

A real multipage storefront. Every page renders from `data.json`, so a Publish from the admin updates the whole site at once.

## Pages

| Route | What it is |
| --- | --- |
| `/` | Home: featured product hero, new arrivals, shop by category, editorial feature, best sellers |
| `/shop` | Full catalogue with category tabs and sort |
| `/shop/tracksuits`, `/shop/tees-and-vests`, `/shop/shorts`, `/shop/accessories` | Category pages |
| `/product/<name>` | Gallery, colours, sizes, add to cart, details accordions, related pieces |
| `/cart` | Full cart with quantity controls, promo code and free-delivery progress |
| `/checkout` | Delivery details, payment choice, order summary |
| `/confirm` | Order confirmation with the WhatsApp handoff |
| `/about`, `/help`, `/orders` | Brand story, FAQs, order tracking |
| `/admin` | Locked admin dashboard. **No link to it anywhere on the public site.** |

## Architecture

- `data.json` is the single source of truth for settings, products, categories, colours and delivery zones.
- `index.html` is the app shell; `assets/app.js` renders each route, `assets/style.css` is the design system, `assets/admin.js` is the dashboard, and `assets/fonts/` holds the self-hosted fonts.
- `admin/index.html` + `assets/admin.css` are the `/admin` page, rewriten by `vercel.json`.
- Publishing writes **only `data.json`** via `/api/save` — no HTML rebuild. Vercel redeploys and every page picks up the change.
- Serverless routes in `api/` power the admin: `unlock`, `save`, `upload`, `ai`.

## Set up on Vercel

1. Import this GitHub repo into Vercel.
2. Leave **Framework Preset: Other**, **Build Command** empty, **Output Directory** empty, **Root Directory** empty. `vercel.json` pins this.
3. Project → Settings → Environment Variables:
   - `GITHUB_REPO`: `warisdewale58-lgtm/DARKVIEW`
   - `GITHUB_TOKEN`: fine-grained token for THIS repo, permission **Contents: Read and write**
   - `ANTHROPIC_API_KEY`: optional, powers the AI assistant
4. Redeploy once so the variables apply.

Without `GITHUB_TOKEN` / `GITHUB_REPO` the storefront still works, but **Publish changes**, **photo upload** and the **AI assistant** answer with a "not configured" error.

## Admin

- Staff sign in only at `/admin` — there is deliberately no link from the storefront.
- Password is verified on the server against a **salted scrypt hash** in GitHub; the browser never sees a usable hash.
- Every admin API route enforces the password plus a **per-IP rate limit** (8 failures / 15 minutes, 30-minute ban).
- Change the password under **Settings → Admin password**, then press **Publish changes**. The server hashes it with scrypt before saving.

## Cart & checkout

Real cart persisted in `localStorage`: add to cart from any page, mini-bag drawer, quantity steppers with stock guards, remove, promo code (`DARKVIEW10`), free-delivery progress, full cart page, validated checkout, order number and an itemised WhatsApp message. Payment by bank transfer or pay on delivery; delivery is Abuja-only (₦2,500, free over ₦100,000).

## Limits

- Orders and the live leaderboard need a database and are not active yet (customers order through WhatsApp / bank transfer).
- Video upload is not supported; paste a video link instead.
- `data.json` is public and holds the salted password hash — it cannot be reversed, but keep the password long and private.
- The rate limit is per serverless instance/region (in-memory). For a hard global limit, put the site behind Vercel WAF or Cloudflare.

## Troubleshooting

| What you see | Cause | Fix |
| --- | --- | --- |
| `404: NOT_FOUND` on the deployment URL | Wrong Root Directory | Settings → General → Root Directory empty; then Redeploy |
| `GITHUB_TOKEN is not set on Vercel.` | API env var missing | Add it in Settings → Environment Variables, then Redeploy |
| `GitHub cannot find owner/repo on branch main.` | `GITHUB_REPO` wrong or token has no access | Set `GITHUB_REPO=warisdewale58-lgtm/DARKVIEW`, re-issue token with Contents: read/write |
| `GitHub refused the save (401/403)` | Token expired or lacks write | Re-issue the fine-grained token |
| `The site changed while you were editing.` | Someone else saved `data.json` first | Reload and publish again |
