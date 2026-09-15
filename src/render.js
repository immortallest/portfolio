/**
 * src/render.js
 * ----------------------------------------------------------------------
 * There is no templating engine on the frontend by design (pure
 * HTML/CSS, no build step). Instead, src/chat-page-handler.js fetches
 * the REAL static index.html via the Worker's ASSETS binding and
 * performs two small, targeted string replacements on it:
 *
 *   1. Mark the #mode-chat radio as checked, so the chat panel renders
 *      open on the page the Worker returns (see public/styles.css — the
 *      panel opens via :has(#chat-input:focus, #mode-chat:checked)).
 *   2. Insert every stored message bubble, in order, just before the
 *      <!--CHAT_LOG_END--> marker inside #chat-log — so the visitor
 *      sees the whole conversation so far, not just the latest answer.
 *
 * Keeping this as string surgery on the one real template (rather than
 * a second, duplicated copy of the page) means the chat result page
 * can never visually drift from the real site.
 * ----------------------------------------------------------------------
 */

const MODE_CHAT_MARKER = 'id="mode-chat" class="sr-only-input" tabindex="-1" aria-hidden="true"';
const CHAT_LOG_MARKER = "<!--CHAT_LOG_END-->";

/** Escapes text for safe insertion into HTML (prevents markup/script injection). */
export function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Takes the static page's HTML and returns a copy with the chat panel
 * pinned open and the full message history rendered into the chat log.
 * `messages` is an array of { role: "user" | "assistant", content }.
 */
export function renderChatHistory(html, messages) {
  if (!html.includes(MODE_CHAT_MARKER)) {
    throw new Error("render.js: mode-chat marker not found — did index.html change?");
  }
  if (!html.includes(CHAT_LOG_MARKER)) {
    throw new Error("render.js: chat-log marker not found — did index.html change?");
  }

  let out = html.replace(MODE_CHAT_MARKER, `${MODE_CHAT_MARKER} checked`);

  const bubblesHtml = (messages || [])
    .map((m) => {
      const cls = m.role === "user" ? "chat-bubble--user" : "chat-bubble--assistant";
      return `<div class="chat-bubble ${cls}"><p>${escapeHtml(m.content)}</p></div>`;
    })
    .join("");

  out = out.replace(CHAT_LOG_MARKER, bubblesHtml + CHAT_LOG_MARKER);

  return out;
}
