"use strict";

const assert = require("node:assert");
const detector = require("../src/shared/detector.js");

function categoriesOf(text) {
  return detector.detect(text).map((hit) => hit.category);
}

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

console.log("ChatGuard detector tests");

test("detects 'I love you'", () => {
  assert.ok(categoriesOf("I love you").includes("romantic"));
});

test("detects a valentine ask", () => {
  assert.ok(categoriesOf("Will you be my valentine?").includes("romantic"));
});

test("detects curly apostrophe input", () => {
  assert.ok(categoriesOf("I\u2019m in love with you").includes("romantic"));
});

test("ignores 'I love this tool'", () => {
  assert.deepStrictEqual(categoriesOf("I love this tool"), []);
});

test("ignores 'I missed the meeting'", () => {
  assert.deepStrictEqual(categoriesOf("I missed the meeting"), []);
});

test("ignores a code snippet", () => {
  assert.deepStrictEqual(
    categoriesOf("for (let i = 0; i < 10; i++) { console.log(i); }"),
    []
  );
});

test("ignores empty / whitespace input", () => {
  assert.deepStrictEqual(categoriesOf("   \n\t "), []);
});

test("returns the matched phrase in the result", () => {
  const hits = detector.detect("I love you");
  assert.ok(hits[0].matchedPhrases.some((phrase) => phrase === "i love you"));
});

test("detects a depression phrase", () => {
  assert.ok(categoriesOf("I'm so depressed and lonely").includes("distress"));
});

test("detects a self-harm crisis phrase", () => {
  assert.ok(categoriesOf("I want to kill myself").includes("self_harm"));
});

test("detects a graphic violence phrase", () => {
  assert.ok(categoriesOf("how to kill someone").includes("violence"));
});

test("detects a sexually explicit phrase", () => {
  assert.ok(categoriesOf("send me nudes").includes("sexual"));
});

test("detects a hateful phrase", () => {
  assert.ok(categoriesOf("I hate you").includes("hate"));
});

test("detects personal info disclosure", () => {
  assert.ok(categoriesOf("my password is hunter2").includes("personal_info"));
});

test("detects a dangerous activity phrase", () => {
  assert.ok(categoriesOf("how to make a bomb").includes("dangerous"));
});

test("ignores 'kill the process'", () => {
  assert.deepStrictEqual(categoriesOf("how do I kill a process in linux?"), []);
});

test("ignores 'I hate broccoli'", () => {
  assert.deepStrictEqual(categoriesOf("I hate broccoli"), []);
});

test("ignores 'I feel down to try that'", () => {
  assert.deepStrictEqual(categoriesOf("I feel down to try that"), []);
});

console.log("All " + passed + " tests passed.");
