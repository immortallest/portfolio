/**
 * src/scheduled.js
 * ----------------------------------------------------------------------
 * Runs on the Cron Trigger defined in wrangler.toml (every 2 minutes by
 * default). This is what actually plays the role of "the visitor closed
 * the site" — a Worker genuinely cannot know the instant someone closes
 * a browser tab without JavaScript running in that tab to tell it, so
 * instead this treats a visitor as "done" once they've gone quiet for a
 * while. That's the closest honest equivalent available in a no-JS
 * architecture (see also the note in src/session.js).
 *
 * Two different kinds of quiet, on purpose:
 *   - A CHAT conversation naturally has longer pauses (someone reading
 *     and thinking between messages), so it waits CHAT_INACTIVITY_MS
 *     before treating it as over.
 *   - Plain browsing (clicking around FAQ/projects/downloads/contact
 *     links, never chatting) has no such pauses to account for, so it's
 *     reported sooner, after VISIT_INACTIVITY_MS — this is the
 *     "report promptly if they never used chat" behaviour.
 *
 * Two passes, in order:
 *   1. Chat sessions ready to close. Each one's stored IP (see
 *      src/ask-handler.js) is used to look up that same visitor's click
 *      log, if any, so the two merge into ONE Telegram report instead of
 *      two. Their click log — now merged in — is removed here too, and
 *      their IP is remembered so pass 2 leaves it alone.
 *   2. Click-only visits ready to close, skipping any IP that pass 1
 *      just remembered as still mid-conversation — that visitor's
 *      clicks will be reported later, merged with their eventual chat
 *      digest, instead of being split into a separate message now.
 * ----------------------------------------------------------------------
 */

import {
  KV_PREFIX,
  VISIT_PREFIX,
  deleteHistory,
  getVisit,
  deleteVisit,
} from "./session.js";
import { notifyTelegramDigest } from "./telegram.js";

const CHAT_INACTIVITY_MINUTES = 20;
const VISIT_INACTIVITY_MINUTES = 3;

export async function handleScheduled(env) {
  if (!env.CHAT_SESSIONS) return;

  const now = Date.now();
  const chatCutoff = now - CHAT_INACTIVITY_MINUTES * 60 * 1000;
  const visitCutoff = now - VISIT_INACTIVITY_MINUTES * 60 * 1000;

  // ---- Pass 1: chat sessions (merging in click data by IP when present) ----
  const stillActiveIps = new Set();
  const sessionList = await env.CHAT_SESSIONS.list({ prefix: KV_PREFIX });

  for (const key of sessionList.keys) {
    const raw = await env.CHAT_SESSIONS.get(key.name);
    if (!raw) continue;

    let data;
    try {
      data = JSON.parse(raw);
    } catch {
      await env.CHAT_SESSIONS.delete(key.name);
      continue;
    }

    const lastActive = data.lastActive || 0;
    if (lastActive > chatCutoff) {
      if (data.ip) stillActiveIps.add(data.ip);
      continue; // still an active conversation — leave it for a later run
    }

    const sessionId = key.name.slice(KV_PREFIX.length);

    let clicks = null;
    if (data.ip) {
      const visit = await getVisit(env, data.ip);
      if (visit && visit.clicks && visit.clicks.length) clicks = visit.clicks;
      await deleteVisit(env, data.ip); // merged in now (or empty) — don't let pass 2 also report it
    }

    await notifyTelegramDigest(env, { ip: data.ip, messages: data.messages, clicks });
    await deleteHistory(env, sessionId);
  }

  // ---- Pass 2: click-only visits, skipping anyone still mid-conversation ----
  const visitList = await env.CHAT_SESSIONS.list({ prefix: VISIT_PREFIX });

  for (const key of visitList.keys) {
    const ip = key.name.slice(VISIT_PREFIX.length);
    if (stillActiveIps.has(ip)) continue; // their eventual chat digest will include this

    const raw = await env.CHAT_SESSIONS.get(key.name);
    if (!raw) continue;

    let data;
    try {
      data = JSON.parse(raw);
    } catch {
      await env.CHAT_SESSIONS.delete(key.name);
      continue;
    }

    const lastActive = data.lastActive || 0;
    if (lastActive > visitCutoff) continue; // possibly still browsing

    if (data.clicks && data.clicks.length) {
      await notifyTelegramDigest(env, { ip, clicks: data.clicks });
    }
    await deleteVisit(env, ip);
  }
}
