"use strict";

/**
 * Generates test files for Critty's attachment analyzer:
 *   test-assets/sample.txt   — plain text
 *   test-assets/sample.pdf   — one page, FlateDecode content stream
 *   test-assets/sample.docx  — minimal OOXML document
 *
 * Zero external dependencies: PDF deflate and the DOCX zip container are both
 * built with node:zlib. Usage: node scripts/generate-test-files.js
 */

const fs = require("node:fs");
const path = require("node:path");
const zlib = require("node:zlib");

const OUT_DIR = path.join(__dirname, "..", "test-assets");

const lines = [
  "Critty test document",
  "",
  "Full name: Alexandra Dupont",
  "Address: 47 Rue de la Paix, 75002 Paris, France",
  "Phone: +33 6 12 34 56 78",
  "Email: alexandra.dupont@example.com",
  "Date of birth: 14 March 1991",
  "Passport number: 12AB34567",
  "Bank account (IBAN): FR76 3000 6000 0012 3456 7890 189",
  "Social security number: 2 91 03 75 116 005 42",
  "",
  "This document contains sample personal data for testing Critty."
];

// ---------- CRC32 ----------

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

// ---------- ZIP writer ----------

function makeZip(files) {
  const chunks = [];
  const central = [];
  let offset = 0;

  for (const f of files) {
    const name = Buffer.from(f.name, "utf8");
    const data = Buffer.isBuffer(f.data) ? f.data : Buffer.from(f.data, "utf8");
    const compressed = zlib.deflateRawSync(data);
    const crc = crc32(data);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(8, 8); // deflate
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);

    chunks.push(local, name, compressed);
    offset += local.length + name.length + compressed.length;

    const cd = Buffer.alloc(46);
    cd.writeUInt32LE(0x02014b50, 0);
    cd.writeUInt16LE(20, 4);
    cd.writeUInt16LE(20, 6);
    cd.writeUInt16LE(8, 10);
    cd.writeUInt32LE(crc, 16);
    cd.writeUInt32LE(compressed.length, 20);
    cd.writeUInt32LE(data.length, 24);
    cd.writeUInt16LE(name.length, 28);
    cd.writeUInt32LE(offset - (local.length + name.length + compressed.length), 42);
    central.push(Buffer.concat([cd, name]));
  }

  const cdOffset = offset;
  const cdSize = central.reduce((s, b) => s + b.length, 0);

  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(files.length, 8);
  eocd.writeUInt16LE(files.length, 10);
  eocd.writeUInt32LE(cdSize, 12);
  eocd.writeUInt32LE(cdOffset, 16);

  return Buffer.concat([...chunks, ...central, eocd]);
}

// ---------- PDF ----------

function escapePdfString(s) {
  return s.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function buildPdf() {
  let stream = "BT\n/F1 11 Tf\n50 720 Td\n";
  lines.forEach((line, i) => {
    if (i > 0) stream += "0 -15 Td\n";
    stream += "(" + escapePdfString(line) + ") Tj\n";
  });
  stream += "ET\n";

  const compressed = zlib.deflateSync(Buffer.from(stream, "latin1"));

  const objects = [
    { id: 1, head: "1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n" },
    { id: 2, head: "2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n" },
    {
      id: 3,
      head:
        "3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] " +
        "/Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>\nendobj\n"
    },
    {
      id: 4,
      head:
        "4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica " +
        "/Encoding /WinAnsiEncoding >>\nendobj\n"
    }
  ];

  let out = Buffer.from("%PDF-1.4\n", "latin1");
  const offsets = [0];

  for (const o of objects) {
    offsets[o.id] = out.length;
    out = Buffer.concat([out, Buffer.from(o.head, "latin1")]);
  }

  offsets[5] = out.length;
  out = Buffer.concat([
    out,
    Buffer.from(
      "5 0 obj\n<< /Length " + compressed.length + " /Filter /FlateDecode >>\nstream\n",
      "latin1"
    ),
    compressed,
    Buffer.from("\nendstream\nendobj\n", "latin1")
  ]);

  const xrefOffset = out.length;
  let xref = "xref\n0 6\n0000000000 65535 f \n";
  for (let i = 1; i <= 5; i++) xref += String(offsets[i]).padStart(10, "0") + " 00000 n \n";
  const trailer =
    "trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n" + xrefOffset + "\n%%EOF\n";

  return Buffer.concat([out, Buffer.from(xref + trailer, "latin1")]);
}

// ---------- DOCX ----------

function xmlEscape(s) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function buildDocx() {
  const paras = lines
    .map((line) => "<w:p><w:r><w:t xml:space=\"preserve\">" + xmlEscape(line) + "</w:t></w:r></w:p>")
    .join("");

  const documentXml =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
    "<w:body>" + paras + "</w:body></w:document>";

  const contentTypes =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    '<Default Extension="xml" ContentType="application/xml"/>' +
    '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
    "</Types>";

  const rels =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>' +
    "</Relationships>";

  return makeZip([
    { name: "[Content_Types].xml", data: contentTypes },
    { name: "_rels/.rels", data: rels },
    { name: "word/document.xml", data: documentXml }
  ]);
}

// ---------- main ----------

function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(path.join(OUT_DIR, "sample.txt"), lines.join("\n") + "\n");
  fs.writeFileSync(path.join(OUT_DIR, "sample.pdf"), buildPdf());
  fs.writeFileSync(path.join(OUT_DIR, "sample.docx"), buildDocx());
  console.log("wrote test-assets/sample.txt");
  console.log("wrote test-assets/sample.pdf");
  console.log("wrote test-assets/sample.docx");
}

main();
