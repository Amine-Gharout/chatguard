/**
 * ChatGuard — content script bootstrap.
 *
 * Intercepts the user-triggered send paths (Enter keydown + send-button click)
 * in the capture phase, runs the detector, and blocks the send with a confirm
 * modal. Runs fully locally; no data leaves the page.
 */
(function () {
  "use strict";

  var Detector = globalThis.ChatGuardDetector;
  var Dom = globalThis.ChatGuardDom;
  var Modal = globalThis.ChatGuardModal;
  var Settings = globalThis.ChatGuardSettings;
  var Storage = globalThis.ChatGuardStorage;

  var settings = JSON.parse(JSON.stringify(Settings.DEFAULTS));
  var bypass = false;

  function mergeSettings(defaults, stored) {
    var merged = JSON.parse(JSON.stringify(defaults));
    if (!stored) return merged;
    if (typeof stored.enabled === "boolean") merged.enabled = stored.enabled;
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

  function handleEvent(event) {
    if (bypass) {
      bypass = false;
      return;
    }
    if (!settings.enabled) return;

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

    var relevant = Detector.detect(text).filter(function (hit) {
      return isEnabled(hit.category);
    });
    if (relevant.length === 0) return;

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();

    Modal.show({
      matches: relevant,
      onSendAnyway: function () {
        bypass = true;
        var sent = Dom.sendMessage();
        if (!sent) {
          // Should not normally happen; keep the user informed rather than
          // silently dropping the message.
          console.warn("ChatGuard: could not programmatically send the message.");
        }
      },
      onEdit: function () {
        Dom.focusComposer();
      }
    });
  }

  function init() {
    loadSettings();
    document.addEventListener("keydown", handleEvent, true);
    document.addEventListener("click", handleEvent, true);
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
