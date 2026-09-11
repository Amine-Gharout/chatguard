/**
 * Critty — attachment text extraction (Chromium: ChatGPT, Claude, Gemini).
 *
 * Converts attached documents to plain text with zero external dependencies,
 * using browser APIs only (DecompressionStream, TextDecoder, DOMParser):
 *   - DOCX  → ZIP (deflate) + word/document.xml → paragraph text
 *   - PDF   → best-effort text extraction (FlateDecode streams, Tj/TJ operators)
 *   - plain text / code / CSV / JSON / HTML → UTF-8
 *
 * Filenames are preserved by the caller and always sent to the classifier even
 * when text extraction fails (e.g. scanned PDFs), so obvious PII filenames like
 * "passport.pdf" are still flagged.
 * Attached to globalThis as CrittyFiles.
 */
(function (global) {
  "use strict";

  var MAX_EXTRACT = 20000; // chars kept per document

  function clip(text) {
    text = String(text || "");
    return text.length > MAX_EXTRACT ? text.slice(0, MAX_EXTRACT) : text;
  }

  function decodeUTF8(buf) {
    try {
      return new TextDecoder("utf-8", { fatal: false }).decode(buf);
    } catch (e) {
      return "";
    }
  }

  function fileText(file) {
    return file.text().catch(function () {
      return new Promise(function (resolve) {
        var reader = new FileReader();
        reader.onload = function () {
          resolve(String(reader.result || ""));
        };
        reader.onerror = function () {
          resolve("");
        };
        reader.readAsText(file);
      });
    });
  }

  function inflateStream(u8, format) {
    return new Blob([u8])
      .stream()
      .pipeThrough(new DecompressionStream(format));
  }

  async function inflateToBytes(u8, format) {
    var buf = await new Response(inflateStream(u8, format)).arrayBuffer();
    return new Uint8Array(buf);
  }

  // PDF FlateDecode is zlib format per spec, but some producers emit raw deflate.
  async function inflatePdf(u8) {
    try {
      return await inflateToBytes(u8, "deflate");
    } catch (err) {
      return inflateToBytes(u8, "deflate-raw");
    }
  }

  // ---------- DOCX (ZIP + XML) ----------

  async function extractDocx(arrayBuffer) {
    var view = new DataView(arrayBuffer);
    var bytes = new Uint8Array(arrayBuffer);

    // Locate the End Of Central Directory record.
    var eocd = -1;
    var min = Math.max(0, bytes.length - 65557);
    for (var i = bytes.length - 22; i >= min; i--) {
      if (
        bytes[i] === 0x50 &&
        bytes[i + 1] === 0x4b &&
        bytes[i + 2] === 0x05 &&
        bytes[i + 3] === 0x06
      ) {
        eocd = i;
        break;
      }
    }
    if (eocd < 0) return "";

    var entries = view.getUint16(eocd + 10, true);
    var cdOffset = view.getUint32(eocd + 16, true);

    // Walk the central directory to find word/document.xml.
    var entry = null;
    var p = cdOffset;
    for (var n = 0; n < entries; n++) {
      if (view.getUint32(p, true) !== 0x02014b50) break;
      var nameLen = view.getUint16(p + 28, true);
      var extraLen = view.getUint16(p + 30, true);
      var commentLen = view.getUint16(p + 32, true);
      var name = decodeUTF8(bytes.subarray(p + 46, p + 46 + nameLen));
      if (name === "word/document.xml") {
        entry = {
          method: view.getUint16(p + 10, true),
          offset: view.getUint32(p + 42, true)
        };
        break;
      }
      p += 46 + nameLen + extraLen + commentLen;
    }
    if (!entry) return "";

    // Local file header for the entry.
    var lh = entry.offset;
    if (view.getUint32(lh, true) !== 0x04034b50) return "";
    var lNameLen = view.getUint16(lh + 26, true);
    var lExtraLen = view.getUint16(lh + 28, true);
    var compSize = view.getUint32(lh + 18, true);
    var dataStart = lh + 30 + lNameLen + lExtraLen;
    var data = bytes.subarray(dataStart, dataStart + compSize);

    var xmlBytes;
    if (entry.method === 0) {
      xmlBytes = data;
    } else if (entry.method === 8) {
      xmlBytes = await inflateToBytes(data, "deflate-raw");
    } else {
      return "";
    }

    var xml = decodeUTF8(xmlBytes);
    var doc = new DOMParser().parseFromString(xml, "text/xml");
    var paragraphs = doc.getElementsByTagName("w:p");
    var out = [];
    for (var j = 0; j < paragraphs.length; j++) {
      var runs = paragraphs[j].getElementsByTagName("w:t");
      var parts = [];
      for (var k = 0; k < runs.length; k++) parts.push(runs[k].textContent || "");
      var line = parts.join("");
      if (line) out.push(line);
    }
    return clip(out.join("\n"));
  }

  // ---------- PDF (best-effort) ----------

  function findBytes(bytes, needle, from) {
    for (var i = from; i <= bytes.length - needle.length; i++) {
      var ok = true;
      for (var j = 0; j < needle.length; j++) {
        if (bytes[i + j] !== needle[j]) {
          ok = false;
          break;
        }
      }
      if (ok) return i;
    }
    return -1;
  }

  function decodePdfString(s) {
    return s
      .replace(/\\([nrtbf()\\])/g, function (_, c) {
        switch (c) {
          case "n": return "\n";
          case "r": return "\r";
          case "t": return "\t";
          case "b": return "\b";
          case "f": return "\f";
          default: return c;
        }
      })
      .replace(/\\([0-7]{1,3})/g, function (_, o) {
        return String.fromCharCode(parseInt(o, 8));
      });
  }

  function pdfTextFromContent(str) {
    var out = [];
    var m;

    var tjRe = /\[((?:[^\]\\]|\\.)*)\]\s*TJ/g;
    while ((m = tjRe.exec(str)) !== null) {
      var inner = m[1];
      var sRe = /\(((?:[^()\\]|\\.)*)\)/g;
      var s;
      while ((s = sRe.exec(inner)) !== null) out.push(decodePdfString(s[1]));
    }

    var tRe = /\(((?:[^()\\]|\\.)*)\)\s*(Tj|'|")/g;
    while ((m = tRe.exec(str)) !== null) out.push(decodePdfString(m[1]));

    return out.join(" ");
  }

  async function extractPdf(arrayBuffer) {
    var bytes = new Uint8Array(arrayBuffer);
    var STREAM = [0x73, 0x74, 0x72, 0x65, 0x61, 0x6d];
    var ENDSTREAM = [0x65, 0x6e, 0x64, 0x73, 0x74, 0x72, 0x65, 0x61, 0x6d];
    var out = [];
    var pos = 0;

    while (pos < bytes.length) {
      var s = findBytes(bytes, STREAM, pos);
      if (s < 0) break;
      while (
        s >= 3 &&
        bytes[s - 1] === 0x64 &&
        bytes[s - 2] === 0x6e &&
        bytes[s - 3] === 0x65
      ) {
        s = findBytes(bytes, STREAM, s + 1);
        if (s < 0) break;
      }
      if (s < 0) break;

      var dataStart = s + 6;
      if (bytes[dataStart] === 0x0d && bytes[dataStart + 1] === 0x0a) dataStart += 2;
      else if (bytes[dataStart] === 0x0a) dataStart += 1;

      var dict = decodeUTF8(bytes.subarray(Math.max(0, s - 256), s));
      var isFlate = /FlateDecode/.test(dict);

      // Use the stream dictionary's /Length to slice exactly the compressed
      // bytes (a bare "endstream" search can include a trailing EOL that
      // corrupts the zlib stream). Falls back to the endstream marker for
      // indirect lengths.
      var data;
      var nextPos;
      var lenMatch = /\/Length\s+(\d+)/.exec(dict);
      if (lenMatch) {
        var dataEnd = dataStart + parseInt(lenMatch[1], 10);
        data = bytes.subarray(dataStart, dataEnd);
        nextPos = dataEnd;
      } else {
        var e = findBytes(bytes, ENDSTREAM, dataStart);
        if (e < 0) break;
        data = bytes.subarray(dataStart, e);
        while (data.length && (data[data.length - 1] === 0x0a || data[data.length - 1] === 0x0d)) {
          data = data.subarray(0, data.length - 1);
        }
        nextPos = e + ENDSTREAM.length;
      }

      var content;
      if (isFlate) {
        try {
          content = decodeUTF8(await inflatePdf(data));
        } catch (err) {
          content = "";
        }
      } else {
        content = decodeUTF8(data);
      }

      if (content) out.push(pdfTextFromContent(content));
      pos = nextPos;
    }

    return clip(out.join("\n"));
  }

  // ---------- dispatch ----------

  function extractText(file) {
    return Promise.resolve()
      .then(function () {
        var name = (file.name || "").toLowerCase();
        var type = (file.type || "").toLowerCase();

        if (/\.pdf$/.test(name)) return file.arrayBuffer().then(extractPdf);
        if (/\.docx$/.test(name)) return file.arrayBuffer().then(extractDocx);
        if (/\.doc$/.test(name) || type === "application/msword") return "";
        if (/^image\//.test(type) || /^audio\//.test(type) || /^video\//.test(type)) return "";
        return fileText(file);
      })
      .catch(function () {
        return "";
      });
  }

  global.CrittyFiles = { extractText: extractText };
})(typeof globalThis !== "undefined" ? globalThis : this);
