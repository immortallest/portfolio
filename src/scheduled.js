/**
 * src/scheduled.js
 * ----------------------------------------------------------------------
 * Runs on the Cron Trigger defined in wrangler.toml (every 10 minutes
 * by default). This is what actually plays the role of "the visitor
 * closed the site" — a Worker genuinely cannot know the instant someone
 * closes a browser tab without JavaScript running in that tab to tell
 * it, so instead this treats a conversation as "over" once it's been
 * quiet (no new question) for INACTIVITY_MINUTES. That's the closest
 * honest equivalent available in a no-JS architecture.
 *
 * For each conversation that qualifies: send its full transcript to
 * Telegram as one message (see src/telegram.js), then delete it from
 * KV. Conversations that are still active are left alone.
 * ----------------------------------------------------------------------
 */

import { KV_PREFIX, deleteHistory } from "./session.js";
import { notifyTelegramDigest } from "./telegram.js";

const INACTIVITY_MINUTES = 20;

export async function handleScheduled(env) {
  if (!env.CHAT_SESSIONS) return;

  const cutoff = Date.now() - INACTIVITY_MINUTES * 60 * 1000;
  const list = await env.CHAT_SESSIONS.list({ prefix: KV_PREFIX });

  for (const key of list.keys) {
    const raw = await env.CHAT_SESSIONS.get(key.name);
    if (!raw) continue;

    let data;
    try {
      data = JSON.parse(raw);
    } catch {
      // Corrupt entry — just clear it out.
      await env.CHAT_SESSIONS.delete(key.name);
      continue;
    }

    const lastActive = data.lastActive || 0;
    if (lastActive > cutoff) continue; // still an active conversation — leave it

    const sessionId = key.name.slice(KV_PREFIX.length);
    if (data.messages && data.messages.length) {
      await notifyTelegramDigest(env, data.messages);
    }
    await deleteHistory(env, sessionId);
  }
}
