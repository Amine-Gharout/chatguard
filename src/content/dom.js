/**
 * Critty — ChatGPT DOM helpers.
 *
 * ChatGPT is a React SPA whose markup changes between releases, so every
 * lookup walks a list of candidate selectors and caches the first live hit.
 * Attached to globalThis as CrittyDom.
 */
(function (global) {
  "use strict";

  var COMPOSER_SELECTORS = [
    "div#prompt-textarea",
    "#prompt-textarea",
    "div[contenteditable='true'][id='prompt-textarea']",
    "div.ql-editor[contenteditable='true']",
    "div.ProseMirror[contenteditable='true']",
    "div[data-testid='chat-input']",
    ".ProseMirror",
    "textarea#prompt-textarea",
    "div[contenteditable='true']",
    "textarea[placeholder]",
    "[role='textbox']"
  ];

  var SEND_BUTTON_SELECTORS = [
    "button[data-testid='chat-input-send']",
    "button[data-testid='send-button']",
    "button[aria-label='Send prompt']",
    "button[aria-label='Send message']",
    "button[aria-label='Send Message']",
    "button[aria-label^='Send']",
    "button[aria-label*='send' i]",
    "form button[type='submit']"
  ];

  var composerCache = null;
  var sendButtonCache = null;

  function queryFirst(selectors) {
    for (var i = 0; i < selectors.length; i++) {
      var els = document.querySelectorAll(selectors[i]);
      for (var j = 0; j < els.length; j++) {
        var el = els[j];
        if (!el.isConnected) continue;
        // Skip hidden editor clones (e.g. Quill's 0x1 clipboard node on Gemini).
        if (el.offsetWidth < 8 && el.offsetHeight < 8) continue;
        return el;
      }
    }
    return null;
  }

  function getComposer() {
    if (composerCache && composerCache.isConnected) return composerCache;
    composerCache = queryFirst(COMPOSER_SELECTORS);
    return composerCache;
  }

  function getSendButton() {
    if (sendButtonCache && sendButtonCache.isConnected) return sendButtonCache;
    sendButtonCache = queryFirst(SEND_BUTTON_SELECTORS);
    return sendButtonCache;
  }

  function readComposerText() {
    var composer = getComposer();
    if (!composer) return "";
    if (composer.value !== undefined) return composer.value;
    return composer.innerText || composer.textContent || "";
  }

  function isComposerTarget(target, composer) {
    return !!(composer && target && (target === composer || composer.contains(target)));
  }

  function isSendButtonTarget(target) {
    if (!target) return false;
    var button = getSendButton();
    return !!(button && (target === button || button.contains(target)));
  }

  function isEnterToSend(event) {
    return (
      event.key === "Enter" &&
      !event.shiftKey &&
      !event.isComposing &&
      !event.ctrlKey &&
      !event.metaKey &&
      !event.altKey
    );
  }

  function focusComposer() {
    var composer = getComposer();
    if (composer && typeof composer.focus === "function") composer.focus();
  }

  /**
   * Best-effort programmatic send. Clicking the real send button is the most
   * reliable path (React handles its own click handler). Falls back to
   * synthesizing an Enter keydown on the composer. Returns false if neither
   * path could be attempted; callers should surface that to the user.
   */
  function sendMessage() {
    var button = getSendButton();
    if (button && !button.disabled) {
      button.click();
      return true;
    }
    var composer = getComposer();
    if (composer) {
      var opts = {
        key: "Enter",
        code: "Enter",
        keyCode: 13,
        which: 13,
        bubbles: true,
        cancelable: true
      };
      try {
        composer.dispatchEvent(new KeyboardEvent("keydown", opts));
        return true;
      } catch (err) {
        return false;
      }
    }
    return false;
  }

  global.CrittyDom = {
    getComposer: getComposer,
    getSendButton: getSendButton,
    readComposerText: readComposerText,
    isComposerTarget: isComposerTarget,
    isSendButtonTarget: isSendButtonTarget,
    isEnterToSend: isEnterToSend,
    focusComposer: focusComposer,
    sendMessage: sendMessage
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
