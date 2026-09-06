/**
 * src/index.js
 * ----------------------------------------------------------------------
 * The Worker's single entry point (see `main` in wrangler.toml).
 *
 * With Workers Static Assets, Cloudflare serves any request that
 * matches a file in `public/` (index.html, styles.css) directly,
 * WITHOUT invoking this fetch handler at all — that's the default
 * `run_worker_first = false` behaviour. This code only runs for
 * requests that don't match a static file, which in this project is
 * just one route: the chat form's POST /api/ask.
 * ----------------------------------------------------------------------
 */

import { handleAsk } from "./ask-handler.js";

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === "/api/ask") {
      return handleAsk(request, env, ctx);
    }

    // Anything else reaching the Worker didn't match a static asset —
    // let the assets binding produce the right 404 behaviour.
    return env.ASSETS.fetch(request);
  },
};
