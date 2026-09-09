/**
 * ChatGuard — in-page confirm modal.
 *
 * Rendered inside a Shadow DOM host so ChatGPT's own styles cannot leak in.
 * Blocks the message until the user chooses to send anyway or go back and
 * edit. Attached to globalThis as ChatGuardModal.
 */
(function (global) {
  "use strict";

  var host = null;
  var previousFocus = null;

  var STYLE =
    ".overlay { position: fixed; inset: 0; display: flex; align-items: center; justify-content: center;" +
    " background: rgba(0, 0, 0, 0.45); backdrop-filter: blur(2px); padding: 24px;" +
    " text-align: left; line-height: normal;" +
    " font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; }" +
    ".dialog { background: #1f1f1f; color: #ececec; border: 1px solid #3a3a3a; border-radius: 12px;" +
    " max-width: 440px; width: 100%; padding: 20px 22px; box-shadow: 0 12px 40px rgba(0, 0, 0, 0.4); }" +
    ".title { margin: 0 0 10px; font-size: 17px; font-weight: 600; color: #ffffff; }" +
    ".intro { margin: 0 0 12px; font-size: 14px; line-height: 1.5; color: #d1d1d1; }" +
    ".cat { margin: 0 0 10px; }" +
    ".cat-label { display: block; margin: 0 0 2px; font-size: 14px; font-weight: 600; color: #f2b8d5; }" +
    ".cat-guidance { margin: 0; font-size: 13px; line-height: 1.45; color: #d1d1d1; }" +
    ".phrases { margin: 0 0 14px; padding-left: 18px; font-size: 13px; color: #f2b8d5; }" +
    ".actions { display: flex; gap: 10px; justify-content: flex-end; }" +
    ".btn { border: 0; border-radius: 8px; padding: 9px 14px; font-size: 14px; cursor: pointer; }" +
    ".btn.secondary { background: #3a3a3a; color: #ececec; }" +
    ".btn.primary { background: #a259ff; color: #ffffff; }" +
    ".btn:focus-visible { outline: 2px solid #ffffff; outline-offset: 2px; }";

  function createHost() {
    if (host && host.isConnected) return host;
    var h = document.createElement("div");
    h.id = "chatguard-modal-host";
    h.style.cssText =
      "all: initial; position: fixed; inset: 0; z-index: 2147483647;";
    document.documentElement.appendChild(h);
    host = h;
    return host;
  }

  function show(opts) {
    var root = createHost();
    var shadow = root.shadowRoot || root.attachShadow({ mode: "open" });
    shadow.innerHTML = "";

    var style = document.createElement("style");
    style.textContent = STYLE;
    shadow.appendChild(style);

    var overlay = document.createElement("div");
    overlay.className = "overlay";

    var dialog = document.createElement("div");
    dialog.className = "dialog";
    dialog.setAttribute("role", "dialog");
    dialog.setAttribute("aria-modal", "true");
    dialog.setAttribute("aria-labelledby", "chatguard-title");

    var title = document.createElement("h2");
    title.id = "chatguard-title";
    title.className = "title";
    title.textContent = "Before you send…";

    var intro = document.createElement("p");
    intro.className = "intro";
    intro.textContent = "ChatGuard flagged this message. Take a moment before continuing.";

    dialog.appendChild(title);
    dialog.appendChild(intro);

    var matches = opts.matches || [];
    for (var i = 0; i < matches.length; i++) {
      var cat = document.createElement("div");
      cat.className = "cat";

      var catLabel = document.createElement("strong");
      catLabel.className = "cat-label";
      catLabel.textContent = matches[i].label;
      cat.appendChild(catLabel);

      if (matches[i].guidance) {
        var catGuidance = document.createElement("p");
        catGuidance.className = "cat-guidance";
        catGuidance.textContent = matches[i].guidance;
        cat.appendChild(catGuidance);
      }

      dialog.appendChild(cat);
    }

    var phrases = matches
      .map(function (match) {
        return match.matchedPhrases;
      })
      .reduce(function (all, list) {
        return all.concat(list);
      }, []);

    if (phrases.length) {
      var list = document.createElement("ul");
      list.className = "phrases";
      var shown = phrases.slice(0, 6);
      for (var i = 0; i < shown.length; i++) {
        var li = document.createElement("li");
        li.textContent = "\u201c" + shown[i] + "\u201d";
        list.appendChild(li);
      }
      dialog.appendChild(list);
    }

    var actions = document.createElement("div");
    actions.className = "actions";

    var editButton = document.createElement("button");
    editButton.className = "btn secondary";
    editButton.type = "button";
    editButton.textContent = "Edit message";
    editButton.addEventListener("click", function () {
      hide();
      if (typeof opts.onEdit === "function") opts.onEdit();
    });

    var sendButton = document.createElement("button");
    sendButton.className = "btn primary";
    sendButton.type = "button";
    sendButton.textContent = "Send anyway";
    sendButton.addEventListener("click", function () {
      hide();
      if (typeof opts.onSendAnyway === "function") opts.onSendAnyway();
    });

    actions.appendChild(editButton);
    actions.appendChild(sendButton);
    dialog.appendChild(actions);
    overlay.appendChild(dialog);
    shadow.appendChild(overlay);

    previousFocus = document.activeElement;

    function onKeydown(event) {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        hide();
        if (typeof opts.onEdit === "function") opts.onEdit();
      } else if (event.key === "Tab") {
        // Minimal focus trap between the two buttons.
        if (event.shiftKey && document.activeElement === editButton) {
          event.preventDefault();
          sendButton.focus();
        } else if (!event.shiftKey && document.activeElement === sendButton) {
          event.preventDefault();
          editButton.focus();
        }
      }
    }
    shadow.addEventListener("keydown", onKeydown, true);

    root.__chatguardCleanup = function () {
      shadow.removeEventListener("keydown", onKeydown, true);
    };

    editButton.focus();
  }

  function hide() {
    if (!host || !host.isConnected) return;
    if (host.__chatguardCleanup) host.__chatguardCleanup();
    host.remove();
    host = null;
    if (
      previousFocus &&
      previousFocus.isConnected &&
      typeof previousFocus.focus === "function"
    ) {
      previousFocus.focus();
    }
  }

  global.ChatGuardModal = { show: show, hide: hide };
})(typeof globalThis !== "undefined" ? globalThis : this);
