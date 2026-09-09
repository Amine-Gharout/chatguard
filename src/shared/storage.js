/**
 * ChatGuard — cross-browser storage wrapper.
 *
 * Firefox and Safari expose a promise-based `browser.storage`; Chrome exposes
 * a callback-based `chrome.storage`. This normalizes both to a single
 * callback interface so the rest of the code is browser-agnostic.
 * Attached to globalThis as ChatGuardStorage.
 */
(function (global) {
  "use strict";

  var hasBrowserApi =
    typeof browser !== "undefined" &&
    browser !== null &&
    typeof browser.storage === "object" &&
    browser.storage !== null;

  function get(defaults, callback) {
    if (hasBrowserApi) {
      browser.storage.sync.get(defaults).then(callback);
    } else {
      chrome.storage.sync.get(defaults, callback);
    }
  }

  function set(items) {
    if (hasBrowserApi) {
      browser.storage.sync.set(items).catch(function () {});
    } else {
      chrome.storage.sync.set(items);
    }
  }

  function onChanged(listener) {
    var target = hasBrowserApi ? browser : chrome;
    if (target.storage && target.storage.onChanged) {
      target.storage.onChanged.addListener(listener);
    }
  }

  global.ChatGuardStorage = { get: get, set: set, onChanged: onChanged };
})(typeof globalThis !== "undefined" ? globalThis : this);
