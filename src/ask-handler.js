/**
 * src/ask-handler.js
 * ----------------------------------------------------------------------
 * Handles POST /api/ask — the target of the chat <form> in index.html.
 *
 * THE OLD BUG THIS FIXES: this used to respond to the POST directly with
 * the rendered HTML page. That meant the browser's "current page" was
 * itself the result of a POST — so refreshing it made the browser
 * resubmit that same POST, asking the same question again. This is a
 * well-known class of bug with a well-known fix: Post/Redirect/Get.
 * Instead of returning HTML here, this handler saves the new answer and
 * responds with an HTTP redirect to GET /chat. The browser then loads
 * /chat with a normal GET, and *that* is what refreshing reloads — safe,
 * because GET requests aren't resubmitted. See src/chat-page-handler.js.
 *
 * MULTI-TURN CONTEXT: the visitor's session id (a cookie — see
 * src/session.js) is used to look up their stored conversation so far.
 * The model gets that history (trimmed to the most recent stretch) as
 * real conversation context, not just the latest question in isolation.
 * ----------------------------------------------------------------------
 */

import { buildSystemPrompt } from "./context.js";
import { getOrCreateSessionId, getHistory, saveHistory, MAX_MESSAGES_FOR_MODEL } from "./session.js";

// A small, current (as of writing), non-deprecated Workers AI instruct
// model — a good fit for short FAQ-style answers. Swap this for any
// other text-generation model from your Cloudflare dashboard's model
// catalog (Workers AI -> Models) if you'd prefer a different one.
const MODEL = "@cf/meta/llama-3.1-8b-instruct-fast";

const MAX_QUESTION_LENGTH = 400;

export async function handleAsk(request, env, ctx) {
  if (request.method === "GET") {
    // A stray GET (e.g. someone bookmarking /api/ask) just goes home.
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

  const { sessionId, setCookie } = getOrCreateSessionId(request);
  const existing = (await getHistory(env, sessionId)) || { messages: [] };

  const answer = await getAnswer(env, question, existing.messages);

  const now = Date.now();
  existing.messages.push({ role: "user", content: question, time: now });
  existing.messages.push({ role: "assistant", content: answer, time: now });
  existing.lastActive = now;

  await saveHistory(env, sessionId, existing);

  const redirectUrl = new URL("/chat#chat-bottom", request.url);
  const res = new Response(null, { status: 303, headers: { Location: redirectUrl.toString() } });
  if (setCookie) res.headers.append("Set-Cookie", setCookie);
  return res;
}

async function getAnswer(env, question, historyMessages) {
  if (!env.AI) {
    return "The AI chat isn't connected yet — this site needs a Workers AI binding configured. See README.md for setup steps.";
  }

  try {
    const recent = (historyMessages || []).slice(-MAX_MESSAGES_FOR_MODEL);
    const messages = [
      { role: "system", content: buildSystemPrompt() },
      ...recent.map((m) => ({ role: m.role, content: m.content })),
      { role: "user", content: question },
    ];

    const result = await env.AI.run(MODEL, { messages });

    const text = (result && result.response ? String(result.response) : "").trim();
    if (!text) throw new Error("empty model response");
    return text;
  } catch (err) {
    console.error("Workers AI call failed:", err);
    return "I couldn't generate an answer just now — please try again in a moment, or reach out directly through the links in the sidebar.";
  }
}
