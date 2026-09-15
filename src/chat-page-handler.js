/**
 * src/chat-page-handler.js
 * ----------------------------------------------------------------------
 * Handles GET /chat — where src/ask-handler.js redirects to after
 * saving a new answer (see that file's header comment for why this
 * two-step redirect exists). Reads the visitor's session, looks up
 * their stored conversation, and renders it into a copy of the real
 * homepage with the chat panel held open.
 *
 * Because this is a plain GET, refreshing it just re-reads the current
 * state from storage and re-renders the same thing — nothing gets
 * resubmitted or duplicated.
 * ----------------------------------------------------------------------
 */

import { getSessionId, getHistory } from "./session.js";
import { renderChatHistory } from "./render.js";

export async function handleChatPage(request, env) {
  const sessionId = getSessionId(request);
  const history = sessionId ? await getHistory(env, sessionId) : null;

  if (!history || !history.messages || !history.messages.length) {
    // No active conversation (expired, never started, or cookies blocked)
    // — nothing to show, so send them to the normal homepage instead of a
    // blank/broken chat view.
    return Response.redirect(new URL("/", request.url), 303);
  }

  const assetResponse = await env.ASSETS.fetch(new URL("/", request.url));
  const html = await assetResponse.text();
  const rendered = renderChatHistory(html, history.messages);

  return new Response(rendered, {
    headers: { "content-type": "text/html; charset=UTF-8" },
  });
}
