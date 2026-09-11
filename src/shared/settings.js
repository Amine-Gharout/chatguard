/**
 * Critty — shared settings schema.
 * Loaded as a classic script (content script + popup) and attached to
 * globalThis. No build step.
 */
(function (global) {
  "use strict";

  var DEFAULTS = {
    enabled: true,
    useLLM: true,
    categories: {
      romantic: true,
      distress: true,
      self_harm: true,
      violence: true,
      sexual: true,
      hate: true,
      personal_info: true,
      dangerous: true
    }
  };

  global.CrittySettings = { DEFAULTS: DEFAULTS };
})(typeof globalThis !== "undefined" ? globalThis : this);
