[Uploading README.md…]()
# Nora Callahan — Data Analyst Portfolio

A portfolio site built to the spec in `Vision.md`: pure HTML/CSS on the
frontend (no client-side JavaScript, anywhere) and a single Cloudflare
Worker on the backend for the AI chat and Telegram notifications,
serving the static site via Workers Static Assets.

All the personal content in here — the name, bio, FAQ answers, and all
eight projects — is realistic **placeholder** content for you to
replace. Nothing here is real client work.

---

## 1. Project structure

```
public/
  index.html                 the whole site — one page
  styles.css                 all styling and every interaction's CSS
src/
  index.js                   Worker entry point — routes /api/ask, everything else falls through to the static files
  ask-handler.js             handles the chat form submission
  context.js                 EDIT THIS: what the AI knows about you
  telegram.js                Telegram notification helper
  render.js                  splices the chat answer into a copy of index.html
wrangler.toml                 Cloudflare config (entry point, assets folder, AI binding)
package.json
```

**A note on Cloudflare Pages vs. Workers:** this was originally built
against Cloudflare Pages Functions, but Cloudflare has been folding
Pages into a unified **Workers + Static Assets** model, and that's
what this project now targets — a single Worker (`src/index.js`) that
serves `public/` as static files and only runs code for the one
dynamic route, `/api/ask`. If your Cloudflare dashboard project runs
`wrangler deploy` (not `wrangler pages deploy`), this is the right
model for it.

## 2. How the interactivity works with zero JavaScript

Every dynamic behaviour — the FAQ drawer, the FAQ ↔ chat transition,
category filtering, and the project detail view — is built from native
HTML controls (`<details>`, radio buttons) combined with the modern
CSS `:has()` selector, which lets an element react to a descendant's
state. There's a full explanation of the mechanism at the top of
`public/styles.css`, and inline comments at each `:has()` rule.

The one deliberately-documented limitation: the live chat-preview panel
opens as soon as you focus the question field (via `:focus`), and if
you click away *before* submitting and *without* pressing the
"return to FAQ" arrow, it closes again — because pure CSS has no way to
pin a state open independent of focus without a real form submission.
Once a question is actually submitted, the Worker re-renders the page
with the chat panel held open by a checked radio, which has no such
limitation.

## 3. Deploying

You'll need a free Cloudflare account.

**From the command line (simplest):**

```
npm install
npx wrangler deploy
```

The first time, Wrangler will prompt you to log in. This uploads
`public/` as static assets and deploys `src/index.js` as the Worker
that runs alongside them, on a `<name>.<your-subdomain>.workers.dev`
URL (or connect a custom domain afterward in the dashboard).

**From a Git-connected dashboard project:** if your Cloudflare project
already runs a deploy command (as in your build log), just make sure
it's `npx wrangler deploy` — that's what this config is built for.
Push this project's files (including `wrangler.toml` and `src/`) to
the connected repo and it should pick this up on the next deploy.

## 4. Connecting Workers AI (for the chat to actually answer)

`wrangler.toml` already declares the binding, which should attach
automatically on deploy. If the chat responds with the "AI chat isn't
connected yet" fallback message, add it manually:

**Worker → Settings → Bindings → Add → Workers AI**, variable name
`AI`. Redeploy.

The model used is set in `src/ask-handler.js`
(`@cf/meta/llama-3.1-8b-instruct-fast` at the time of writing — a
small, fast instruct model well suited to short FAQ answers). Browse
**Workers AI → Models** in the dashboard for other options and swap
the `MODEL` constant if you'd like a different one. Workers AI has a
monthly free allocation; check current limits on your dashboard's
Workers AI page if you expect meaningful traffic.

## 5. Connecting Telegram notifications

1. Message **@BotFather** on Telegram, send `/newbot`, follow the
   prompts. You'll get a token that looks like `123456:ABC-...`.
2. Send your new bot any message (it can't message you first).
3. Visit `https://api.telegram.org/bot<YOUR_TOKEN>/getUpdates` in a
   browser — your chat id is the number at `result[0].message.chat.id`.
4. In the Cloudflare dashboard: **Worker → Settings → Variables and
   Secrets**, add two **secret** (encrypted) variables:
   - `TELEGRAM_BOT_TOKEN`
   - `TELEGRAM_CHAT_ID`
   Or via CLI: `npx wrangler secret put TELEGRAM_BOT_TOKEN`.
5. Redeploy. Until these are set, the site works fine — it just skips
   sending the notification (see `src/telegram.js`).

## 6. Editing content

- **Name, title, bio, FAQ, contact links:** edit directly in
  `public/index.html` — it's plain, readable markup, organized into
  the three strips with comments marking each section.
- **What the AI chat knows about you:** edit `src/context.js`. This is
  separate from the visible FAQ text because it's what gets fed to the
  model as background — update it with real specifics (experience,
  policies, tone) for better answers.
- **Contact links:** the four icons at the bottom of the info strip
  currently point to placeholder URLs (`replace-with-your-username`,
  etc.) — search `public/index.html` for `replace` to find all of them.

## 7. Adding a 9th (or more) project

Projects intentionally don't reflow or resize as you add more — the
grid stays a fixed 2-column × 4-row frame and scrolls internally past
that, per the design brief. To add one:

1. In `public/index.html`, copy one
   `<label class="project-card">…</label>` block, give its radio a new
   id (`project-9`), and update `data-cat`.
2. Copy one `<div class="detail-panel" id="detail-N">…</div>` block,
   change its id to `detail-9` and its close radio's id to `close-9`.
3. In `public/styles.css`, add `#project-9:checked) #detail-9` (desktop
   rule) and the matching line in the mobile media query — both spots
   are marked with a comment where the existing eight are listed.

## 8. Downloads

The "Download Raw Data" / "Download Processed Data" buttons on each
project's detail view link to `/downloads/0N-raw-data.csv` and
`/downloads/0N-processed-data.csv`. Add real files at those paths
(a `downloads/` folder inside `public/`) before pointing clients at
the live site — right now they're placeholder links.

## 9. Possible future enhancements

Not implemented, to keep this focused on the spec, but worth
considering later:

- **Bot/spam protection** on `/api/ask` (e.g. Cloudflare Turnstile or
  a Workers rate-limiting rule) if the chat gets abused.
- **Multi-turn memory** — right now each submission is a single
  question/answer with no memory of earlier turns in the same visit;
  threading prior Q&A through hidden form fields would extend this.
- **R2 storage** for the raw/processed data downloads instead of static
  files, if datasets get large.
