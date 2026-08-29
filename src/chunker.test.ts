import { describe, it, expect } from "vitest";
import { computeHash, chunkText, extractHtmlText, generateVectorId, hasSecretTag } from "./chunker.js";

describe("chunker and hashing", () => {
  it("should compute consistent sha256 hashes", () => {
    const hash1 = computeHash("hello world");
    const hash2 = computeHash("hello world");
    const hash3 = computeHash("different text");

    expect(hash1).toBe(hash2);
    expect(hash1).toHaveLength(64);
    expect(hash1).not.toBe(hash3);
  });

  it("should split long text into overlapping chunks", () => {
    const text = [
      "# Header 1",
      "This is a paragraph with several sentences. It explains the first point in detail.",
      "Another sentence in the same section providing further context.",
      "## Header 2",
      "Second section with distinct information. We want to ensure chunks retain semantic boundaries when possible.",
      "More details here to make this text longer than 200 characters so that chunking is triggered."
    ].join("\n\n");

    const chunks = chunkText(text, { maxChunkSize: 150, overlap: 30 });
    expect(chunks.length).toBeGreaterThan(1);

    // Ensure all chunks have index and valid text
    for (let i = 0; i < chunks.length; i++) {
      expect(chunks[i].chunkIndex).toBe(i);
      expect(chunks[i].text.length).toBeGreaterThan(0);
      expect(chunks[i].text.length).toBeLessThanOrEqual(250); // slight buffer for boundary matching
    }
  });

  it("should handle short text as a single chunk", () => {
    const text = "Short note.";
    const chunks = chunkText(text, { maxChunkSize: 500, overlap: 50 });
    expect(chunks).toHaveLength(1);
    expect(chunks[0].chunkIndex).toBe(0);
    expect(chunks[0].text).toBe("Short note.");
  });

  it("should extract clean text and title from html", () => {
    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Test Page Title</title>
          <style>body { color: red; }</style>
        </head>
        <body>
          <header><nav><a href="/">Home</a></nav></header>
          <main>
            <h1>Main Article Heading</h1>
            <p>First paragraph of the article.</p>
            <p>Second paragraph with <a href="/link">link text</a>.</p>
          </main>
          <footer>Copyright 2026</footer>
          <script>console.log("ignore me");</script>
        </body>
      </html>
    `;

    const extracted = extractHtmlText(html);
    expect(extracted.title).toBe("Test Page Title");
    expect(extracted.text).toContain("Main Article Heading");
    expect(extracted.text).toContain("First paragraph of the article.");
    expect(extracted.text).not.toContain("console.log");
    expect(extracted.text).not.toContain("body { color: red; }");
    expect(extracted.text).not.toContain("Copyright 2026");
  });

  it("should generate deterministic and safe vector IDs", () => {
    const id = generateVectorId("obsidian", "folder/sub-folder/my note.md", 0);
    expect(id).toBe("obsidian:folder/sub-folder/my_note.md:0");
  });

  describe("hasSecretTag", () => {
    it("should detect #secret in YAML frontmatter list", () => {
      const doc = `---
title: My Private Notes
tags:
  - personal
  - secret
  - work
---
Content of the note.`;
      expect(hasSecretTag(doc)).toBe(true);
    });

    it("should detect #secret in YAML frontmatter array format", () => {
      const doc = `---
tags: [architecture, secret, obsidian]
---
Some note content.`;
      expect(hasSecretTag(doc)).toBe(true);
    });

    it("should detect #secret in YAML frontmatter single tag", () => {
      const doc1 = `---
tags: secret
---
Content.`;
      const doc2 = `---
tag: secret
---
Content.`;
      expect(hasSecretTag(doc1)).toBe(true);
      expect(hasSecretTag(doc2)).toBe(true);
    });

    it("should detect #secret in Markdown body text", () => {
      const doc1 = "This is a note containing an inline tag #secret for confidentiality.";
      const doc2 = "# Obsidian Note\n\nSome sensitive notes here.\n\n#secret";
      const doc3 = "Note with nested tag #secret/finance in body.";
      expect(hasSecretTag(doc1)).toBe(true);
      expect(hasSecretTag(doc2)).toBe(true);
      expect(hasSecretTag(doc3)).toBe(true);
    });

    it("should NOT treat markdown headings like # Secret Title as #secret tag", () => {
      const doc = `# Secret Title

This is a public note explaining secrets in general without any tag.`;
      expect(hasSecretTag(doc)).toBe(false);
    });

    it("should NOT flag ordinary notes without secret tag", () => {
      const doc = `---
title: Architecture Guide
tags: [public, docs]
---
# Normal Heading
Just a regular guide with word secretively or secrecy in plain text.`;
      expect(hasSecretTag(doc)).toBe(false);
    });
  });
});
