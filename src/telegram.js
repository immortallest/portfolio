/**
 * src/telegram.js
 * ----------------------------------------------------------------------
 * Sends ONE report per visitor when their activity is done — the full
 * chat transcript if they used the chat, a summary of what they clicked
 * if they didn't, or both together if they did both (src/scheduled.js
 * decides which case applies and merges the data before calling this).
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
 * block the scheduled job from still deleting expired data.
 * ----------------------------------------------------------------------
 */

import { labelFor } from "./track-labels.js";

const TELEGRAM_MAX_LEN = 3900; // Telegram's real limit is 4096 chars; leaving headroom.

function formatChatSection(messages) {
  const lines = messages.map((m) => `${m.role === "user" ? "Visitor" : "Assistant"}: ${m.content}`);
  return `💬 Chat (${messages.length} messages):\n\n${lines.join("\n\n")}`;
}

function formatClicksSection(clicks) {
  const lines = clicks
    .slice()
    .sort((a, b) => a.time - b.time)
    .map((c) => `• ${labelFor(c.slug)}`);
  return `🖱 Clicks (${clicks.length}):\n${lines.join("\n")}`;
}

/**
 * report: { ip, messages?: [...], clicks?: [...] }
 * At least one of messages/clicks should be non-empty — callers already
 * check this before calling, but it's harmless either way.
 */
export async function notifyTelegramDigest(env, report) {
  if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID) return; // not configured — skip silently

  const { ip, messages, clicks } = report;
  const hasChat = messages && messages.length;
  const hasClicks = clicks && clicks.length;
  if (!hasChat && !hasClicks) return;

  const sections = [];
  sections.push(`Visit report — IP ${ip || "unknown"}${hasChat ? "" : " (no chat used)"}`);
  if (hasChat) sections.push(formatChatSection(messages));
  if (hasClicks) sections.push(formatClicksSection(clicks));

  let text = sections.join("\n\n");
  if (text.length > TELEGRAM_MAX_LEN) {
    text = text.slice(0, TELEGRAM_MAX_LEN) + "\n\n…(truncated)";
  }

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
