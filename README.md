# ChatGuard — ChatGPT Send Nudge (CDH Demo)

A cross-browser (Manifest V3) extension prototype for a Cambridge Digital
Humanities project. When you try to send a sensitive or emotional message to
ChatGPT, Claude, or Gemini, ChatGuard intercepts the send and shows a
confirm-before-send modal so you can pause and reflect before continuing.

Runs **fully locally** — no API keys, no network calls, no logging, no
telemetry. Detection is rule-based (regex) and entirely offline.

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

## Project structure

```
manifest.json                     MV3 manifest
icons/                            generated heart icons (icon16/48/128.png)
src/
  shared/
    settings.js                   shared settings schema
    storage.js                    cross-browser storage wrapper (Chrome/Firefox/Safari)
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

## Supported browsers & install

| Browser | Install method |
| --- | --- |
| Chrome / Brave / Edge (Chromium) | Load unpacked |
| Firefox | Temporary add-on (`about:debugging`) |
| Safari (macOS) | Xcode build via `safari-web-extension-converter` |

### Chrome / Brave / Edge

1. Open the extensions page: `chrome://extensions`, `brave://extensions`, or
   `edge://extensions`.
2. Enable **Developer mode** (top-right toggle).
3. Click **Load unpacked** and select this folder (`/mnt/data/Documents/chatguard`).
4. Open [chatgpt.com](https://chatgpt.com), [claude.ai](https://claude.ai), or
   [gemini.google.com](https://gemini.google.com) and start a chat.

### Firefox

1. Open `about:debugging#/runtime/this-firefox`.
2. Click **Load Temporary Add-on…** and select `manifest.json` in this folder.
3. The extension runs for this session only (it's removed when Firefox closes —
   normal for unsigned testing).

### Safari (macOS)

Safari has no load-unpacked mode; it needs an Xcode wrapper. On a Mac with
Xcode installed:

1. `xcrun safari-web-extension-converter /mnt/data/Documents/chatguard`
   (add `--project-location .` to keep the generated project here).
2. Open the generated Xcode project, choose your signing team (a free Personal
   Team is fine), and run the macOS app target — it registers the extension.
3. In Safari: **Settings → Advanced → enable "Show features for web developers"**,
   then in the **Develop** menu enable **Allow Unsigned Extensions**.
4. Turn on **ChatGuard** in **Safari → Settings → Extensions**.

> Requires Safari 16.4+ (Manifest V3 `action`). The code already uses a
> `browser`/`chrome` storage wrapper, so no changes are needed to run.

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

LLM/API-based classification, telemetry, and store packaging/signing
(Chrome Web Store, AMO, or App Store). Firefox and Safari run via the methods
above but are not packaged or signed here.
