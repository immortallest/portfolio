/**
 * functions/api/ask.js
 * ----------------------------------------------------------------------
 * Handles POST /api/ask — the target of the chat <form> in index.html.
 *
 * Because the frontend has no client-side JavaScript, this is a real
 * HTML form submission (a full page navigation), not a fetch() call.
 * This function therefore returns a complete HTML page, not JSON: it
 * fetches the site's own static index.html through the Pages ASSETS
 * binding, asks Workers AI for an answer, and hands back a copy of the
 * page with that exchange rendered into the chat panel. See
 * functions/_render.js for exactly how that splice works.
 *
 * Because there's no JS to intercept the request, the browser's
 * address bar will show /api/ask after a question is asked — this is
 * expected in a no-JS architecture, not a bug. The "return to FAQ"
 * button in the chat panel goes back to "/".
 * ----------------------------------------------------------------------
 */

import { buildSystemPrompt } from "../_context.js";
import { notifyTelegram } from "../_telegram.js";
import { renderChatResult, escapeHtml } from "../_render.js";

// A small, current (as of writing), non-deprecated Workers AI instruct
// model — a good fit for short FAQ-style answers. Swap this for any
// other text-generation model from your Cloudflare dashboard's model
// catalog (Workers AI -> Models) if you'd prefer a different one.
const MODEL = "@cf/meta/llama-3.1-8b-instruct-fast";

const MAX_QUESTION_LENGTH = 400;

export async function onRequestPost(context) {
  const { request, env } = context;

  let question = "";
  try {
    const formData = await request.formData();
    question = String(formData.get("question") || "").trim();
  } catch {
    // Malformed submission — just send them back to a clean page.
    return Response.redirect(new URL("/", request.url), 303);
  }

  if (!question) {
    return Response.redirect(new URL("/", request.url), 303);
  }
  if (question.length > MAX_QUESTION_LENGTH) {
    question = question.slice(0, MAX_QUESTION_LENGTH);
  }

  const answer = await getAnswer(env, question);

  // Fire-and-forget: don't let a slow/failed Telegram call delay the
  // response to the visitor. waitUntil keeps the Worker alive long
  // enough for it to finish after the response is sent.
  if (context.waitUntil) {
    context.waitUntil(notifyTelegram(env, question, answer));
  } else {
    notifyTelegram(env, question, answer).catch(() => {});
  }

  // Fetch the real static page and splice this exchange into it,
  // rather than maintaining a second copy of the page template.
  // Pages' ASSETS binding wants the "pretty" path, not index.html directly.
  const assetResponse = await env.ASSETS.fetch(new URL("/", request.url));
  const html = await assetResponse.text();
  const rendered = renderChatResult(html, question, answer);

  return new Response(rendered, {
    headers: { "content-type": "text/html; charset=UTF-8" },
  });
}

// A stray GET to /api/ask (e.g. a page refresh after submitting)
// should just send the visitor back to the homepage instead of erroring.
export async function onRequestGet(context) {
  return Response.redirect(new URL("/", context.request.url), 303);
}

async function getAnswer(env, question) {
  if (!env.AI) {
    return "The AI chat isn't connected yet — this site needs a Workers AI binding configured. See README.md for setup steps.";
  }

  try {
    const result = await env.AI.run(MODEL, {
      messages: [
        { role: "system", content: buildSystemPrompt() },
        { role: "user", content: question },
      ],
    });

    const text = (result && result.response ? String(result.response) : "").trim();
    if (!text) throw new Error("empty model response");
    return text;
  } catch (err) {
    console.error("Workers AI call failed:", err);
    return "I couldn't generate an answer just now — please try again in a moment, or reach out directly through the links in the sidebar.";
  }
}

// escapeHtml is re-exported from _render.js and used there; imported
// here too in case you extend this file to build custom error HTML.
export { escapeHtml };
