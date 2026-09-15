/**
 * src/telegram.js
 * ----------------------------------------------------------------------
 * Sends each question/answer pair to a Telegram chat via the Bot API,
 * so you see every question asked on the site in real time.
 *
 * Setup (see README.md for the full walkthrough):
 *   1. Message @BotFather on Telegram, run /newbot, copy the token.
 *   2. Message your new bot once (anything), then visit
 *      https://api.telegram.org/bot<TOKEN>/getUpdates to find your
 *      chat id in the JSON response.
 *   3. Set TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID as Cloudflare Worker
 *      secrets (Worker -> Settings -> Variables and Secrets).
 *
 * This is intentionally fire-and-forget: a Telegram outage should
 * never block or break an answer being shown on the site.
 * ----------------------------------------------------------------------
 */

export async function notifyTelegram(env, question, answer) {
  if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID) {
    // Not configured yet — skip silently rather than throwing.
    return;
  }

  const text =
    `New question from the site chat\n\n` +
    `Q: ${question}\n\n` +
    `A: ${answer}`;

  const url = `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`;

  try {
    await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        chat_id: env.TELEGRAM_CHAT_ID,
        text,
      }),
    });
  } catch (err) {
    // Swallow errors — a failed notification should never surface to
    // the visitor or block the page from rendering their answer.
    console.error("Telegram notify failed:", err);
  }
}
