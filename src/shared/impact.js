/**
 * ChatGuard — environmental impact model (estimates, not measurements).
 *
 * Both the "used" and the "saved" counters derive from the same formulas so
 * they remain directly comparable:
 *
 *   energy (kWh) = promptTokens * kWhPerPromptToken
 *                + completionTokens * kWhPerCompletionToken
 *   carbon  (g)  = energy * carbonGPerKwh          (grid intensity)
 *   water   (L)  = energy * waterLPerKwh           (embedded grid water)
 *
 * Reference points for the defaults (labelled "est." in the UI — spot-check the
 * sources before publication):
 *   - Inference energy — Solovyeva et al. (2026): on consumer hardware a
 *     prefill token costs ~0.13 J (3.61e-8 kWh) and a decode token ~1.06 J
 *     (2.94e-7 kWh) — decode costs ~8x prefill because it is memory-bandwidth
 *     bound. Quantisation lowers the decode cost further.
 *   - Grid carbon intensity — ~480 gCO2e/kWh global average (Ember 2024);
 *     ~19.6 in France, ~369 in the US, ~820 in coal-heavy regions.
 *   - Water — a local machine uses no on-site cooling water, so the model uses
 *     the water embedded in electricity generation: ~3.14 L/kWh (range
 *     3.14–6.01; Li et al. 2023).
 *   - Answer length — ~300 completion tokens for a typical chat answer
 *     (ML.ENERGY benchmark). PUE is 1.0 for a local machine, so no PUE
 *     multiplier is applied.
 *
 * Loaded as a classic script (content script and popup) and required in Node
 * tests. No dependencies, ES5-compatible.
 */
(function (global) {
  "use strict";

  var MODEL = {
    // Energy per token (kWh). Decode ~8x prompt: prefill is compute-bound,
    // decode is memory-bandwidth bound (weights + KV cache reloaded per token).
    kWhPerPromptToken: 3.61e-8,     // ~0.13 J per prefill token
    kWhPerCompletionToken: 2.94e-7, // ~1.06 J per decode token
    // Grid carbon intensity: gCO2e per kWh (global average).
    carbonGPerKwh: 480,
    // Water embedded in electricity generation: litres per kWh. A local machine
    // has ~0 on-site cooling water, so this is the off-site (grid) water.
    waterLPerKwh: 3.14,
    // Counterfactual: assumed chatbot answer length (tokens) for a "how to"
    // query that the user backs out of.
    assumedAnswerTokens: 300,
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
