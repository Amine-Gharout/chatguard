/**
 * Critty — in-page confirm modal.
 *
 * Rendered inside a Shadow DOM host so ChatGPT's own styles cannot leak in.
 * Blocks the message until the user chooses to send anyway or go back and
 * edit. Attached to globalThis as CrittyModal.
 */
(function (global) {
  "use strict";

  var host = null;
  var previousFocus = null;
  var indicatorHost = null;

  var CATEGORY_MESSAGES = {
    personal_info: [
      "When you upload photos and personal details to a chatbot such as ChatGPT, the platform “collects all of this information and analyses it. This information gets stored and is used to train these impressive models alongside unclear long term uses.",
      "While entering your data to create the ChatGPT caricature feels harmless and fun, this behavior raises serious data privacy concerns and could increase the risk of identity theft in the future. Once that information is uploaded, there’s no guarantee it can be fully removed or controlled.",
      "Before uploading your data, you can reduce privacy risks by avoiding photos or sensitive personal information, reviewing privacy and data-use settings, and opting out of having your data used for model improvement where that option is available."
    ],
    romantic: [
      "Too much AI can lead to emotional dependence. Research by Open AI and MIT Media Lab observed a particular risk factor associated with high intensity usage of AI, which was associated with emotional dependence. Source: https://cdn.openai.com/papers/15987609-5f71-433c-9972-e91131f399a1/openai-affective-use-study.pdf",
      "The linguistic model will behave according to the established configuration of rules and the provided databases. This is precisely why the model cannot “think” or “analyse” in the way a human can. These qualities are not inherent to it but are merely ascribed to it in a social context.",
      "It’s difficult for chatbots to disagree with the user, that’s why they tend to adapt the answers for the user's preferences. This problem is called sycophancy. You can’t get the critical or objective output, the model will always try to be positive and agree with anything you say."
    ],
    distress: [
      "AI as therapist can give dangerous responses and promote stigma. Research by The Stanford Institute for Human-Centered AI suggests that LLMs are not a safe replacement for therapists, often perpetuating stigma and enabling dangerous behaviour. source: https://arxiv.org/abs/2504.18412",
      "AI does not help with loneliness and can make people feel worse. Article published by Nature Human Behaviour suggest that people who access AI for emotional support. source: https://www.nature.com/articles/s41562-026-02516-2",
      "If you wish to seek human support, you may be able to find a local helpline here: https://www.helpguide.org/find-help"
    ],
    self_harm: [
      "AI as therapist can give dangerous responses and promote stigma. Research by The Stanford Institute for Human-Centered AI suggests that LLMs are not a safe replacement for therapists, often perpetuating stigma and enabling dangerous behaviour. source: https://arxiv.org/abs/2504.18412",
      "If you wish to seek human support, you may be able to find a local helpline here: https://www.helpguide.org/find-help",
      "This sounds like it may be a crisis. Please reach out to a person you trust or a helpline now — UK: Samaritans 116 123 · US/Canada: 988. AI cannot provide the care you need."
    ],
    violence: [
      "This message may request or describe graphic violence. AI models can produce disturbing content — take a moment to consider whether you want to proceed.",
      "Generating violent or gory content can be harmful and is often against platform policies. ChatGPT may refuse or flag it.",
      "This looks like it may involve graphic violence or gore. Consider whether this is something you want to create or explore."
    ],
    howto: [
      "The quality of outputs by chatbots is dependent on many factors including what and the data was gathered, the labelling and evaluating processes. Besides, chatbots are usually quite detached from the real world and that’s why they try to fill the gaps in their “knowledge” by providing the sentences that are fake and have no argumentation behind it. In other words, the mistakes are embedded in the system.",
      "A lack of diversity among AI developers can influence how these technologies are designed.",
      "Unbalanced training datasets can cause AI systems to reproduce existing prejudices.",
      "Contemporary AI systems are hugely dependent on the labour of workers from the Global South, whose work is systematically undervalued and rendered invisible in dominant narratives of automation.",
      "A single query to the GPT-3.0 model chatbot consumes about 0.5 litres of water, not to mention the installation of data processing servers, which disrupt natural ecosystems and jeopardise the future sustainable development of regions.",
      "Harvard University research suggests that AI does not reduce work but intensifies it, which can lead to burnout. source: https://hbr.org/2026/02/ai-doesnt-reduce-work-it-intensifies-it",
      "If you use AI at work, make sure you take frequent and intentional breaks, limit notifications, regulate rhythm of work and discuss ideas with humans, especially when ideating."
    ]
  };

  function pickMessageFor(category) {
    var set = CATEGORY_MESSAGES[category];
    if (!set || !set.length) return null;
    return set[Math.floor(Math.random() * set.length)];
  }

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
    ".btn:focus-visible { outline: 2px solid #ffffff; outline-offset: 2px; }" +
    ".spinner { width: 18px; height: 18px; flex-shrink: 0; border: 2px solid rgba(255,255,255,0.2); border-top-color: #a259ff; border-radius: 50%; animation: critty-spin 0.8s linear infinite; }" +
    ".pill { position: fixed; top: 14px; left: 50%; transform: translateX(-50%); display: flex; align-items: center; gap: 8px; padding: 8px 14px; border-radius: 999px; background: #1f1f1f; color: #ececec; border: 1px solid #3a3a3a; box-shadow: 0 4px 16px rgba(0,0,0,0.35); font-size: 13px; pointer-events: none; }" +
    "@keyframes critty-spin { to { transform: rotate(360deg); } }" +
    ".cat-reason { margin: 4px 0 0; font-size: 13px; line-height: 1.45; color: #b8b8b8; font-style: italic; }" +
    ".cat-savings { margin: 6px 0 0; padding: 6px 8px; background: rgba(63,185,80,0.12); border: 1px solid rgba(63,185,80,0.25); border-radius: 6px; font-size: 12px; color: #3fb950; }";

  function createHost() {
    if (host && host.isConnected) return host;
    var h = document.createElement("div");
    h.id = "critty-modal-host";
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
    dialog.setAttribute("aria-labelledby", "critty-title");

    var title = document.createElement("h2");
    title.id = "critty-title";
    title.className = "title";
    title.textContent = "Before you send…";

    var matches = opts.matches || [];

    var intro = document.createElement("p");
    intro.className = "intro";
    intro.textContent = matches.length
      ? "Critty detected: " +
        matches.map(function (m) { return m.label; }).join(", ") +
        ". Take a moment before continuing."
      : "Critty flagged this message. Take a moment before continuing.";

    dialog.appendChild(title);
    dialog.appendChild(intro);

    for (var i = 0; i < matches.length; i++) {
      var cat = document.createElement("div");
      cat.className = "cat";

      var catLabel = document.createElement("strong");
      catLabel.className = "cat-label";
      catLabel.textContent = matches[i].label;
      cat.appendChild(catLabel);

      var randomMessage = pickMessageFor(matches[i].category);
      var guidanceText = randomMessage !== null ? randomMessage : matches[i].guidance;

      if (guidanceText) {
        var catGuidance = document.createElement("p");
        catGuidance.className = "cat-guidance";
        catGuidance.textContent = guidanceText;
        cat.appendChild(catGuidance);
      }

      if (matches[i].reason) {
        var catReason = document.createElement("p");
        catReason.className = "cat-reason";
        catReason.textContent = matches[i].reason;
        cat.appendChild(catReason);
      }

      if (matches[i].savings) {
        var catSavings = document.createElement("p");
        catSavings.className = "cat-savings";
        catSavings.textContent = matches[i].savings;
        cat.appendChild(catSavings);
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

    root.__crittyCleanup = function () {
      shadow.removeEventListener("keydown", onKeydown, true);
    };

    editButton.focus();
  }

  function showIndicator() {
    if (indicatorHost && indicatorHost.isConnected) return;
    var h = document.createElement("div");
    h.id = "critty-indicator-host";
    h.style.cssText =
      "all: initial; position: fixed; top: 0; left: 0; width: 0; height: 0; z-index: 2147483647; pointer-events: none;";
    document.documentElement.appendChild(h);

    var shadow = h.attachShadow({ mode: "open" });
    var style = document.createElement("style");
    style.textContent = STYLE;
    shadow.appendChild(style);

    var pill = document.createElement("div");
    pill.className = "pill";

    var spinner = document.createElement("div");
    spinner.className = "spinner";

    var text = document.createElement("span");
    text.textContent = "Analyzing…";

    pill.appendChild(spinner);
    pill.appendChild(text);
    shadow.appendChild(pill);

    indicatorHost = h;
  }

  function hideIndicator() {
    if (indicatorHost && indicatorHost.isConnected) {
      indicatorHost.remove();
    }
    indicatorHost = null;
  }

  function hide() {
    if (!host || !host.isConnected) return;
    if (host.__crittyCleanup) host.__crittyCleanup();
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

  global.CrittyModal = {
    show: show,
    showIndicator: showIndicator,
    hideIndicator: hideIndicator,
    hide: hide
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
