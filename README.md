# Nora Callahan — Data Analyst Portfolio

A portfolio site built to the spec in `Vision.md`: pure HTML/CSS on the
frontend (no client-side JavaScript, anywhere) and a Cloudflare Pages
Function (a Worker) on the backend for the AI chat and Telegram
notifications.

All the personal content in here — the name, bio, FAQ answers, and all
eight projects — is realistic **placeholder** content for you to
replace. Nothing here is real client work.

---

## 1. Project structure

```
index.html                   the whole site — one page
styles.css                   all styling and every interaction's CSS
functions/
  api/
    ask.js                   POST /api/ask — handles the chat form
  _context.js                EDIT THIS: what the AI knows about you
  _telegram.js                Telegram notification helper
  _render.js                  splices the chat answer into a copy of index.html
wrangler.toml                 Cloudflare config (Workers AI binding, etc.)
```

Anything in `functions/` starting with `_` is a shared module, not a
route — Cloudflare Pages only turns non-underscore files into URLs.

## 2. How the interactivity works with zero JavaScript

Every dynamic behaviour — the FAQ drawer, the FAQ ↔ chat transition,
category filtering, and the project detail view — is built from native
HTML controls (`<details>`, radio buttons) combined with the modern
CSS `:has()` selector, which lets an element react to a descendant's
state. There's a full explanation of the mechanism at the top of
`styles.css`, and inline comments at each `:has()` rule.

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

1. **Push this folder to a GitHub repo** (or use direct upload — see
   step 2's alternative).
2. In the Cloudflare dashboard: **Workers & Pages → Create → Pages →
   Connect to Git**, pick the repo. Build settings: no build command,
   output directory `/` (this is a static site with no build step).
   - *Alternative without Git:* `npx wrangler pages deploy .` from
     this folder deploys directly from your machine.
3. Cloudflare will detect the `functions/` folder automatically and
   deploy it as Pages Functions — no extra step needed for that part.

## 4. Connecting Workers AI (for the chat to actually answer)

`wrangler.toml` already declares the binding, which should attach
automatically on deploy. If the chat responds with the "AI chat isn't
connected yet" fallback message, add it manually:

**Pages project → Settings → Bindings → Add → Workers AI**, variable
name `AI`. Redeploy.

The model used is set in `functions/api/ask.js`
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
4. In the Cloudflare dashboard: **Pages project → Settings →
   Environment variables**, add two **secret** (encrypted) variables:
   - `TELEGRAM_BOT_TOKEN`
   - `TELEGRAM_CHAT_ID`
   Or via CLI: `npx wrangler pages secret put TELEGRAM_BOT_TOKEN`.
5. Redeploy. Until these are set, the site works fine — it just skips
   sending the notification (see `functions/_telegram.js`).

## 6. Editing content

- **Name, title, bio, FAQ, contact links:** edit directly in
  `index.html` — it's plain, readable markup, organized into the three
  strips with comments marking each section.
- **What the AI chat knows about you:** edit `functions/_context.js`.
  This is separate from the visible FAQ text because it's what gets
  fed to the model as background — update it with real specifics
  (experience, policies, tone) for better answers.
- **Contact links:** the four icons at the bottom of the info strip
  currently point to placeholder URLs (`replace-with-your-username`,
  etc.) — search `index.html` for `replace` to find all of them.

## 7. Adding a 9th (or more) project

Projects intentionally don't reflow or resize as you add more — the
grid stays a fixed 2-column × 4-row frame and scrolls internally past
that, per the design brief. To add one:

1. In `index.html`, copy one `<label class="project-card">…</label>`
   block, give its radio a new id (`project-9`), and update `data-cat`.
2. Copy one `<div class="detail-panel" id="detail-N">…</div>` block,
   change its id to `detail-9` and its close radio's id to `close-9`.
3. In `styles.css`, add `#project-9:checked) #detail-9` (desktop rule)
   and the matching line in the mobile media query — both spots are
   marked with a comment where the existing eight are listed.

## 8. Downloads

The "Download Raw Data" / "Download Processed Data" buttons on each
project's detail view link to `/downloads/0N-raw-data.csv` and
`/downloads/0N-processed-data.csv`. Add real files at those paths (a
`downloads/` folder at the project root) before pointing clients at
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
