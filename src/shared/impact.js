/**
 * ChatGuard — environmental impact model (estimates, not measurements).
 *
 * Both the "used" and the "saved" counters derive from the same formulas so
 * they remain directly comparable:
 *
 *   energy (kWh) = promptTokens * kWhPerPromptToken
 *                + completionTokens * kWhPerCompletionToken
 *   carbon  (g)  = energy * carbonGPerKwh          (grid intensity)
 *   water   (L)  = energy * waterLPerKwh           (data-centre WUE)
 *
 * Reference points for the defaults (order-of-magnitude, labelled "est." in
 * the UI):
 *   - Inference energy — Luccioni, Jernite & Strubell, "Power Hungry
 *     Processing" (ACM FAccT '24, arXiv:2311.16863): text generation costs
 *     ~0.047 kWh per 1,000 inferences. Completion (decoding) tokens cost ~2x
 *     prompt (prefill) tokens because decoding is memory-bandwidth bound.
 *   - Water usage effectiveness (WUE) — 0.91 L/kWh = Equinix global average
 *     2025 (published range 0 L/kWh air-cooled → 2.5 L/kWh evaporative).
 *   - Grid carbon intensity — ~430 gCO2e/kWh global average (~2022); varies
 *     from ~60 g (France) to ~800+ g (coal-heavy grids).
 *
 * Loaded as a classic script (content script, popup, service worker via
 * importScripts) and required in Node tests. No dependencies, ES5-compatible.
 */
(function (global) {
  "use strict";

  var MODEL = {
    // Energy per token (kWh). Completion ~2x prompt because decoding is
    // memory-bandwidth bound.
    kWhPerPromptToken: 3e-7,      // 0.3 kWh per 1,000,000 prompt tokens
    kWhPerCompletionToken: 6e-7,  // 0.6 kWh per 1,000,000 completion tokens
    // Grid carbon intensity: gCO2e per kWh (global average).
    carbonGPerKwh: 430,
    // On-site data-centre cooling water: litres per kWh of IT energy.
    waterLPerKwh: 0.91,
    // Counterfactual: assumed chatbot answer length (tokens) for a "how to"
    // query that the user backs out of.
    assumedAnswerTokens: 400,
    // Rough tokeniser ratio used to estimate prompt tokens from raw text
    // (English averages ~4 characters per token).
    charsPerToken: 4
  };

  function estimatePromptTokens(text) {
    var chars = String(text || "").trim().length;
    return chars ? Math.max(1, Math.ceil(chars / MODEL.charsPerToken)) : 0;
  }

  function estimateImpact(promptTokens, completionTokens) {
    var pt = Math.max(0, Number(promptTokens) || 0);
    var ct = Math.max(0, Number(completionTokens) || 0);
    var kwh = pt * MODEL.kWhPerPromptToken + ct * MODEL.kWhPerCompletionToken;
    return {
      promptTokens: pt,
      completionTokens: ct,
      kwh: kwh,
      carbonG: kwh * MODEL.carbonGPerKwh,
      waterL: kwh * MODEL.waterLPerKwh
    };
  }

  function formatElectricity(kwh) {
    var v = Number(kwh) || 0;
    if (v <= 0) return "0 Wh";
    if (v < 1) {
      var wh = v * 1000;
      return (wh < 1 ? wh.toFixed(3) : wh.toFixed(2)) + " Wh";
    }
    return v.toFixed(3) + " kWh";
  }

  function formatWater(litres) {
    var v = Number(litres) || 0;
    if (v <= 0) return "0 mL";
    if (v < 1) {
      var ml = v * 1000;
      return (ml < 1 ? ml.toFixed(3) : ml.toFixed(2)) + " mL";
    }
    return v.toFixed(2) + " L";
  }

  function formatCarbon(grams) {
    var v = Number(grams) || 0;
    if (v <= 0) return "0 g CO\u2082e";
    if (v < 1) return v.toFixed(3) + " g CO\u2082e";
    if (v < 1000) return v.toFixed(2) + " g CO\u2082e";
    return (v / 1000).toFixed(3) + " kg CO\u2082e";
  }

  var api = {
    MODEL: MODEL,
    estimatePromptTokens: estimatePromptTokens,
    estimateImpact: estimateImpact,
    format: {
      electricity: formatElectricity,
      water: formatWater,
      carbon: formatCarbon
    }
  };

  global.ChatGuardImpact = api;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
