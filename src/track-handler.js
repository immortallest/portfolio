/**
 * src/track-handler.js
 * ----------------------------------------------------------------------
 * Handles GET /t/:slug — the target of every CSS background-image
 * tracking rule at the bottom of public/styles.css. Called by the
 * BROWSER itself as a side effect of CSS matching a state (an opened
 * FAQ item, a selected project, a focused download/contact link), never
 * by any script — see the big comment block in styles.css for exactly
 * how and why that works.
 *
 * Logs the event against the visitor's IP (see getClientIp in
 * src/session.js for why that's the identifier, not anything
 * hardware-level). The actual reporting and cleanup happens later, in
 * src/scheduled.js — this just appends to the log and returns
 * immediately.
 * ----------------------------------------------------------------------
 */

import { getClientIp, getVisit, saveVisit } from "./session.js";

export async function handleTrack(request, env, slug) {
  // Always the same response, whether or not logging succeeds — this is
  // a fire-and-forget signal and must never look like a broken resource
  // to the visitor.
  const response = new Response(null, {
    status: 204,
    headers: {
      "Cache-Control": "no-store, no-cache, must-revalidate",
      Pragma: "no-cache",
    },
  });

  if (!slug) return response;

  try {
    const ip = getClientIp(request);
    const visit = (await getVisit(env, ip)) || { clicks: [], firstSeen: Date.now() };
    visit.clicks.push({ slug, time: Date.now() });
    visit.lastActive = Date.now();
    await saveVisit(env, ip, visit);
  } catch (err) {
    console.error("track logging failed:", err);
  }

  return response;
}
