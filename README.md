# Nora Callahan — Data Analyst Portfolio

A portfolio site built to the spec in `Vision.md`: pure HTML/CSS for
almost everything, with one small, isolated exception — a bit of
JavaScript for the chat interaction specifically (async sending, a
typing indicator, message animations; see §2 below for exactly why
that one part needed it) — plus a single Cloudflare Worker on the
backend for the AI chat, its conversation memory, and Telegram
notifications, serving the static site via Workers Static Assets.

All the personal content in here — the name, bio, FAQ answers, and all
eight projects — is realistic **placeholder** content for you to
replace. Nothing here is real client work.

---

## 1. Project structure

```
public/
  index.html                 the whole site — one page
  styles.css                 all styling and every interaction's CSS
  chat.js                    the one JS file on the site — chat only, see §2
src/
  index.js                   Worker entry point — routes /api/ask, /api/history, and /chat; everything else falls through to the static files
  ask-handler.js             handles the chat form submission (JSON reply for chat.js, full-page redirect as a no-JS fallback)
  history-handler.js         lets chat.js restore a conversation already in progress (e.g. after a refresh)
  chat-page-handler.js       renders the conversation so far — the no-JS fallback path (GET /chat)
  session.js                 cookie-based session id + KV read/write helpers
  scheduled.js               the cron job that closes out quiet conversations
  context.js                 EDIT THIS: what the AI knows about you
  telegram.js                sends the full-conversation digest
  render.js                  splices the chat history into a copy of index.html (fallback path only)
wrangler.toml                 Cloudflare config (entry point, assets, AI + KV bindings, cron)
package.json
```

**A note on Cloudflare Pages vs. Workers:** this was originally built
against Cloudflare Pages Functions, but Cloudflare has been folding
Pages into a unified **Workers + Static Assets** model, and that's
what this project now targets — a single Worker (`src/index.js`) that
serves `public/` as static files and only runs code for its dynamic
routes. If your Cloudflare dashboard project runs `wrangler deploy`
(not `wrangler pages deploy`), this is the right model for it.

## 2. How the interactivity works — one JS file, everything else without it

Every feature *except the chat* — the FAQ accordion, the FAQ ↔ chat
visibility toggle, category filtering, and the project detail view —
is built from native HTML controls (`<details>`, radio buttons)
combined with the modern CSS `:has()` selector, which lets an element
react to a descendant's state, with zero JavaScript. There's a full
explanation of the mechanism at the top of `public/styles.css`, and
inline comments at each `:has()` rule.

**`public/chat.js`** is the one exception, and it's deliberately small
and scoped to only the chat form — it never touches the FAQ, filter,
or project-detail markup. It exists because a handful of things are
genuinely impossible in pure CSS/HTML, not just inconvenient: sending
a message without reloading the whole page, showing a "typing…"
indicator while the model is still working (CSS can't react to an
in-flight request it has no way to observe), animating a new message
into place as its own event, growing the input box as you type more
than one line, and keeping focus in the input after sending. It's also
what keeps the chat panel open once you've opened it, regardless of
what you click inside it (a message bubble, empty space) — only the
return-to-FAQ button closes it — since that needed a real, persistent
bit of state (a checked radio) that only JS can set outside of a full
page reload. See the comment at the top of that file for the full
reasoning on all of these.

**Progressive enhancement, not a hard dependency:** the chat `<form>`
still has a real `action="/api/ask" method="POST"` and works
completely on its own — a full page reload per message — if
`chat.js` fails to load or JavaScript is disabled. `src/ask-handler.js`
serves both paths from the same endpoint, branching on the request's
`Accept` header: `chat.js`'s `fetch()` calls ask for
`application/json` and get a fast `{ answer }` reply; a plain HTML
form submission gets the old redirect-based full-page flow instead
(`src/chat-page-handler.js`) — so the site keeps working even if this
one script doesn't run.

Worth knowing if you're editing this:

- **The FAQ items** all share `name="faq-accordion"`, which is a real,
  fairly recent native HTML feature: the browser itself enforces "only
  one open at a time." The one thing that's genuinely not possible
  without JavaScript — and this part deliberately stays JS-free, so
  the limitation stands — is closing the open item when you click
  *anywhere else on the page*; there's no CSS selector for "a click
  happened outside this element" (see the comment above `.faq-list`).
- **The return-to-FAQ button** is a sibling of the chat panel, not
  nested inside it — see the HTML comment above it. It fades in and
  out on the same trigger as the panel (so the two appear together),
  but floats above it as its own independent element.
- **The before/after image comparisons** (used on a couple of
  projects) are a looping `clip-path` + `animation` pair — no
  interaction needed, it just plays.
- **The download buttons'** falling-arrow loop on click (the arrow
  drops through the baseline and a new one drops in from above to
  replace it) is a fixed confirmation animation, not a progress bar —
  pure CSS genuinely cannot observe a real file download's progress.

## 3. How the chat remembers a conversation

This is the part worth understanding before you deploy, since it's the
most involved piece of the backend. The storage mechanism below needs
no JavaScript at all — it's built on cookies and server-side storage;
`public/chat.js` (see §2) only changes *how* a turn gets delivered to
the page, not how the conversation is remembered.

**The problem:** a static page can't remember anything on its own, and
without JavaScript there's no `fetch()`, no `localStorage`, nothing
running in the browser between form submissions. The only piece of
state a plain HTML site can lean on is an **HTTP cookie** — the
browser sends it back automatically on every request, including a
plain form submission or a `fetch()` call, with or without JavaScript
involved.

**How it works:**

1. The first time someone asks a question, the Worker generates a
   random session id and sets it as a cookie (`src/session.js`).
2. Their conversation (every question and answer) is stored server-side
   in **Workers KV**, keyed by that session id — this is the
   "temporary storage in Cloudflare" the chat needs so the *model*
   can see prior turns too, not just so the page can display them.
3. `POST /api/ask` now answers in one of two ways (see §2): `chat.js`
   gets a fast JSON `{ answer }` reply and updates the page itself. A
   plain HTML form submission (no JS) instead gets **redirected** to
   `GET /chat`, which reads that session's history from KV and renders
   the whole conversation. That redirect exists to fix a real bug:
   this project used to render the answer directly in response to the
   POST, which meant *refreshing* the result page made the browser
   resubmit that same question. A GET page can be refreshed safely —
   nothing gets resubmitted or duplicated (the standard
   "Post/Redirect/Get" pattern). `GET /api/history` serves the same
   stored conversation as JSON, so `chat.js` can restore it into view
   after a refresh too, without needing the redirect dance.
4. Each new question sends the model the recent conversation as real
   context (capped at the last 12 messages — see
   `MAX_MESSAGES_FOR_MODEL` in `src/session.js` — so a long chat
   doesn't blow past the model's context window), so it can answer in
   a way that's actually aware of what was already asked.

**On "delete when the visitor closes or refreshes the site":** a
server genuinely cannot know the instant a browser tab closes without
JavaScript running in that tab to tell it — there is no HTTP event for
that. Two honest, deliberate design choices stand in for it:

- The session cookie has **no expiry date**, which makes it a browser
  *session cookie* — the browser discards it when it's actually
  closed. This is the closest native equivalent available.
- A **refresh does not delete the conversation.** It didn't seem right
  to actually implement that literally once fixing the resubmission
  bug meant refreshing was safe anyway — losing your whole
  conversation (and the model losing its context) to an accidental F5
  seemed like a worse experience than what you were really asking to
  fix, which was the duplicate-question bug. That bug is fixed; the
  conversation now just survives a refresh the way you'd probably want
  it to.
- Actual cleanup happens on a **schedule** (`src/scheduled.js`, every
  10 minutes by default): any conversation that's gone **20 minutes**
  without a new question is treated as over. Its full transcript is
  sent to Telegram as one message, then it's deleted from KV. This
  replaces sending you a Telegram message per question — you now get
  one message per finished conversation instead.

If none of this KV setup is done (see §5 below), the chat still works
fine — it just answers each question without memory of earlier ones in
the same conversation, the same as before.

## 4. Deploying

You'll need a free Cloudflare account.

**From the command line (simplest):**

```
npm install
npx wrangler login
npx wrangler deploy
```

This uploads `public/` as static assets and deploys `src/index.js` as
the Worker that runs alongside them, on a
`<name>.<your-subdomain>.workers.dev` URL (or connect a custom domain
afterward in the dashboard).

**From a Git-connected dashboard project:** if your Cloudflare project
already runs a deploy command (as in your build log), just make sure
it's `npx wrangler deploy` — that's what this config is built for.
Push this project's files (including `wrangler.toml` and `src/`) to
the connected repo and it should pick this up on the next deploy.

## 5. Connecting Workers AI (for the chat to actually answer)

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

## 6. Connecting KV (for conversation memory)

Unlike AI, a KV namespace is account-specific, so there's no valid id
that could ship inside `wrangler.toml` — you create it once yourself:

```
npx wrangler kv namespace create CHAT_SESSIONS
```

This prints an id. Open `wrangler.toml`, find the `[[kv_namespaces]]`
block near the bottom, and replace `REPLACE_WITH_YOUR_KV_NAMESPACE_ID`
with that id. Redeploy.

(If you'd rather use the dashboard: **Storage & Databases → KV →
Create namespace**, name it anything, copy its id, paste it the same
way.)

## 7. Connecting Telegram notifications

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
   sending digests (see `src/telegram.js`).

You'll get one Telegram message per conversation, sent within about 10
minutes of the visitor going quiet (see §3 above) — not one per
question.

## 8. Editing content

- **Name, title, bio, FAQ, contact links:** edit directly in
  `public/index.html` — it's plain, readable markup, organized into
  the three strips with comments marking each section.
- **What the AI chat knows about you:** edit `src/context.js`. This is
  separate from the visible FAQ text because it's what gets fed to the
  model as background — update it with real specifics (experience,
  policies, tone) for better answers.
- **Contact links:** the icons at the bottom of the info strip
  currently point to placeholder URLs (`replace-with-your-username`,
  a placeholder WhatsApp number, etc.) — search `public/index.html`
  for `replace` to find all of them.

## 9. Adding a 9th (or more) project

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

## 10. Downloads

The "Download Raw Data" / "Download Processed Data" buttons on each
project's detail view link to `/downloads/0N-raw-data.csv` and
`/downloads/0N-processed-data.csv`. Add real files at those paths
(a `downloads/` folder inside `public/`) before pointing clients at
the live site — right now they're placeholder links.

## 11. Possible future enhancements

Not implemented, to keep this focused on the spec, but worth
considering later:

- **Bot/spam protection** on `/api/ask` (e.g. Cloudflare Turnstile or
  a Workers rate-limiting rule) if the chat gets abused.
- **Shortening the inactivity window** (currently 20 minutes, in
  `src/scheduled.js`) if you'd like Telegram digests sooner after a
  conversation ends, or the cron frequency (currently every 10
  minutes, in `wrangler.toml`).
- **R2 storage** for the raw/processed data downloads instead of static
  files, if datasets get large.
