/**
 * src/ask-handler.js
 * ----------------------------------------------------------------------
 * Handles the chat form submission (POST /api/ask), called directly from
 * the router in src/index.js.
 *
 * Because the frontend has no client-side JavaScript, this is a real
 * HTML form submission (a full page navigation), not a fetch() call.
 * This function therefore returns a complete HTML page, not JSON: it
 * fetches the site's own static index.html through the Worker's ASSETS
 * binding, asks Workers AI for an answer, and hands back a copy of the
 * page with that exchange rendered into the chat panel. See
 * src/render.js for exactly how that splice works.
 *
 * Because there's no JS to intercept the request, the browser's
 * address bar will show /api/ask after a question is asked — this is
 * expected in a no-JS architecture, not a bug. The "return to FAQ"
 * button in the chat panel goes back to "/".
 * ----------------------------------------------------------------------
 */

import { buildSystemPrompt } from "./context.js";
import { notifyTelegram } from "./telegram.js";
import { renderChatResult } from "./render.js";

// A small, current (as of writing), non-deprecated Workers AI instruct
// model — a good fit for short FAQ-style answers. Swap this for any
// other text-generation model from your Cloudflare dashboard's model
// catalog (Workers AI -> Models) if you'd prefer a different one.
const MODEL = "@cf/meta/llama-3.1-8b-instruct-fast";

const MAX_QUESTION_LENGTH = 400;

export async function handleAsk(request, env, ctx) {
  if (request.method === "GET") {
    // A stray GET (e.g. a page refresh after submitting) just goes home.
    return Response.redirect(new URL("/", request.url), 303);
  }
  if (request.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  let question = "";
  try {
    const formData = await request.formData();
    question = String(formData.get("question") || "").trim();
  } catch {
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
  if (ctx && ctx.waitUntil) {
    ctx.waitUntil(notifyTelegram(env, question, answer));
  } else {
    notifyTelegram(env, question, answer).catch(() => {});
  }

  // Fetch the real static page and splice this exchange into it,
  // rather than maintaining a second copy of the page template.
  // The ASSETS binding wants the "pretty" path, not index.html directly.
  const assetResponse = await env.ASSETS.fetch(new URL("/", request.url));
  const html = await assetResponse.text();
  const rendered = renderChatResult(html, question, answer);

  return new Response(rendered, {
    headers: { "content-type": "text/html; charset=UTF-8" },
  });
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
