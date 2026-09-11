# ChatGuard — ChatGPT Send Nudge (CDH Demo)

A Chromium (Manifest V3) extension prototype for a Cambridge Digital
Humanities project. When you try to send a sensitive or emotional message to
ChatGPT, Claude, or Gemini, ChatGuard intercepts the send and shows a
confirm-before-send modal so you can pause and reflect before continuing.

Local by default — detection is a bundled offline rule engine with no API
calls, logging, or telemetry. An optional **AI classifier** can be enabled for
more contextual detection; when on, your message text is sent to a local LLM
(Ollama) running on your own machine for classification (and nothing is
logged).

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

| Category | What it flags |
| --- | --- |
| Romantic / flirtatious | affectionate, dating, or intimate language toward the AI |
| Emotional distress / depression | sadness, loneliness, hopelessness, low mood |
| Self-harm / suicide concern | crisis language (the nudge includes helpline info) |
| Graphic violence / gore / horror | requests or descriptions of graphic violence |
| Sexually explicit content | explicit sexual requests or language |
| Hateful / abusive language | hate speech and abuse toward people or the AI |
| Personal / identifying information | passwords, addresses, SSNs, card numbers, etc. |
| Illegal / dangerous activity | weapons, drugs, hacking, fraud, etc. |

Each category is independently toggleable from the toolbar popup. Add or edit
them in the `CATEGORIES` array of `src/shared/detector.js`.

## How it works

1. A content script injects into `chatgpt.com`, `claude.ai`, and
   `gemini.google.com`.
2. It listens, in the capture phase, for the two send triggers:
   - pressing **Enter** in the composer (without Shift), or
   - clicking the **send button**.
3. It reads the composer text, normalizes it, and runs the rule engine.
4. If a match is found (and that category is enabled), it blocks the event
   (`preventDefault` + `stopImmediatePropagation`) and shows a Shadow-DOM modal.
5. **Send anyway** re-sends programmatically (by clicking the real send button
   under a one-shot bypass flag). **Edit message** dismisses the modal and
   refocuses the composer. `Esc` does the same as **Edit message**.

### LLM detection (optional, Chromium)

- Set the **base URL** (default `http://127.0.0.1:11434/v1/chat/completions`)
  and **model** (e.g. `qwen2.5:7b-instruct`) in the popup. ChatGuard sends the
  message to your local Ollama server only.
- When on, every message is analyzed by the LLM for context and intent before
  sending. A subtle "Analyzing…" pill shows while it runs, and only flagged
  messages interrupt with the full nudge. Without the LLM, the local rules
  decide.
- On ChatGPT, attached files are scanned too: DOCX and plain text are converted
  to text, PDFs are extracted on a best-effort basis, and filenames are always
  included — so obvious PII (e.g. `passport.pdf`, `bank_statement.pdf`) is
  flagged even when the text can't be read.
- Runs in a service worker, so it needs a Chromium browser (Chrome, Brave, or
  Edge).

## Project structure

```
manifest.json                     MV3 manifest
icons/                            generated heart icons (icon16/48/128.png)
src/
  shared/
    settings.js                   shared settings schema
    storage.js                    storage wrapper (chrome.storage + browser fallback)
    detector.js                   rule engine + category rules
  content/
    dom.js                        ChatGPT DOM helpers (resilient selectors)
    modal.js                      Shadow-DOM confirm modal
    content.js                    bootstrap: intercept → detect → block
  popup/
    popup.html / popup.css / popup.js   toolbar toggle + per-category switches
scripts/
  generate-icons.js               zero-dependency PNG icon generator
tests/
  detector.test.js                Node unit tests for the detector
```

## Installation — step by step

ChatGuard runs in **Chromium browsers only** — Google Chrome, Brave, or Microsoft
Edge — on any desktop OS. There is no installer or store build: you load the
source folder straight into your browser. The steps below cover macOS,
Windows, and Linux; all three end in the same Chromium "Load unpacked" step,
and only the terminal commands differ.

### 0. Prerequisites

- A Chromium browser (required): **Google Chrome**, **Brave**, or
  **Microsoft Edge** (any recent version). ChatGuard only runs in Chromium.
- **Ollama** (optional) — only needed for the AI classifier. The rule engine
  runs with no dependencies at all.
- **Git** (optional) — only needed if you clone the repository instead of
  downloading a ZIP.

### 1. Get the code

Pick one method.

**Option A — Git (recommended):**

```sh
git clone <your-repo-url> chatguard
cd chatguard
```

Replace `<your-repo-url>` with the URL of your copy of this repository. If you
already have the folder, skip to step 2.

**Option B — Download ZIP:**

1. Download the repository as a ZIP file.
2. Unzip it and remember the path of the extracted `chatguard` folder.

### 2. Install a Chromium browser

| OS | How |
| --- | --- |
| macOS | Download **Chrome** or **Brave** and drag it to `Applications`. |
| Windows | Download **Chrome**, **Brave**, or **Edge** and run the installer. Edge is usually pre-installed. |
| Linux | `sudo apt install chromium-browser` (Debian/Ubuntu) or `sudo dnf install chromium` (Fedora). |

### 3. (Optional) Install Ollama for the AI classifier

The rule engine works without Ollama. Install it only if you want the
context-aware LLM classifier.

**macOS**

```sh
brew install ollama
ollama serve
# in a second terminal:
ollama pull qwen2.5:7b-instruct
```

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

This step is identical on macOS, Windows, and Linux.

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

1. Type a neutral message (e.g. `Summarize the paper for me`) and press Enter —
   it sends normally.
2. Type `I love you` and press Enter — the modal appears and **nothing is sent**.
3. Try other categories: `I'm so depressed and lonely` (distress),
   `how to kill someone` (violence), `my password is hunter2` (private info).
4. Click **Edit message** — the modal closes and focus returns to the composer.
5. Type a flagged message again, press Enter, then click **Send anyway** — the
   message sends and the assistant replies.
6. Try `Shift+Enter` — it inserts a newline instead of triggering the nudge.
7. Open the toolbar popup and disable a category — interception for it stops
   immediately.

## Run the tests

```sh
node tests/detector.test.js
```

## Extending to "broader" sensitive/emotional content

The engine is category-generic. To add a category (e.g. emotional distress,
hostility, private-info disclosure):

1. Add an entry to the `CATEGORIES` array in `src/shared/detector.js`:

   ```js
   {
     id: "distress",
     label: "Emotional distress",
     threshold: 1,
     patterns: ["\\bi feel (?:so |really )?lonely\\b", "\\bi don'?t want to (?:go on|live)\\b"]
   }
   ```

2. Default it on in `src/shared/settings.js` (`categories.distress: true`).
3. Re-run `node tests/detector.test.js` with new cases.

The popup reads the category list from `ChatGuardDetector.CATEGORIES`, so the
new toggle appears automatically. No other code changes required.

## Notes & limitations

- **DOM fragility:** all three sites are SPAs whose markup changes between
  releases. `src/content/dom.js` uses ordered candidate selectors with caching
  (ChatGPT `#prompt-textarea`, Claude `.ProseMirror`, Gemini `.ql-editor`); if a
  site renames its composer/send button, update the selector lists there first.
- **Send-anywhere fallback:** programmatic send prefers clicking the send
  button; if that fails it synthesizes an `Enter` keydown. A `console.warn`
  is emitted only if both paths fail.
- **Tone:** modal copy is deliberately a reflection nudge rather than a moral
  judgment, to fit the research framing. Edit the strings in
  `src/content/modal.js` to change it.
- **Rule-based limits:** detection matches keywords and phrases, not true
  meaning — it can miss paraphrases and produce false positives. For genuine
  semantic detection you'd need an LLM classifier (currently out of scope).

## Out of scope (by design)

Cloud API-based classification, telemetry, and store packaging/signing
(Chrome Web Store). Firefox and Safari are not supported — ChatGuard is a
Chromium-only extension.
