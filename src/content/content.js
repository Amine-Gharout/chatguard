/**
 * ChatGuard — content script bootstrap.
 *
 * Intercepts the user-triggered send paths (Enter keydown + send-button click)
 * in the capture phase. In LLM mode every message is analyzed by the background
 * classifier for context and intent; a subtle non-blocking indicator shows while
 * the check runs, and only flagged messages interrupt with the confirm modal.
 * Without the LLM, the local rule engine decides directly.
 *
 * Privacy: in LLM mode the message text is sent to DeepSeek for classification.
 * Rule-only mode is fully local.
 */
(function () {
  "use strict";

  var Detector = globalThis.ChatGuardDetector;
  var Dom = globalThis.ChatGuardDom;
  var Modal = globalThis.ChatGuardModal;
  var Settings = globalThis.ChatGuardSettings;
  var Storage = globalThis.ChatGuardStorage;
  var Files = globalThis.ChatGuardFiles;

  var settings = JSON.parse(JSON.stringify(Settings.DEFAULTS));
  var bypass = false;
  var checking = false;
  var checkToken = 0;

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

  function editMessage() {
    Dom.focusComposer();
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
      Files.extractText(file).then(function (text) {
        attachments.push({
          name: file.name || "attachment",
          type: file.type || "",
          size: file.size || 0,
          text: text || ""
        });
        if (attachments.length > 8) attachments.shift();
      });
    });
  }

  function onFileChange(event) {
    var target = event.target;
    if (target && target.tagName === "INPUT" && target.type === "file") {
      rememberFiles(target.files);
    }
  }

  function onDrop(event) {
    if (event.dataTransfer && event.dataTransfer.files && event.dataTransfer.files.length) {
      rememberFiles(event.dataTransfer.files);
    }
  }

  function onPaste(event) {
    var dt = event.clipboardData;
    if (dt && dt.files && dt.files.length) {
      rememberFiles(dt.files);
    }
  }

  function currentAttachments() {
    if (!attachments.length) return [];
    var containerText = "";
    try {
      var composer = Dom.getComposer();
      var container = composer ? (composer.closest("form") || composer.parentElement) : null;
      containerText = container ? (container.innerText || "").toLowerCase() : "";
    } catch (err) {
      containerText = "";
    }
    var visible = attachments.filter(function (a) {
      var name = (a.name || "").toLowerCase();
      return name && containerText.indexOf(name) !== -1;
    });
    return (visible.length ? visible : attachments).slice(-5);
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

  function resolveLLM(result, fallbackHits) {
    checking = false;
    Modal.hideIndicator();

    if (result && !result.error && typeof result.flagged === "boolean") {
      if (result.flagged) {
        var matches = matchesFromLLM(result);
        if (matches.length) {
          Modal.show({
            matches: matches,
            onSendAnyway: sendNow,
            onEdit: editMessage
          });
          return;
        }
        // The LLM flagged only categories the user has disabled — send.
        sendNow();
        return;
      }
      // The LLM judged the message safe — send.
      sendNow();
      return;
    }

    // LLM unavailable/error/timeout — fall back to the local rules.
    if (fallbackHits && fallbackHits.length) {
      Modal.show({ matches: fallbackHits, onSendAnyway: sendNow, onEdit: editMessage });
    } else {
      sendNow();
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

    var hits = rulesMatches(text);

    // Rule-only mode: block only when the local rules flag something.
    if (settings.useLLM === false) {
      if (hits.length === 0) return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      Modal.show({ matches: hits, onSendAnyway: sendNow, onEdit: editMessage });
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
      resolveLLM(result, hits);
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
