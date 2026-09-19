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
 *   - Growing the input box as its content wraps to more lines.
 *   - Keeping the chat panel open once opened, regardless of what
 *     inside it gets clicked, until the return-to-FAQ button specifically
 *     is used (see "STICKY CHAT MODE" below for why this needs JS at all).
 *
 * PROGRESSIVE ENHANCEMENT: the <form> in index.html has a real
 * action="/api/ask" method="POST" and works completely on its own if
 * this script fails to load or JS is disabled — it just falls back to
 * a full page reload per message (see src/chat-page-handler.js). This
 * file only upgrades that experience when it's available; it never
 * touches the FAQ, filtering, or project-detail markup at all.
 *
 * STICKY CHAT MODE: the panel's visibility is still driven entirely by
 * CSS — .question-strip:has(#chat-input:focus, #mode-chat:checked) in
 * styles.css, not by this script toggling any class. #mode-chat:checked
 * is what's meant to make it *stay* open regardless of focus; without
 * JS, only the Worker's no-JS fallback page ever checked it (by
 * re-rendering the page with that attribute set). Since this script
 * never triggers that fallback — it talks to the server with fetch()
 * instead of navigating — nothing was ever setting #mode-chat, so the
 * panel was only ever held open by #chat-input:focus, which is exactly
 * why clicking anything else inside it (a bubble, empty log space) let
 * focus go and closed it. The fix is the one line below: check that box
 * the moment the input is first focused.
 * ----------------------------------------------------------------------
 */

(function () {
  "use strict";

  const form = document.querySelector(".chat-form");
  const input = document.getElementById("chat-input");
  const log = document.getElementById("chat-log");
  const modeChat = document.getElementById("mode-chat");

  if (!form || !input || !log) return; // markup missing/changed — let the plain form handle everything

  // See "STICKY CHAT MODE" above. Radios in the same group can only be
  // switched to a different one, never unchecked by re-clicking, so this
  // is a one-way "open"; only the return-to-FAQ label (#mode-faq, plain
  // HTML/CSS, untouched by this script) can close it again.
  input.addEventListener("focus", function () {
    if (modeChat) modeChat.checked = true;
  });

  // ---- Auto-growing textarea ----
  // Standard technique: collapse to one line, then read the natural
  // content height and grow to fit (capped by the CSS max-height on
  // #chat-input, past which it scrolls internally instead of growing).
  function resizeInput() {
    input.style.height = "auto";
    input.style.height = input.scrollHeight + "px";
  }
  input.addEventListener("input", resizeInput);

  // Enter sends the message; Shift+Enter inserts a newline. A <textarea>
  // has no native "Enter submits" behaviour (unlike the single-line
  // <input> this replaced) so both need to be handled explicitly.
  input.addEventListener("keydown", function (event) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      if (typeof form.requestSubmit === "function") form.requestSubmit();
      else form.dispatchEvent(new Event("submit", { cancelable: true }));
    }
  });

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

    if (modeChat) modeChat.checked = true; // in case of a submit without a prior focus event (e.g. requestSubmit())

    addBubble("user", question);
    input.value = "";
    resizeInput(); // shrink back to one line now that it's empty
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
