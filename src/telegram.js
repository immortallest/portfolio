/**
 * src/telegram.js
 * ----------------------------------------------------------------------
 * Sends ONE digest message per conversation — the whole thing, in
 * order — rather than one message per question. It's called from
 * src/scheduled.js once a conversation has gone quiet for a while (see
 * that file for exactly what "gone quiet" means and why), right before
 * that conversation's stored history is deleted.
 *
 * Setup (see README.md for the full walkthrough):
 *   1. Message @BotFather on Telegram, run /newbot, copy the token.
 *   2. Message your new bot once (anything), then visit
 *      https://api.telegram.org/bot<TOKEN>/getUpdates to find your
 *      chat id in the JSON response.
 *   3. Set TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID as Worker secrets
 *      (Worker -> Settings -> Variables and Secrets).
 *
 * This is intentionally fire-and-forget: a Telegram outage should never
 * block the cleanup job from still deleting expired sessions.
 * ----------------------------------------------------------------------
 */

const TELEGRAM_MAX_LEN = 3900; // Telegram's real limit is 4096 chars; leaving headroom.

function formatTranscript(messages) {
  const lines = messages.map((m) => `${m.role === "user" ? "Visitor" : "Assistant"}: ${m.content}`);
  let text = lines.join("\n\n");
  if (text.length > TELEGRAM_MAX_LEN) {
    text = text.slice(0, TELEGRAM_MAX_LEN) + "\n\n…(truncated — conversation continued)";
  }
  return text;
}

export async function notifyTelegramDigest(env, messages) {
  if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID) return; // not configured — skip silently
  if (!messages || !messages.length) return;

  const text = `Chat conversation ended (${messages.length} messages):\n\n${formatTranscript(messages)}`;
  const url = `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`;

  try {
    await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: env.TELEGRAM_CHAT_ID, text }),
    });
  } catch (err) {
    console.error("Telegram digest failed:", err);
  }
}
