/**
 * ChatGuard — content script bootstrap.
 *
 * Intercepts the user-triggered send paths (Enter keydown + send-button click)
 * in the capture phase. In LLM mode every message is analyzed by the background
 * classifier for context and intent; a subtle non-blocking indicator shows while
 * the check runs, and only flagged messages interrupt with the confirm modal.
 * Without the LLM, the local rule engine decides directly.
 *
 * Privacy: in LLM mode the message text is sent to your local LLM for
 * classification. Rule-only mode is fully local.
 */
(function () {
  "use strict";

  var Detector = globalThis.ChatGuardDetector;
  var Dom = globalThis.ChatGuardDom;
  var Modal = globalThis.ChatGuardModal;
  var Settings = globalThis.ChatGuardSettings;
  var Storage = globalThis.ChatGuardStorage;
  var Files = globalThis.ChatGuardFiles;
  var Impact = globalThis.ChatGuardImpact;

  var settings = JSON.parse(JSON.stringify(Settings.DEFAULTS));
  var bypass = false;
  var checking = false;
  var checkToken = 0;

  // Environmental impact is modelled in src/shared/impact.js and shared by the
  // "used" and "saved" counters so both stay directly comparable.

  function mergeSettings(defaults, stored) {
    var merged = JSON.parse(JSON.stringify(defaults));
    if (!stored) return merged;
    if (typeof stored.enabled === "boolean") merged.enabled = stored.enabled;
    if (typeof stored.useLLM === "boolean") merged.useLLM = stored.useLLM;
    if (stored.categories && typeof stored.categories === "object") {
      Object.keys(defaults.categories).forEach(function (id) {
        if (typeof stored.categories[id] === "boolean") {
          merged.categories[id] = stored.categories[id];
        }
      });
    }
    return merged;
  }

  function loadSettings() {
    try {
      Storage.get(Settings.DEFAULTS, function (items) {
        settings = mergeSettings(Settings.DEFAULTS, items);
      });
    } catch (err) {
      settings = JSON.parse(JSON.stringify(Settings.DEFAULTS));
    }
  }

  function isEnabled(categoryId) {
    return settings.enabled === true && settings.categories[categoryId] === true;
  }

  function sendNow() {
    Modal.hide();
    bypass = true;
    var sent = Dom.sendMessage();
    if (!sent) {
      console.warn("ChatGuard: could not programmatically send the message.");
    }
  }

  // Estimate and accumulate the cost of a message the user actually sends to
  // the chatbot: prompt tokens from the message text plus an assumed answer.
  // Uses the same shared model as the "saved" counter, so both stay comparable.
  function recordUsage(text) {
    var impact = Impact.estimateImpact(
      Impact.estimatePromptTokens(text),
      Impact.MODEL.assumedAnswerTokens
    );
    if (!(impact.kwh > 0)) return;
    Storage.getLocal({ usageElectricityKwh: 0, usageWaterL: 0, usageCarbonG: 0 }, function (items) {
      Storage.setLocal({
        usageElectricityKwh: (items.usageElectricityKwh || 0) + impact.kwh,
        usageWaterL: (items.usageWaterL || 0) + impact.waterL,
        usageCarbonG: (items.usageCarbonG || 0) + impact.carbonG
      });
    });
  }

  // Send a message and count its estimated cost — used whenever a message is
  // actually going out (safe sends and "Send anyway").
  function sendSafely(text) {
    recordUsage(text);
    sendNow();
  }

  function howtoImpactText(impact) {
    return (
      "Estimated impact if an AI chatbot answered this: ⚡ ~" +
      Impact.format.electricity(impact.kwh) +
      " · 💧 ~" +
      Impact.format.water(impact.waterL) +
      " · 🌍 ~" +
      Impact.format.carbon(impact.carbonG)
    );
  }

  function editMessage() {
    // The user went back to edit — drop cached attachment text so that if
    // they remove the file, the next send won't re-flag it.
    attachments.length = 0;
    Dom.focusComposer();
  }

  // Only backing out of a "how to" query counts as saved resources. The credit
  // is the counterfactual impact of the chatbot answering it, estimated with
  // the same model used for the "used" counters.
  function editHowToMessage(impact) {
    editMessage();
    Storage.getLocal({ savedElectricityKwh: 0, savedWaterL: 0, savedCarbonG: 0 }, function (items) {
      Storage.setLocal({
        savedElectricityKwh: (items.savedElectricityKwh || 0) + impact.kwh,
        savedWaterL: (items.savedWaterL || 0) + impact.waterL,
        savedCarbonG: (items.savedCarbonG || 0) + impact.carbonG
      });
    });
  }

  function categoryInfo(id) {
    var found = Detector.CATEGORIES.filter(function (c) {
      return c.id === id;
    })[0];
    return found || { id: id, label: id, guidance: "" };
  }

  function rulesMatches(text) {
    return Detector.detect(text).filter(function (hit) {
      return isEnabled(hit.category);
    });
  }

  var attachments = [];

  function rememberFiles(fileList) {
    var files = fileList ? Array.prototype.slice.call(fileList) : [];
    files.forEach(function (file) {
      if (!file || !file.name || file.size > 10000000) return; // skip > 10 MB
      // Store the metadata immediately so the filename is always sent, then
      // fill in the extracted text asynchronously. A fast send on Claude (no
      // <form>, chips outside the composer parent) still sees the filename.
      var entry = {
        name: file.name || "attachment",
        type: file.type || "",
        size: file.size || 0,
        text: ""
      };
      attachments.push(entry);
      if (attachments.length > 8) attachments.shift();
      Files.extractText(file).then(function (text) {
        entry.text = text || "";
        console.log("[ChatGuard] extracted " + file.name + " (" + String(text || "").length + " chars)");
      });
    });
  }

  function onFileChange(event) {
    var target = event.target;
    if (target && target.tagName === "INPUT" && target.type === "file") {
      console.log("[ChatGuard] file input change: " + (target.files ? target.files.length : 0) + " file(s)");
      rememberFiles(target.files);
    }
  }

  function onDrop(event) {
    if (event.dataTransfer && event.dataTransfer.files && event.dataTransfer.files.length) {
      console.log("[ChatGuard] drop: " + event.dataTransfer.files.length + " file(s)");
      rememberFiles(event.dataTransfer.files);
    }
  }

  function onPaste(event) {
    var dt = event.clipboardData;
    if (dt && dt.files && dt.files.length) {
      console.log("[ChatGuard] paste: " + dt.files.length + " file(s)");
      rememberFiles(dt.files);
    }
  }

  function detectFilenameAttachments() {
    var names = [];
    try {
      var composer = Dom.getComposer();
      if (!composer) return names;

      // ChatGPT wraps the composer in a <form>; Claude and Gemini do not, and
      // render the attachment chips outside the composer's immediate parent.
      // Walk up to the nearest ancestor that also holds the hidden file input
      // (that is where the chips live).
      var container = composer.closest("form, fieldset");
      if (!container) {
        var node = composer;
        for (var i = 0; i < 12 && node; i++) {
          node = node.parentElement;
          if (!node) break;
          if (node.querySelector && node.querySelector('input[type="file"]')) {
            container = node;
            break;
          }
        }
      }
      if (!container) container = composer.parentElement;

      var text = container ? (container.innerText || "") : "";
      var re = /[^\s()[\]"']+\.(?:pdf|docx?|txt|md|csv|json|xml|html?|xlsx?|pptx?|rtf|png|jpe?g)/gi;
      var m;
      while ((m = re.exec(text)) !== null) {
        var name = m[0].toLowerCase();
        if (names.indexOf(name) === -1) names.push(name);
      }
    } catch (err) {
      /* ignore */
    }
    return names;
  }

  function currentAttachments() {
    var list = attachments.slice();
    detectFilenameAttachments().forEach(function (name) {
      var exists = list.some(function (a) {
        return (a.name || "").toLowerCase() === name;
      });
      if (!exists) list.push({ name: name, type: "", size: 0, text: "" });
    });
    var result = list.slice(-5);
    console.log(
      "[ChatGuard] sending with " + result.length + " attachment(s): " +
        result.map(function (a) { return a.name; }).join(", ")
    );
    return result;
  }

  function matchesFromLLM(result) {
    var ids = (result.categories || []).filter(isEnabled);
    return ids.map(function (id) {
      var cat = categoryInfo(id);
      return {
        category: id,
        label: cat.label,
        guidance: cat.guidance || "",
        matchedPhrases: [],
        reason: result.reason || ""
      };
    });
  }

  function resolveLLM(text, result, fallbackHits) {
    checking = false;
    Modal.hideIndicator();

    if (result && !result.error && typeof result.flagged === "boolean") {
      if (result.flagged) {
        var matches = matchesFromLLM(result);
        if (matches.length) {
          Modal.show({
            matches: matches,
            onSendAnyway: function () { sendSafely(text); },
            onEdit: editMessage
          });
          return;
        }
        // The LLM flagged only categories the user has disabled — send.
        sendSafely(text);
        return;
      }
      // The LLM judged the message safe — send.
      sendSafely(text);
      return;
    }

    // LLM unavailable/error/timeout — fall back to the local rules.
    if (fallbackHits && fallbackHits.length) {
      Modal.show({
        matches: fallbackHits,
        onSendAnyway: function () { sendSafely(text); },
        onEdit: editMessage
      });
    } else {
      sendSafely(text);
    }
  }

  function llmClassify(text, attachments) {
    return new Promise(function (resolve) {
      var done = false;
      var timer = setTimeout(function () {
        if (done) return;
        done = true;
        resolve({ error: "timeout" });
      }, 15000);

      try {
        chrome.runtime.sendMessage(
          { type: "chatguard_classify", text: text, attachments: attachments || [] },
          function (response) {
            if (done) return;
            done = true;
            clearTimeout(timer);
            if (chrome.runtime.lastError) {
              resolve({ error: "no_background" });
              return;
            }
            resolve(response || { error: "empty" });
          }
        );
      } catch (err) {
        if (!done) {
          done = true;
          clearTimeout(timer);
          resolve({ error: String(err) });
        }
      }
    });
  }

  function handleEvent(event) {
    if (bypass) {
      bypass = false;
      return;
    }
    if (!settings.enabled) return;

    // While a check is in flight, only Escape cancels it.
    if (checking) {
      if (event.type === "keydown" && event.key === "Escape") {
        checkToken++;
        checking = false;
        Modal.hideIndicator();
        editMessage();
      }
      return;
    }

    var composer = Dom.getComposer();
    if (!composer) return;

    var isTrigger = false;
    if (event.type === "keydown") {
      isTrigger = Dom.isEnterToSend(event) && Dom.isComposerTarget(event.target, composer);
    } else if (event.type === "click") {
      isTrigger = Dom.isSendButtonTarget(event.target);
    }
    if (!isTrigger) return;

    var text = Dom.readComposerText();
    if (!text) return;

    // "How to" queries get an awareness nudge directly (no LLM round-trip).
    if (/\bhow to\b/i.test(text)) {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      var howtoImpact = Impact.estimateImpact(
        Impact.estimatePromptTokens(text),
        Impact.MODEL.assumedAnswerTokens
      );
      Modal.show({
        matches: [
          {
            category: "howto",
            label: "How-to query",
            guidance: "",
            matchedPhrases: [],
            savings: howtoImpactText(howtoImpact)
          }
        ],
        onSendAnyway: function () { sendSafely(text); },
        onEdit: function () { editHowToMessage(howtoImpact); }
      });
      return;
    }

    var hits = rulesMatches(text);

    // Rule-only mode: block only when the local rules flag something.
    if (settings.useLLM === false) {
      if (hits.length === 0) {
        // Not flagged — the message sends normally; count its estimated cost.
        recordUsage(text);
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      Modal.show({
        matches: hits,
        onSendAnyway: function () { sendSafely(text); },
        onEdit: editMessage
      });
      return;
    }

    // LLM mode: analyze every message for context and intent. The send is
    // paused with a subtle indicator, not a blocking modal.
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();

    checking = true;
    var token = ++checkToken;
    Modal.showIndicator();

    var attachments = currentAttachments();
    llmClassify(text, attachments).then(function (result) {
      if (token !== checkToken) return; // cancelled or superseded
      resolveLLM(text, result, hits);
    });
  }

  function init() {
    console.log("[ChatGuard] loaded — LLM analysis + attachment scanning");
    loadSettings();
    document.addEventListener("keydown", handleEvent, true);
    document.addEventListener("click", handleEvent, true);
    document.addEventListener("change", onFileChange, true);
    document.addEventListener("drop", onDrop, true);
    document.addEventListener("paste", onPaste, true);
    try {
      Storage.onChanged(function (changes, area) {
        if (area === "sync") loadSettings();
      });
    } catch (err) {
      /* storage API unavailable in this context — keep defaults */
    }
  }

  init();
})();
