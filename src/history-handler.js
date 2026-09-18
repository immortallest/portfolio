/**
 * src/history-handler.js
 * ----------------------------------------------------------------------
 * Handles GET /api/history — called by public/chat.js once, on page
 * load, to restore a conversation already in progress (e.g. after a
 * refresh). Returns the full stored message list for the visitor's
 * session, or an empty list if there isn't one.
 *
 * This exists so the visible chat log can't drift from what the model
 * actually remembers: without it, refreshing while JS is enabled would
 * visually reset to just the greeting bubble while the model — via
 * src/session.js's KV-backed history — still remembered the whole
 * conversation, which would make its next answer confusingly reference
 * things no longer on screen.
 * ----------------------------------------------------------------------
 */

import { getSessionId, getHistory } from "./session.js";

export async function handleHistory(request, env) {
  const sessionId = getSessionId(request);
  const history = sessionId ? await getHistory(env, sessionId) : null;

  return new Response(JSON.stringify({ messages: (history && history.messages) || [] }), {
    headers: { "content-type": "application/json" },
  });
}
