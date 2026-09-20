/**
 * src/index.js
 * ----------------------------------------------------------------------
 * The Worker's single entry point (see `main` in wrangler.toml).
 *
 * With Workers Static Assets, Cloudflare serves any request that
 * matches a file in `public/` (index.html, styles.css) directly,
 * WITHOUT invoking this fetch handler at all — that's the default
 * `run_worker_first = false` behaviour. This code only runs for
 * requests that don't match a static file: the chat form's
 * POST /api/ask, the GET /chat page it redirects to, and GET /t/:slug
 * (the CSS-triggered click-analytics pixels — see styles.css's big
 * comment on that technique and src/track-handler.js).
 *
 * `scheduled()` runs on the Cron Trigger in wrangler.toml — see
 * src/scheduled.js for what it does and why.
 * ----------------------------------------------------------------------
 */

import { handleAsk } from "./ask-handler.js";
import { handleChatPage } from "./chat-page-handler.js";
import { handleHistory } from "./history-handler.js";
import { handleTrack } from "./track-handler.js";
import { handleScheduled } from "./scheduled.js";

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === "/api/ask") {
      return handleAsk(request, env, ctx);
    }
    if (url.pathname === "/api/history") {
      return handleHistory(request, env);
    }
    if (url.pathname === "/chat") {
      return handleChatPage(request, env);
    }
    if (url.pathname.startsWith("/t/")) {
      return handleTrack(request, env, url.pathname.slice(3));
    }

    // Anything else reaching the Worker didn't match a static asset —
    // let the assets binding produce the right 404 behaviour.
    return env.ASSETS.fetch(request);
  },

  async scheduled(event, env, ctx) {
    ctx.waitUntil(handleScheduled(env));
  },
};
