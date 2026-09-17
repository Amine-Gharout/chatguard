"use strict";

const assert = require("node:assert");
const impact = require("../src/shared/impact.js");

let passed = 0;
function test(name, fn) {
  try {
    fn();
    passed += 1;
    console.log("  \u2713 " + name);
  } catch (err) {
    console.error("  \u2717 " + name);
    throw err;
  }
}

console.log("ChatGuard impact tests");

test("zero tokens produce zero impact", () => {
  const r = impact.estimateImpact(0, 0);
  assert.strictEqual(r.kwh, 0);
  assert.strictEqual(r.carbonG, 0);
  assert.strictEqual(r.waterL, 0);
});

test("prompt and completion tokens use distinct energy rates", () => {
  assert.strictEqual(impact.estimateImpact(1000, 0).kwh, 1000 * 3.61e-8);
  assert.strictEqual(impact.estimateImpact(0, 1000).kwh, 1000 * 2.94e-7);
});

test("carbon equals energy times grid intensity", () => {
  const r = impact.estimateImpact(1000, 0);
  assert.strictEqual(r.carbonG, r.kwh * 480);
});

test("water equals energy times embedded-grid water", () => {
  const r = impact.estimateImpact(1000, 0);
  assert.strictEqual(r.waterL, r.kwh * 3.14);
});

test("negative token counts are clamped to zero", () => {
  const r = impact.estimateImpact(-5, -3);
  assert.strictEqual(r.kwh, 0);
});

test("prompt tokens are estimated from text length", () => {
  assert.strictEqual(impact.estimatePromptTokens("how to dance"), 3); // 12 chars / 4
  assert.strictEqual(impact.estimatePromptTokens("hi"), 1);
});

test("empty or whitespace text yields zero prompt tokens", () => {
  assert.strictEqual(impact.estimatePromptTokens(""), 0);
  assert.strictEqual(impact.estimatePromptTokens("   "), 0);
});

test("energy formatting adapts to magnitude", () => {
  assert.strictEqual(impact.format.electricity(0), "0 Wh");
  assert.strictEqual(impact.format.electricity(0.006), "6.00 Wh");
  assert.strictEqual(impact.format.electricity(0.0005), "0.500 Wh");
  assert.strictEqual(impact.format.electricity(2), "2.000 kWh");
});

test("water formatting adapts to magnitude", () => {
  assert.strictEqual(impact.format.water(0), "0 mL");
  assert.strictEqual(impact.format.water(0.003), "3.00 mL");
  assert.strictEqual(impact.format.water(2), "2.00 L");
});

test("carbon formatting adapts to magnitude", () => {
  assert.strictEqual(impact.format.carbon(0), "0 g CO\u2082e");
  assert.strictEqual(impact.format.carbon(0.1), "0.100 g CO\u2082e");
  assert.strictEqual(impact.format.carbon(2000), "2.000 kg CO\u2082e");
});

console.log("  " + passed + " tests passed");
