/**
 * Critty — cross-browser storage wrapper.
 *
 * Firefox and Safari expose a promise-based `browser.storage`; Chrome exposes
 * a callback-based `chrome.storage`. This normalizes both to a single
 * callback interface so the rest of the code is browser-agnostic.
 * Attached to globalThis as CrittyStorage.
 */
(function (global) {
  "use strict";

  var hasBrowserApi =
    typeof browser !== "undefined" &&
    browser !== null &&
    typeof browser.storage === "object" &&
    browser.storage !== null;

  function getArea(area, defaults, callback) {
    if (hasBrowserApi) {
      browser.storage[area].get(defaults).then(callback);
    } else {
      chrome.storage[area].get(defaults, callback);
    }
  }

  function setArea(area, items) {
    if (hasBrowserApi) {
      browser.storage[area].set(items).catch(function () {});
    } else {
      chrome.storage[area].set(items);
    }
  }

  function get(defaults, callback) {
    getArea("sync", defaults, callback);
  }

  function set(items) {
    setArea("sync", items);
  }

  function getLocal(defaults, callback) {
    getArea("local", defaults, callback);
  }

  function setLocal(items) {
    setArea("local", items);
  }

  function onChanged(listener) {
    var target = hasBrowserApi ? browser : chrome;
    if (target.storage && target.storage.onChanged) {
      target.storage.onChanged.addListener(listener);
    }
  }

  global.CrittyStorage = {
    get: get,
    set: set,
    getLocal: getLocal,
    setLocal: setLocal,
    onChanged: onChanged
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
