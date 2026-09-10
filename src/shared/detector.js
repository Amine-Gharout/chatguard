/**
 * ChatGuard — rule-based content detector.
 *
 * Generic engine: each category below is independent and ships a list of
 * word-boundary-aware regular expressions plus a match-count threshold.
 * To support "broader" sensitive/emotional detection later (e.g. distress,
 * hostility, private-info disclosure), add another entry to CATEGORIES and
 * tick it in the popup — no engine changes required.
 *
 * Loaded both as a classic content script and in Node tests (module.exports
 * guard). No build step, no external dependencies.
 */
(function (global) {
  "use strict";

  var CATEGORIES = [
    {
      id: "romantic",
      label: "Romantic / flirtatious",
      guidance: "ChatGPT is an AI — it can't reciprocate or understand feelings the way a person does.",
      threshold: 1,
      patterns: [
        "\\bi love you\\b",
        "\\bi'm in love with you\\b",
        "\\bi am in love with you\\b",
        "\\blove you so much\\b",
        "\\bwill you marry me\\b",
        "\\bwill you (?:be|go out with) me\\b",
        "\\bwill you be my (?:girlfriend|boyfriend|valentine|partner|lover)\\b",
        "\\bbe my (?:girlfriend|boyfriend|valentine|partner)\\b",
        "\\bdo you love me\\b",
        "\\bi miss you\\b",
        "\\bkiss me\\b",
        "\\bhug me\\b",
        "\\bhold me\\b",
        "\\bcuddle(?: with)? me\\b",
        "\\bmarry me\\b",
        "\\byou(?:'re| are) (?:so |really |very |truly )?(?:beautiful|handsome|gorgeous|attractive|cute|sexy)\\b",
        "\\bi (?:really |kinda |kind of )?(?:like|love|fancy) you\\b",
        "\\bi have feelings for you\\b",
        "\\bi'?ve got feelings for you\\b",
        "\\byou make my heart\\b",
        "\\bmy heart (?:beats|skips) for you\\b",
        "\\bcan we (?:be together|date|go out)\\b",
        "\\bsweetheart\\b",
        "\\bdarling\\b",
        "\\bmy love\\b",
        "\\bthinking (?:about|of) you\\b",
        "\\bi think about you (?:all the time|every ?day|constantly)\\b",
        "\\bi can'?t stop thinking about you\\b",
        "\\byou mean (?:the world|everything) to me\\b"
      ]
    },
    {
      id: "distress",
      label: "Emotional distress / depression",
      guidance: "These feelings deserve human support — consider talking to someone you trust or a mental-health professional.",
      threshold: 1,
      patterns: [
        "\\bi'?m (?:so |really |very )?(?:depressed|sad|lonely|miserable|hopeless|worthless|empty|numb)\\b",
        "\\bi feel (?:so |really |very )?(?:depressed|sad|lonely|miserable|hopeless|worthless|empty|numb|like giving up)\\b",
        "\\bfeeling (?:so |really |very )?(?:depressed|lonely|hopeless|worthless|empty)\\b",
        "\\bi'?ve (?:been|felt) (?:so )?(?:depressed|lonely|hopeless)\\b",
        "\\bmy (?:depression|anxiety) (?:is|has|got|feels)\\b",
        "\\b(?:clinical|severe|chronic|major) depression\\b",
        "\\bstruggling with (?:depression|anxiety|loneliness)\\b",
        "\\bi can'?t (?:take|handle) this anymore\\b",
        "\\bnobody (?:cares|loves) (?:about )?me\\b",
        "\\bno one (?:cares|loves) (?:about )?me\\b",
        "\\bi feel (?:so |completely )?alone\\b",
        "\\bi'?m (?:so |always )?(?:lost|alone)\\b",
        "\\bcrying (?:myself to sleep|all the time|every night)\\b",
        "\\bwhat'?s the point (?:of|in) (?:anything|everything|life)\\b",
        "\\blife (?:is|feels) (?:pointless|meaningless)\\b",
        "\\bi (?:just )?want to disappear\\b",
        "\\bi (?:have|feel) no (?:reason|purpose|will) to (?:go on|continue|try)\\b"
      ]
    },
    {
      id: "self_harm",
      label: "Self-harm / suicide concern",
      guidance: "This sounds like it may be a crisis. Please reach out to a person you trust or a helpline — UK: Samaritans 116 123 · US/Canada: 988.",
      threshold: 1,
      patterns: [
        "\\b(?:kill|hurt|harm|cut|injure) myself\\b",
        "\\bi want to (?:die|kill myself|end my life|end it all|disappear forever)\\b",
        "\\bi don'?t want to (?:live|exist|be here|be alive) (?:anymore|any more)?\\b",
        "\\b(?:commit|committed|attempt(?:ed)?|consider(?:ing)?) suicide\\b",
        "\\b(?:want to|wanna|going to|gonna|plan(?:ning)? to|think(?:ing)? (?:about|of)) (?:commit )?suicide\\b",
        "\\bsuicidal\\b",
        "\\bending my life\\b",
        "\\bend it all\\b",
        "\\btake my own life\\b",
        "\\bself[- ]?harm(?:ing|ed)?\\b",
        "\\boverdos(?:e|ed|ing)\\b",
        "\\bi'?m going to (?:kill|hurt) myself\\b",
        "\\bi think about (?:suicide|killing myself|ending my life)\\b",
        "\\bnobody would (?:miss|notice|care) if i (?:died|was gone|were gone)\\b",
        "\\bi wish i (?:was|were) dead\\b",
        "\\bno reason to (?:live|go on|be here|stay alive)\\b",
        "\\bbetter off (?:dead|without me)\\b"
      ]
    },
    {
      id: "violence",
      label: "Graphic violence / gore / horror",
      guidance: "This message may request or describe graphic violence. Take a moment to consider whether you want to proceed.",
      threshold: 1,
      patterns: [
        "\\bhow to (?:kill|murder|poison|assassinate|strangle) (?:someone|a person|people|him|her|them)\\b",
        "\\bhow to commit (?:murder|a murder|mass murder)\\b",
        "\\b(?:kill|murder|stab) (?:someone|people|a person|him|her|them)\\b",
        "\\bcommit (?:a massacre|mass murder)\\b",
        "\\bi want to (?:kill|murder|attack) (?:someone|people|him|her|them)\\b",
        "\\btortur(?:e|ing|ed)\\b",
        "\\bdecapitat(?:e|ed|ing|ion)\\b",
        "\\bdismember(?:ed|ment|ing)?\\b",
        "\\beviscerat(?:e|ed|ion)\\b",
        "\\bmutilat(?:e|ed|ion)\\b",
        "\\bgraphic (?:violence|gore|horror)\\b",
        "\\bblood and gore\\b",
        "\\bextreme horror\\b",
        "\\bsnuff (?:film|video|content)\\b",
        "\\bstrangl(?:e|ing|ed) (?:someone|them|him|her|people)\\b",
        "\\bpoison(?:ing)? someone\\b"
      ]
    },
    {
      id: "sexual",
      label: "Sexually explicit content",
      guidance: "This message may contain sexually explicit content, which ChatGPT may refuse or flag.",
      threshold: 1,
      patterns: [
        "\\bhave sex (?:with|to)\\b",
        "\\bmake love to (?:me|you)\\b",
        "\\bmake out with (?:me|you)\\b",
        "\\bsend (?:me )?(?:nudes|nude photos|dick pics?|porn)\\b",
        "\\bnaked (?:photos?|pictures?|images?) (?:of|to)\\b",
        "\\bsuck (?:my|your)\\b",
        "\\bblow ?jobs?\\b",
        "\\bhand ?jobs?\\b",
        "\\bmasturbat(?:e|ion|ing)\\b",
        "\\bfuck (?:me|you)\\b",
        "\\bsext(?:ing)?\\b",
        "\\berotic roleplay\\b",
        "\\bexplicit sexual content\\b",
        "\\bdescribe (?:explicit )?sex\\b"
      ]
    },
    {
      id: "hate",
      label: "Hateful / abusive language",
      guidance: "This message may contain hateful or abusive language.",
      threshold: 1,
      patterns: [
        "\\bi hate (?:you|them|him|her)\\b",
        "\\bi hate (?:gay|lesbian|trans|black|white|asian|muslim|jewish|christian|women|men|immigrants?) (?:people|folk)?\\b",
        "\\byou'?re (?:useless|stupid|worthless|pathetic|dumb|a moron|an idiot)\\b",
        "\\bgo (?:kill|die|fuck) yourself\\b"
      ]
    },
    {
      id: "personal_info",
      label: "Personal / identifying information",
      guidance: "You may be about to share personal or identifying information with an AI. Consider whether that's necessary.",
      threshold: 1,
      patterns: [
        "\\bmy (?:social security|credit card|bank account|passport|national insurance) number\\b",
        "\\bcredit card number\\b",
        "\\bmy password is\\b",
        "\\bpassword is\\b",
        "\\bmy (?:address|home address|phone number|email address) is\\b",
        "\\bdate of birth is\\b",
        "\\bmy (?:dob|date of birth|ssn)\\b",
        "\\brouting number\\b",
        "\\baccount number\\b",
        "\\bsecurity code\\b"
      ]
    },
    {
      id: "dangerous",
      label: "Illegal / dangerous activity",
      guidance: "This may be a request about illegal or dangerous activity, which ChatGPT may refuse.",
      threshold: 1,
      patterns: [
        "\\bhow to make (?:a |an )?(?:bomb|explosive|weapon|gun|poison|meth|pipe bomb)\\b",
        "\\bhow to build (?:a )?(?:bomb|weapon|gun)\\b",
        "\\bmake (?:meth|a bomb|a pipe bomb|mustard gas|anthrax|a virus)\\b",
        "\\bwhere to buy (?:illegal )?(?:drugs|guns|weapons|firearms)\\b",
        "\\bhow to hack (?:into|someone'?s|a bank|a computer|a phone)\\b",
        "\\blaunder money\\b",
        "\\bbuy (?:illegal drugs|a gun illegally)\\b",
        "\\bddos attack instructions?\\b"
      ]
    }
  ];

  /**
   * Normalize raw composer text for matching: lowercase, straighten curly
   * quotes/apostrophes, collapse whitespace.
   */
  function normalize(text) {
    if (typeof text !== "string") return "";
    return text
      .toLowerCase()
      .replace(/[\u2018\u2019\u0060\u00b4]/g, "'")
      .replace(/[\u201c\u201d]/g, '"')
      .replace(/\s+/g, " ")
      .trim();
  }

  function dedupe(values) {
    var seen = Object.create(null);
    var out = [];
    for (var i = 0; i < values.length; i++) {
      var value = values[i];
      if (value && !seen[value]) {
        seen[value] = true;
        out.push(value);
      }
    }
    return out;
  }

  function detectCategory(category, normalized) {
    var matched = [];
    for (var i = 0; i < category.patterns.length; i++) {
      var re = new RegExp(category.patterns[i], "gi");
      var m;
      while ((m = re.exec(normalized)) !== null) {
        var phrase = m[0].trim();
        if (phrase) matched.push(phrase);
        if (m.index === re.lastIndex) re.lastIndex += 1; // guard against empty matches
      }
    }
    return matched;
  }

  /**
   * Returns an array of hits:
   *   [{ category: "romantic", label: "Romantic / flirtatious",
   *      matchedPhrases: ["i love you", ...] }]
   * Empty array when nothing matched.
   */
  function detect(text) {
    var normalized = normalize(text);
    if (!normalized) return [];
    var results = [];
    for (var i = 0; i < CATEGORIES.length; i++) {
      var category = CATEGORIES[i];
      var matched = detectCategory(category, normalized);
      if (matched.length >= category.threshold) {
        results.push({
          category: category.id,
          label: category.label,
          guidance: category.guidance || "",
          matchedPhrases: dedupe(matched)
        });
      }
    }
    return results;
  }

  var api = { CATEGORIES: CATEGORIES, detect: detect, normalize: normalize };
  global.ChatGuardDetector = api;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
