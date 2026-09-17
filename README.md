# ChatGuard — Chatbot Send Nudge (CDH Demo)

[![CI](https://github.com/Amine-Gharout/chatguard/actions/workflows/ci.yml/badge.svg)](https://github.com/Amine-Gharout/chatguard/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Manifest V3](https://img.shields.io/badge/Chrome-Manifest%20V3-4285F4.svg)](https://developer.chrome.com/docs/extensions/develop/migrate/what-is-mv3)
[![Dependencies: none](https://img.shields.io/badge/dependencies-none-brightgreen.svg)](package.json)

A Chromium (Manifest V3) browser-extension prototype from a **Cambridge Digital
Humanities** project. When you try to send a sensitive or emotionally loaded
message to **ChatGPT**, **Claude**, or **Gemini**, ChatGuard intercepts the send
and shows a confirm-before-send modal so you can pause and reflect before
continuing. It never blocks you outright — **Send anyway** is always available.

- **Local by default.** Detection is a bundled offline rule engine with no API
  calls, no logging, and no telemetry.
- **Optional AI classifier.** Turn on the local-LLM mode for context-aware
  detection; your message text is then sent to a local server (Ollama) running
  on your own machine, and nothing is logged.
- **Attachment scanning.** Attached DOCX, PDF, and plain-text files are
  converted to text and checked for personal data — filenames included.
- **Resource awareness.** The popup tracks the estimated energy, water and
  carbon impact of the messages you send (and the ones you back out of), using
  published per-token figures — see [Resource tracking](#resource-tracking).
- **Zero build step, zero dependencies.** Plain JavaScript loaded straight into
  the browser; the tests run on Node's built-in `assert`.

**Contents**

- [Research context & ethics](#research-context--ethics)
- [Detection categories](#detection-categories)
- [How it works](#how-it-works)
- [Resource tracking](#resource-tracking)
- [Project structure](#project-structure)
- [Installation — step by step](#installation--step-by-step)
- [Verify it works](#verify-it-works)
- [Demo script](#demo-script)
- [Configuration reference](#configuration-reference)
- [What gets stored](#what-gets-stored)
- [Development](#development)
- [Adding your own category](#adding-your-own-category)
- [Privacy & data flow](#privacy--data-flow)
- [Troubleshooting](#troubleshooting)
- [Notes & limitations](#notes--limitations)
- [Out of scope (by design)](#out-of-scope-by-design)
- [Licence](#licence)

## Research context & ethics

ChatGuard is a working prototype from a Cambridge Digital Humanities project
exploring how people form emotional attachments to AI chatbots, and whether a
light-touch "nudge" can prompt reflection before sharing intimate content.

Design choices reflect this framing:

- **Reflection, not judgement** — the modal asks you to pause; it never
  prevents sending outright (you can always choose **Send anyway**).
- **Careful handling of sensitive content** — categories such as self-harm /
  crisis include supportive copy and helpline numbers rather than shaming
  language.
- **Privacy by default** — everything runs locally: no API calls, no logging,
  no analytics. Detection is a bundled offline rule engine.
- **A prototype, not a guarantee** — rule-based detection can miss paraphrases
  and can false-positive. It is meant for study and discussion, not as a
  substitute for human support.

## Detection categories

| Id | Category | What it flags |
| --- | --- | --- |
| `romantic` | Romantic / flirtatious | affectionate, dating, or intimate language toward the AI |
| `distress` | Emotional distress / depression | sadness, loneliness, hopelessness, low mood |
| `self_harm` | Self-harm / suicide concern | crisis language (the nudge includes helpline info) |
| `violence` | Graphic violence / gore / horror | requests or descriptions of graphic violence |
| `sexual` | Sexually explicit content | explicit sexual requests or language |
| `hate` | Hateful / abusive language | hate speech and abuse toward people or the AI |
| `personal_info` | Personal / identifying information | passwords, addresses, emails, phone numbers, IBANs, SSNs, card numbers, pasted documents |
| `dangerous` | Illegal / dangerous activity | weapons, drugs, hacking, fraud, etc. |

Every category is independently toggleable from the toolbar popup and defaults
to **on**. The rules live in the `CATEGORIES` array of
`src/shared/detector.js`: each category ships word-boundary-aware regular
expressions and a match-count `threshold` (currently `1` for all categories).
Text is normalised first — lower-cased, curly quotes/apostrophes straightened,
whitespace collapsed — so `I’m in love with you` matches the same rule as
`I'm in love with you`.

> **`howto` is not a detector category.** It is a separate awareness nudge
> triggered by the phrase *how to* (see [How it works](#how-it-works)); its
> educational copy lives under `CATEGORY_MESSAGES.howto` in
> `src/content/modal.js`.

## How it works

1. A content script is injected into `chatgpt.com`, `chat.openai.com`,
   `claude.ai`, and `gemini.google.com` at `document_idle`.
2. It listens, in the **capture phase**, for the two user-initiated send
   triggers:
   - pressing **Enter** in the composer (without <kbd>Shift</kbd>), or
   - clicking the **send button**.
3. It reads the composer text and, when the classifier is on, collects any
   attachments.
4. Depending on the mode, the message is either checked synchronously against
   the offline rule engine or sent to the local classifier:

   | Mode | What happens |
   | --- | --- |
   | **Rules only** (`useLLM` off) | The rule engine runs immediately. A hit cancels the send; otherwise the message goes through. |
   | **AI classifier** (`useLLM` on — the default) | The send is paused, a subtle “Analyzing…” pill appears, and the message plus attachment text are classified by the local LLM. Only a flagged message interrupts with the full modal. The check times out after **15 s** and silently falls back to the rule engine. |

5. When something is flagged, the event is cancelled
   (`preventDefault()` + `stopPropagation()` + `stopImmediatePropagation()`)
   and a **Shadow-DOM modal** is rendered, so the chat site's own CSS cannot
   leak in. The modal rotates between several educational messages per
   category (research citations, privacy notes, helpline links).
6. The modal offers two actions:
   - **Send anyway** — re-sends programmatically by clicking the real send
     button under a one-shot bypass flag; if that fails it synthesises an
     <kbd>Enter</kbd> keydown, and only logs a `console.warn` if both paths
     fail.
   - **Edit message** — dismisses the modal, clears cached attachment text (so
     a removed file is not re-flagged), and refocuses the composer.
     <kbd>Esc</kbd> behaves the same as **Edit message**.
7. Pressing <kbd>Esc</kbd> while an LLM check is in flight cancels the check and
   returns to the composer.

### Attachment analysis

Attachments are captured from the file input, drag-and-drop, and paste events,
then converted to plain text using browser APIs only (`DecompressionStream`,
`TextDecoder`, `DOMParser`) — no external libraries:

| Format | Extraction |
| --- | --- |
| `.docx` | ZIP (deflate) → `word/document.xml` → paragraph text |
| `.pdf` | Best-effort text extraction from `FlateDecode` streams (`Tj` / `TJ` operators) |
| `.txt`, `.md`, `.csv`, `.json`, `.xml`, `.html`, and code | UTF-8 decode |

- **Filenames are always included**, even when text extraction fails (e.g. a
  scanned PDF), so obvious PII names such as `passport.pdf` or
  `bank_statement.pdf` are still flagged.
- Files larger than **10 MB** are skipped, at most **8** are remembered, and the
  **5** most recent are analysed on each send.
- Because Claude's and Gemini's attachment chips live outside the composer's
  immediate parent, ChatGuard also scans the surrounding container for
  filename-like text as a secondary signal.
- Extraction results are logged locally for debugging:
  `[ChatGuard] extracted sample.pdf (1234 chars)`.

### “How to” awareness nudge

Any message containing the phrase **“how to”** triggers a dedicated awareness
nudge *before* the LLM is consulted — no round-trip required. The nudge adds an
estimated energy/water/carbon line and educational copy about AI limitations,
data-centre water use, and labour conditions in the AI supply chain. Backing out
of it with **Edit message** credits your **resources saved** counters; sending it
anyway does not. Copy lives in `CATEGORY_MESSAGES.howto` in
`src/content/modal.js`.

### Resource counters

The popup shows two estimated counters — **Resource usage** and
**Resources saved** — each expressed in ⚡ electricity, 💧 water and 🌍 carbon.
Both derive from one shared estimation model, detailed in the
[Resource tracking](#resource-tracking) section below.

### LLM detection (optional, Chromium)

- Set the **base URL** (default `http://127.0.0.1:11434/v1/chat/completions`)
  and the **model** (e.g. `qwen2.5:7b-instruct`) in the popup. ChatGuard then
  talks to your local Ollama server only.
- When on, every message is analysed by the LLM for context and intent before
  sending. A subtle “Analyzing…” pill shows while it runs, and only flagged
  messages interrupt with the full nudge. With the LLM off, the local rules
  decide on their own.
- The system prompt instructs the model to judge intent rather than keywords,
  so a word in a harmless context (reporting *“I found a bomb”*, quoting a
  novel, discussing a feeling in a creative-writing exercise) is **not**
  flagged. It returns strict JSON:
  `{"flagged": bool, "categories": [...], "reason": "one short sentence"}`.
- The request uses `temperature: 0`, `max_tokens: 300`, and
  `response_format: {"type": "json_object"}`. Message plus attachment text is
  truncated to **24 000 characters**.
- Any HTTP error, malformed JSON, empty response, missing service worker, or
  timeout falls back to the rule engine, so ChatGuard keeps working offline.
- Classification runs in an MV3 **service worker**
  (`src/background/service-worker.js`), which is also what lets it bypass the
  API's CORS restrictions — so this mode requires a Chromium browser (Chrome,
  Brave, or Edge).
- Any OpenAI-compatible local server works, not just Ollama — just point
  **Base URL** at it.

## Resource tracking

ChatGuard estimates the environmental cost of **LLM inference** and surfaces it
as three metrics — ⚡ electricity, 💧 water and 🌍 carbon — through two counters
in the popup:

> 📘 A dedicated walkthrough with diagrams lives in [`RESOURCES.md`](RESOURCES.md).

| | **Resource usage** | **Resources saved** |
| --- | --- | --- |
| Question it answers | “How much have your sent messages cost so far (estimated)?” | “How much did you avoid by backing out of *how-to* queries?” |
| Computed by | content script (`src/content/content.js`) | content script (`src/content/content.js`) |
| Data source | the message you send + an assumed 300-token answer | the same estimate, for a *how-to* query you back out of |
| Storage keys | `usageElectricityKwh`, `usageWaterL`, `usageCarbonG` | `savedElectricityKwh`, `savedWaterL`, `savedCarbonG` |
| Active when | both modes — every message actually sent | both modes — only *how-to* queries you abandon |

All six values live in `chrome.storage.local`, are labelled **est.** in the UI,
and are cleared together by the popup's **Reset all** button.

### The estimation model

Both counters share one model in [`src/shared/impact.js`](src/shared/impact.js),
so a saved kilowatt-hour costs exactly as much as a used one:

$$\text{kWh} = \text{promptTokens} \times 3.61\times10^{-8} \;+\; \text{completionTokens} \times 2.94\times10^{-7}$$

$$\text{CO}_2\text{e (g)} = \text{kWh} \times 480 \qquad\qquad \text{water (L)} = \text{kWh} \times 3.14$$

| Parameter | Default | What it is, and where it comes from |
| --- | --- | --- |
| `kWhPerPromptToken` | `3.61e-8` | ~0.13 J per prefill token — Solovyeva et al. (2026), measured on consumer hardware. |
| `kWhPerCompletionToken` | `2.94e-7` | ~1.06 J per decode token — same source; decode is ~8× prefill (memory-bandwidth bound). |
| `carbonGPerKwh` | `480` | Grid carbon intensity in g CO₂e/kWh (Ember 2024 world average). ~19.6 France, ~369 US, ~820 coal-heavy. |
| `waterLPerKwh` | `3.14` | Water embedded in electricity generation, L/kWh (Li et al. 2023, range 3.14–6.01). Local on-site cooling ≈ 0. |
| `assumedAnswerTokens` | `300` | Assumed chatbot answer length (ML.ENERGY typical). |
| `charsPerToken` | `4` | Rough tokeniser ratio used to turn message text into prompt tokens. |

### How “used” works

1. You send any message to the chatbot — a safe send, a **Send anyway**, in
   both rules-only and AI-classifier modes.
2. The content script estimates its cost with the shared model: prompt tokens
   from the text (`ceil(chars ÷ 4)`) plus the assumed 300-token answer.
3. It *adds* the result to the three `usage*` keys (a read–modify–write on
   `chrome.storage.local`).
4. Backing out of a nudge records nothing here — that is what **saved** is for.

### How “saved” works

1. You type a message containing **“how to”** and press send.
2. Before the LLM is consulted, the content script blocks the send and shows the
   awareness nudge. It estimates what the chatbot answering would have cost:
   `promptTokens = ceil(chars ÷ 4)` and `completionTokens = 300`.
3. The nudge displays that estimate inline, e.g.
   `Estimated impact if an AI chatbot answered this: ⚡ ~0.09 Wh · 💧 ~0.28 mL · 🌍 ~0.04 g CO₂e`.
4. If you click **Edit message** (or press <kbd>Esc</kbd>) you back out: the same
   estimate is added to the three `saved*` keys. **Send anyway** credits nothing.

### A worked example

For “how to dance” (12 characters):

| Step | Tokens | Energy |
| --- | --- | --- |
| prompt tokens | `ceil(12 ÷ 4) = 3` | `3 × 3.61e-8 = 1.083e-7 kWh` |
| assumed answer | `300` | `300 × 2.94e-7 = 8.82e-5 kWh` |
| **total** | `303` | **`8.831e-5 kWh` → ~0.09 Wh** |

Then, applying the two coefficients:

- 🌍 carbon: `8.831e-5 × 480 ≈ 0.042 g CO₂e`
- 💧 water: `8.831e-5 × 3.14 ≈ 0.00028 L ≈ 0.28 mL`

A short message such as “hi” (2 chars → 1 prompt token) costs ≈ **0.09 Wh** as
well — the assumed 300-token answer dominates every estimate, so message length
only moves the needle by a few mWh.

### Units & display

The popup picks the most readable unit per value (formatters live in
`src/shared/impact.js`):

- ⚡ electricity — `Wh` below 1 kWh, otherwise `kWh`
- 💧 water — `mL` below 1 L, otherwise `L`
- 🌍 carbon — `g CO₂e` below 1 kg, otherwise `kg CO₂e`

### Scope, caveats & recalibration

- **It models your local model's incremental inference only.** The modal's
  educational quotes cite large cloud models (e.g. “~0.5 L per GPT-3 query”);
  those include training amortisation and full data-centre overhead, so they are
  a different, much larger scope than the counters.
- **Not a meter.** There is no wattmeter between the extension and Ollama —
  these are transparent, citable estimates, which is why the UI labels them
  **est.**.
- **Water = embedded grid water.** A local machine uses no on-site cooling
  water, so `waterLPerKwh = 3.14` models the water embedded in electricity
  generation (range 3.14–6.01; Li et al. 2023).
- **Carbon is grid-dependent.** The default `480 gCO₂e/kWh` is a global average;
  the honest number for your region can differ by an order of magnitude.
- **PUE is 1.0** for a local machine, so no data-centre PUE multiplier is
  applied.
- To change any figure, edit the `MODEL` object at the top of
  `src/shared/impact.js` — both counters and the nudge text update at once. To
  verify the model: `node tests/impact.test.js`.

## Project structure

```
manifest.json                       MV3 manifest (permissions, content scripts, service worker)
package.json                        npm scripts: test, icons — no dependencies
LICENSE                             MIT
icons/                              generated heart icons (icon16/48/128.png)
src/
  shared/
    settings.js                     settings schema + DEFAULTS
    storage.js                      storage wrapper (chrome.storage + browser.* fallback)
    detector.js                     offline rule engine + CATEGORIES
    impact.js                       environmental-impact model (energy · water · carbon)
  content/
    dom.js                          site DOM helpers (resilient selectors, caching)
    files.js                        DOCX / PDF / text extraction (zero dependencies)
    modal.js                        Shadow-DOM modal, “Analyzing…” pill, educational copy
    content.js                      bootstrap: intercept → detect/classify → block → counters
  background/
    service-worker.js               local-LLM classifier (OpenAI-compatible endpoint)
  popup/
    popup.html / popup.css / popup.js   toggles, category switches, LLM config, counters
scripts/
  generate-icons.js                 zero-dependency PNG icon generator
  generate-test-files.js            builds test-assets/ (TXT, PDF, DOCX) with node:zlib
tests/
  detector.test.js                  Node unit tests for the detector
  impact.test.js                    Node unit tests for the impact model
test-assets/
  sample.txt / sample.pdf / sample.docx   PII-bearing fixtures for attachment testing
.github/workflows/ci.yml            CI: detector + impact tests, manifest.json validation
```

## Installation — step by step

ChatGuard runs in **Chromium browsers only** — Google Chrome, Brave, or Microsoft
Edge — on any desktop OS. There is no installer or store build: you load the
source folder straight into your browser. The steps below cover Windows and
Linux; both end in the same Chromium "Load unpacked" step, and only the
terminal commands differ.

### 0. Prerequisites

- A Chromium browser (required): **Google Chrome**, **Brave**, or
  **Microsoft Edge** (any recent version). ChatGuard only runs in Chromium.
- **Ollama** (optional) — only needed for the AI classifier. The rule engine
  runs with no dependencies at all.
- **Git** (optional) — only needed if you clone the repository instead of
  downloading a ZIP.
- **Node.js 20+** (optional) — only needed to run the tests and the asset
  generators (`npm test`, `npm run icons`).

### 1. Get the code

Pick one method.

**Option A — Git (recommended):**

```sh
git clone https://github.com/Amine-Gharout/chatguard.git
cd chatguard
```

If you forked the project, clone your own fork instead. Already have the
folder? Skip to step 2.

**Option B — Download ZIP:**

1. Download the repository as a ZIP file.
2. Unzip it and remember the path of the extracted `chatguard` folder.

### 2. Install a Chromium browser

| OS | How |
| --- | --- |
| Windows | Download **Chrome**, **Brave**, or **Edge** and run the installer. Edge is usually pre-installed. |
| Linux | `sudo apt install chromium-browser` (Debian/Ubuntu) or `sudo dnf install chromium` (Fedora). |

### 3. (Optional) Install Ollama for the AI classifier

The rule engine works without Ollama. Install it only if you want the
context-aware LLM classifier.

**Windows**

1. Download the installer from <https://ollama.com/download> and run it.
2. Open PowerShell and pull the model:

   ```powershell
   ollama pull qwen2.5:7b-instruct
   ```

**Linux**

```sh
curl -fsSL https://ollama.com/install.sh | sh
ollama serve &
ollama pull qwen2.5:7b-instruct
```

Any OpenAI-compatible local server works — just point ChatGuard's **Base URL**
at it in the popup.

### 4. Load the extension in your Chromium browser

This step is identical on Windows and Linux.

1. Open the extensions page of whichever Chromium browser you installed in
   step 2:
   - Chrome: `chrome://extensions`
   - Brave: `brave://extensions`
   - Edge: `edge://extensions`
2. Toggle on **Developer mode** (usually a switch in the top-right corner).
3. Click **Load unpacked** and select the `chatguard` folder (the one containing
   `manifest.json`).
4. Pin ChatGuard from the toolbar puzzle-piece menu so the popup is easy to reach.

### 5. Turn on the AI classifier (optional)

1. Click the ChatGuard toolbar icon to open the popup.
2. Check **AI classifier (Local LLM)**.
3. Confirm the defaults — **Base URL** `http://127.0.0.1:11434/v1/chat/completions`
   and **Model** `qwen2.5:7b-instruct` — or set your own local endpoint.
4. Make sure Ollama is running (`ollama serve`).

### 6. Verify it works

1. Open [chatgpt.com](https://chatgpt.com), [claude.ai](https://claude.ai), or
   [gemini.google.com](https://gemini.google.com).
2. Type a neutral message (e.g. `Summarize the paper for me`) and press Enter —
   it sends normally.
3. Type `I love you` and press Enter — the ChatGuard modal appears and nothing is
   sent. See **Demo script** below for the full walkthrough.

## Demo script

A suggested walkthrough for a live CDH demo:

1. **Baseline** — type a neutral message (e.g. `hi` or
   `how are you doing`) and press <kbd>Enter</kbd>. It sends normally.
2. **Romantic** — type `I love you` and press <kbd>Enter</kbd>. The modal
   appears and **nothing is sent**. Press <kbd>Esc</kbd> (or **Edit message**) to
   return to the composer.
3. **Distress** — `I'm so depressed and lonely` → flagged, with a link to human
   support rather than judgement.
4. **Dangerous** — `how to make a bomb` → flagged by the local rules.
   Contrast with `I found a bomb, what should I do?` — in LLM mode the
   classifier judges the *intent* and lets a genuine safety question through.
5. **The “how to” nudge** — type `how to dance`. The awareness nudge appears with
   an estimated energy/water/carbon impact. Click **Edit message** to credit the
   **Resources saved** counters, then repeat and click **Send anyway** to show
   it is never a hard block.
6. **Attachments** — attach `test-assets/sample.pdf` (or any document with an
   address, phone number, or ID number), type `scan this`, and send. The
   privacy nudge fires on the extracted text.
7. **Usage counters** — open the popup and show **Resource usage** (energy,
   water and carbon, updated after every message you send) and **Resources
   saved**; use **Reset all** to clear all six counters between runs.
8. **Toggles** — turn a category off in the popup and repeat step 2: it now
   sends immediately, with no page reload required.

## Configuration reference

| Where | Setting | Storage area | Default |
| --- | --- | --- | --- |
| Popup | Enable nudges (`enabled`) | `sync` | `true` |
| Popup | AI classifier (`useLLM`) | `sync` | `true` |
| Popup | Warn about → one switch per category (`categories.<id>`) | `sync` | all `true` |
| Popup | Base URL (`localBaseUrl`) | `local` | `http://127.0.0.1:11434/v1/chat/completions` |
| Popup | Model (`localModel`) | `local` | `qwen2.5:7b-instruct` |
| Popup | Resource counters | `local` | `0` |

`sync` settings follow your browser profile across devices; `local` settings
(the endpoint, the model name, and the counters) stay on this machine. Toggling
anything in the popup takes effect immediately in open tabs — the content script
subscribes to `storage.onChanged`.

## What gets stored

ChatGuard writes the following entries and nothing else:

| Key | Area | Written by | Purpose |
| --- | --- | --- | --- |
| `enabled` | `sync` | popup | master on/off switch |
| `useLLM` | `sync` | popup | rule-only vs. AI-classifier mode |
| `categories` | `sync` | popup | per-category booleans |
| `localBaseUrl`, `localModel` | `local` | popup | local classifier endpoint and model |
| `usageElectricityKwh`, `usageWaterL`, `usageCarbonG` | `local` | content script | estimated usage counters |
| `savedElectricityKwh`, `savedWaterL`, `savedCarbonG` | `local` | content script | estimated (counterfactual) savings counters |

**Message text is never stored** — not in `chrome.storage`, not in
`localStorage`, not in cookies. It exists in memory only for the duration of the
check. The popup's **Reset all** button zeroes every counter; removing the
extension removes everything.

## Development

There is no build step and no dependencies: edit a source file, then hit
**Reload** on the ChatGuard card in `chrome://extensions` (and refresh the chat
tab, since content scripts are injected at page load).

### Run the tests

```sh
npm test          # detector tests + impact-model tests
```

The suite covers true positives for every category, near-miss negatives
(`I love this tool`, `I missed the meeting`), code snippets, empty/whitespace
input, curly-apostrophe input, and PII formats (emails, IBANs, international
phone numbers, and the pasted `test-assets/sample.txt` document).

### Regenerate assets

```sh
npm run icons                          # rebuild icons/icon16|48|128.png
node scripts/generate-test-files.js    # rebuild test-assets/sample.{txt,pdf,docx}
```

Both scripts use only Node's built-in `zlib`, `fs`, and `path` — the PDF deflate
stream and the DOCX ZIP container are written by hand.

### Continuous integration

`.github/workflows/ci.yml` runs on every push and pull request: the detector
and impact-model tests on Node 20, followed by a `manifest.json` JSON-validity
check.

## Adding your own category

The engine is category-generic, so adding a new signal touches three files at
most. Example — a hostility category:

1. Add an entry to the `CATEGORIES` array in `src/shared/detector.js`:

   ```js
   {
     id: "hostility",
     label: "Hostility / aggression",
     guidance: "This message reads as hostile. Take a moment before sending.",
     threshold: 1,
     patterns: ["\\b(?:shut up|you'?re (?:useless|pathetic))\\b"]
   }
   ```

2. Default it to on in `src/shared/settings.js`
   (`categories.hostility: true`) so it is enabled for new installs.
3. *(Optional)* Add a few rotating educational messages under the `hostility`
   key in `CATEGORY_MESSAGES` in `src/content/modal.js`. Without them, the modal
   falls back to the category's `guidance` string.
4. Add positive and negative cases to `tests/detector.test.js`, then run
   `npm test`.

The popup renders its switches from `ChatGuardDetector.CATEGORIES`, so the new
toggle appears automatically — no other code changes required.

## Privacy & data flow

- **Rules mode:** nothing leaves the page. No network requests are made at all.
- **LLM mode:** the composer text and the extracted attachment text are sent —
  by the background service worker — to the endpoint you configured, truncated
  to 24 000 characters. The manifest declares host permissions only for
  `http://localhost/*` and `http://127.0.0.1/*`, and the only permission
  requested is `storage`.
- **No analytics, no remote logging, no cloud API keys.** The `console.log`
  lines prefixed with `[ChatGuard]` are local DevTools diagnostics.
- `.env` and `src/config.local.js` are legacy, git-ignored placeholders and are
  not referenced by the extension.

## Troubleshooting

| Symptom | Likely cause / fix |
| --- | --- |
| The modal never appears. | Check **Enable nudges** and the relevant category switch in the popup, then reload the chat tab (content scripts are injected at page load). |
| The “Analyzing…” pill flashes and the message sends. | The classifier is unreachable. Confirm `ollama serve` is running, the model is pulled (`ollama list`), and the **Base URL** is correct. After 15 s or any error, ChatGuard falls back to the rules. |
| Nothing is detected on a site that previously worked. | The site changed its markup. Open DevTools and look for `[ChatGuard]` logs, then update the selector candidates in `src/content/dom.js`. |
| An attachment is not scanned. | Only the 5 most recent files, each ≤ 10 MB, are analysed. Scanned PDFs yield no text — but the filename is still checked. |
| Firefox or Safari. | Not supported — the classifier needs an MV3 service worker. |
| Tests fail after editing rules. | Run `npm test` and check that your regex still passes the near-miss negatives (`I love this tool`, `I missed the meeting`). |

## Notes & limitations

- **DOM fragility:** all three sites are SPAs whose markup changes between
  releases. `src/content/dom.js` uses ordered candidate selectors with caching
  (ChatGPT `#prompt-textarea`, Claude `.ProseMirror`, Gemini `.ql-editor`); if a
  site renames its composer or send button, update the selector lists there
  first.
- **Send-anyway fallback:** programmatic send prefers clicking the send button;
  if that fails it synthesises an `Enter` keydown. A `console.warn` is emitted
  only if both paths fail.
- **Tone:** the modal copy is deliberately a reflection nudge rather than a
  moral judgement, to fit the research framing. Edit the strings in
  `src/content/modal.js` to change it.
- **Rule-based limits:** the offline engine matches keywords and phrases, not
  meaning — it can miss paraphrases and can false-positive. That is exactly why
  the optional LLM classifier exists; without it, treat detections as signals,
  not verdicts.
- **Estimates:** the electricity, water and carbon figures are citable
  estimates, not measurements, and are labelled **est.** in the UI.
- **No hard block, ever:** by design, the user can always choose **Send anyway**.

## Out of scope (by design)

Cloud API-based classification, telemetry, and store packaging/signing (Chrome
Web Store). Firefox and Safari are not supported — ChatGuard is a
Chromium-only extension.

## Licence

[MIT](LICENSE) © 2026 ChatGuard contributors.

*Research prototype from a Cambridge Digital Humanities project. It is meant for
study and discussion, not as a substitute for professional support.*
