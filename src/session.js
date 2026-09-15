/**
 * src/session.js
 * ----------------------------------------------------------------------
 * Identifies a visitor across multiple form submissions using an HTTP
 * cookie — this is the one piece of "state" a no-JS site can rely on,
 * since the browser sends cookies back automatically on every request,
 * including plain HTML form submissions. No JavaScript is involved.
 *
 * The conversation itself is stored server-side in Workers KV, keyed by
 * that session id, so it survives across the multiple page loads a
 * multi-turn conversation involves (ask -> redirect -> GET /chat -> ask
 * again -> ...).
 *
 * WHY A SESSION COOKIE (not a persistent one): it has no Max-Age/Expires,
 * so the browser discards it when the browser itself is closed — the
 * closest native, JS-free equivalent to "this conversation ends when the
 * visitor is done." A page refresh does NOT clear it (refreshing a GET
 * page is supposed to be safe/idempotent — see src/ask-handler.js for how
 * the old "refresh resends the question" bug was fixed), so an accidental
 * refresh doesn't wipe out someone's conversation. The actual cleanup —
 * deleting the stored history and sending you its full transcript on
 * Telegram — happens once a conversation has gone quiet for a while (see
 * src/scheduled.js), since there is no way for a server to know the exact
 * instant a tab was closed without JavaScript running in that tab.
 * ----------------------------------------------------------------------
 */

const COOKIE_NAME = "sid";
export const KV_PREFIX = "session:";

// Hard backstop only. The real cleanup trigger is inactivity, handled by
// the scheduled job in src/scheduled.js — this just guarantees KV won't
// hold a session forever if that job is ever disabled.
const KV_TTL_SECONDS = 3600; // 1 hour

// How many of the most recent messages get sent to the model as
// conversation context. The full history is still stored/shown/reported
// to Telegram — this only trims what's fed into each AI call, so long
// conversations don't blow past the model's context window or balloon
// cost/latency.
export const MAX_MESSAGES_FOR_MODEL = 12;

function parseCookies(request) {
  const header = request.headers.get("Cookie") || "";
  const out = {};
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    out[part.slice(0, eq).trim()] = part.slice(eq + 1).trim();
  }
  return out;
}

/** Reads the session id from the request's Cookie header, if present. */
export function getSessionId(request) {
  return parseCookies(request)[COOKIE_NAME] || null;
}

/**
 * Returns a session id (reusing the existing one if the request already
 * has one) plus a Set-Cookie value to attach to the response when a new
 * id had to be minted.
 */
export function getOrCreateSessionId(request) {
  const existing = getSessionId(request);
  if (existing) return { sessionId: existing, setCookie: null };

  const sessionId = crypto.randomUUID();
  // No Max-Age/Expires on purpose — see the file header comment.
  const setCookie = `${COOKIE_NAME}=${sessionId}; Path=/; HttpOnly; Secure; SameSite=Lax`;
  return { sessionId, setCookie };
}

/** Fetches { messages: [{role, content, time}], lastActive } for a session, or null. */
export async function getHistory(env, sessionId) {
  if (!env.CHAT_SESSIONS || !sessionId) return null;
  const raw = await env.CHAT_SESSIONS.get(KV_PREFIX + sessionId);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed.messages)) return null;
    return parsed;
  } catch {
    return null;
  }
}

/** Persists a session's history, refreshing its TTL. */
export async function saveHistory(env, sessionId, history) {
  if (!env.CHAT_SESSIONS || !sessionId) return;
  await env.CHAT_SESSIONS.put(KV_PREFIX + sessionId, JSON.stringify(history), {
    expirationTtl: KV_TTL_SECONDS,
  });
}

/** Deletes a session's stored history immediately. */
export async function deleteHistory(env, sessionId) {
  if (!env.CHAT_SESSIONS || !sessionId) return;
  await env.CHAT_SESSIONS.delete(KV_PREFIX + sessionId);
}
