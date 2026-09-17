/**
 * ChatGuard — background classifier (Chromium).
 *
 * Classifies a message the user is about to send using a local,
 * OpenAI-compatible server (e.g. Ollama). The endpoint and model are
 * configured in the popup. Runs as an MV3 service worker, which is required
 * to bypass the API's CORS restrictions.
 */
"use strict";

const LOCAL_DEFAULT_URL = "http://127.0.0.1:11434/v1/chat/completions";
const LOCAL_DEFAULT_MODEL = "qwen2.5:7b-instruct";

const SYSTEM_PROMPT =
  "You classify a message a user is about to send to an AI chatbot, to help " +
  "users pause before sending sensitive content. Judge intent and context, not " +
  "keywords alone: a word in a harmless context (e.g. reporting \"I found a bomb\", " +
  "discussing a feeling in a creative context, quoting text) is NOT flagged. " +
  "Categories: " +
  "romantic = affectionate, dating, or intimate language directed at the AI itself (e.g. \"I love you\", \"will you be my girlfriend\", \"I miss you\"); " +
  "distress = signs of depression, loneliness, or hopelessness; " +
  "self_harm = suicide or self-injury crisis language; " +
  "violence = requests or descriptions of graphic violence, gore, or horror; " +
  "sexual = sexually explicit requests or content; " +
  "hate = hate speech or abuse toward people or groups; " +
  "personal_info = the user is about to share, or an attached document contains, passwords, addresses, phone numbers, emails, SSNs, card numbers, ID or passport numbers, or other identifying details; " +
  "dangerous = requests for weapons, drugs, hacking, fraud, or other illegal activity. " +
  "If the message includes attached document text, analyze it too, especially for personal/identifying information. " +
  'Return JSON only, in exactly this shape: {"flagged": true|false, "categories": ["..."], "reason": "one short sentence"}. ' +
  'If nothing is flagged return {"flagged": false, "categories": [], "reason": ""}.';

function storageGet(defaults) {
  return new Promise((resolve) => {
    try {
      chrome.storage.local.get(defaults, resolve);
    } catch (e) {
      resolve(defaults);
    }
  });
}

async function getConfig() {
  const items = await storageGet({
    localBaseUrl: LOCAL_DEFAULT_URL,
    localModel: LOCAL_DEFAULT_MODEL
  });
  return {
    localBaseUrl: items.localBaseUrl || LOCAL_DEFAULT_URL,
    localModel: items.localModel || LOCAL_DEFAULT_MODEL
  };
}

function normalize(result) {
  const categories =
    result && Array.isArray(result.categories)
      ? result.categories.filter((c) => typeof c === "string")
      : [];
  return {
    flagged: Boolean(result && result.flagged),
    categories: categories,
    reason: result && typeof result.reason === "string" ? result.reason : ""
  };
}

function buildUserContent(text, attachments) {
  const parts = ["User's message to the chatbot:\n" + text];
  const list = Array.isArray(attachments) ? attachments : [];
  if (list.length) {
    parts.push(
      "\n\nThe user has attached the following documents. Analyze their content too — especially for personal/identifying information (names, addresses, phone numbers, emails, ID/passport numbers, bank details, etc.):"
    );
    list.forEach((a) => {
      const header =
        "\n--- FILE: " + (a.name || "attachment") + (a.type ? " (" + a.type + ")" : "") + " ---\n";
      const body = a.text && String(a.text).trim() ? a.text : "[text could not be extracted]";
      parts.push(header + body);
    });
  }
  const combined = parts.join("\n");
  return combined.length > 24000 ? combined.slice(0, 24000) : combined;
}

async function classify(text, attachments) {
  const cfg = await getConfig();
  const userContent = buildUserContent(text, attachments);

  const res = await fetch(cfg.localBaseUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: cfg.localModel,
      temperature: 0,
      max_tokens: 300,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userContent }
      ]
    })
  });

  if (!res.ok) return { error: "http_" + res.status };

  const data = await res.json();

  const content =
    data &&
    data.choices &&
    data.choices[0] &&
    data.choices[0].message &&
    data.choices[0].message.content;

  if (typeof content !== "string") return { error: "empty_response" };

  try {
    return normalize(JSON.parse(content));
  } catch (e) {
    return { error: "bad_json" };
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || message.type !== "chatguard_classify") return false;
  classify(String(message.text || ""), message.attachments)
    .then(sendResponse)
    .catch((err) => sendResponse({ error: String(err) }));
  return true; // keep the message channel open for the async response
});
