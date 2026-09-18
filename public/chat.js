/**
 * public/chat.js
 * ----------------------------------------------------------------------
 * The ONLY JavaScript on this site, and only for this one interaction.
 * Every other feature — the FAQ accordion, the FAQ<->chat visibility
 * toggle, category filtering, the project detail view — stays pure
 * HTML/CSS with zero JS involved (see the big comment at the top of
 * styles.css for how). This file exists only because a few specific
 * things are genuinely impossible without it:
 *   - Sending a message without reloading the whole page.
 *   - Showing a "typing…" indicator while the model is still thinking
 *     (CSS can't react to an in-flight request it can't observe).
 *   - Animating a new message into place as a distinct event, rather
 *     than the whole page simply finishing a fresh load.
 *   - Keeping focus in the input after sending, so the next message can
 *     be typed immediately.
 *
 * PROGRESSIVE ENHANCEMENT: the <form> in index.html has a real
 * action="/api/ask" method="POST" and works completely on its own if
 * this script fails to load or JS is disabled — it just falls back to
 * a full page reload per message (see src/chat-page-handler.js). This
 * file only upgrades that experience when it's available; it never
 * touches the FAQ, filtering, or project-detail markup at all.
 * ----------------------------------------------------------------------
 */

(function () {
  "use strict";

  const form = document.querySelector(".chat-form");
  const input = document.getElementById("chat-input");
  const log = document.getElementById("chat-log");

  if (!form || !input || !log) return; // markup missing/changed — let the plain form handle everything

  function scrollToBottom() {
    log.scrollTo({ top: log.scrollHeight, behavior: "smooth" });
  }

  function addBubble(role, text) {
    const bubble = document.createElement("div");
    bubble.className = "chat-bubble chat-bubble--" + role + " chat-bubble--enter";
    const p = document.createElement("p");
    p.textContent = text; // textContent, never innerHTML — no markup injection from model or visitor text
    bubble.appendChild(p);
    log.insertBefore(bubble, log.lastElementChild); // keep the #chat-bottom anchor last
    return bubble;
  }

  function addTypingIndicator() {
    const bubble = document.createElement("div");
    bubble.className = "chat-bubble chat-bubble--assistant chat-bubble--typing chat-bubble--enter";
    bubble.setAttribute("aria-label", "Assistant is typing");
    bubble.innerHTML =
      '<span class="typing-dot"></span><span class="typing-dot"></span><span class="typing-dot"></span>';
    log.insertBefore(bubble, log.lastElementChild);
    return bubble;
  }

  // Restore a conversation already in progress (e.g. after a refresh) so
  // the visible log matches what the model actually remembers server-side.
  async function restoreHistory() {
    try {
      const res = await fetch("/api/history", {
        headers: { Accept: "application/json" },
        credentials: "same-origin",
      });
      if (!res.ok) return;
      const data = await res.json();
      if (!data.messages || !data.messages.length) return;
      for (const m of data.messages) {
        const bubble = document.createElement("div");
        bubble.className = "chat-bubble chat-bubble--" + m.role;
        const p = document.createElement("p");
        p.textContent = m.content;
        bubble.appendChild(p);
        log.insertBefore(bubble, log.lastElementChild);
      }
      scrollToBottom();
    } catch {
      // No stored conversation, or the network hiccuped — the greeting
      // bubble alone is a perfectly fine starting state either way.
    }
  }
  restoreHistory();

  form.addEventListener("submit", async function (event) {
    event.preventDefault();

    const question = input.value.trim();
    if (!question) return;

    addBubble("user", question);
    input.value = "";
    input.focus(); // no navigation happens, so this is the only line needed to "keep" focus
    scrollToBottom();

    const typingBubble = addTypingIndicator();
    scrollToBottom();

    try {
      const formData = new FormData();
      formData.set("question", question);

      const res = await fetch(form.action, {
        method: "POST",
        body: formData,
        headers: { Accept: "application/json" },
        credentials: "same-origin",
      });

      if (!res.ok) throw new Error("request failed: " + res.status);
      const data = await res.json();

      typingBubble.remove();
      addBubble("assistant", data.answer || "Sorry, something went wrong.");
    } catch {
      typingBubble.remove();
      addBubble("assistant", "I couldn't reach the server just now — please try again in a moment.");
    }

    scrollToBottom();
  });
})();
