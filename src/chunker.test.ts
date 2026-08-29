import { describe, it, expect } from "vitest";
import { computeHash, chunkText, extractHtmlText, generateVectorId, hasConfidentialTag } from "./chunker.js";

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

    for (let i = 0; i < chunks.length; i++) {
      expect(chunks[i].chunkIndex).toBe(i);
      expect(chunks[i].text.length).toBeGreaterThan(0);
      expect(chunks[i].text.length).toBeLessThanOrEqual(250);
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

  it("should generate deterministic vector IDs strictly within 64 bytes", () => {
    const veryLongPath =
      "my_very_long_folder_name/another_deep_nested_directory/even_longer_subfolder_with_lots_of_words/and_a_super_lengthy_obsidian_markdown_document_title_with_detailed_description.md";
    const id = generateVectorId("notes", veryLongPath, 12);

    expect(id).toMatch(/^notes:[0-9a-f]{32}:12$/);
    expect(Buffer.byteLength(id, "utf-8")).toBeLessThanOrEqual(64);
  });

  describe("hasConfidentialTag", () => {
    it("should detect #confidential in YAML frontmatter list", () => {
      const doc = `---
title: My Private Notes
tags:
  - personal
  - confidential
  - work
---
Content of the note.`;
      expect(hasConfidentialTag(doc)).toBe(true);
    });

    it("should detect #confidential in YAML frontmatter array format", () => {
      const doc = `---
tags: [architecture, confidential, obsidian]
---
Some note content.`;
      expect(hasConfidentialTag(doc)).toBe(true);
    });

    it("should detect #confidential in YAML frontmatter single tag", () => {
      const doc1 = `---
tags: confidential
---
Content.`;
      const doc2 = `---
tag: confidential
---
Content.`;
      expect(hasConfidentialTag(doc1)).toBe(true);
      expect(hasConfidentialTag(doc2)).toBe(true);
    });

    it("should detect #confidential in Markdown body text", () => {
      const doc1 = "This is a note containing an inline tag #confidential for confidentiality.";
      const doc2 = "# Obsidian Note\n\nSome sensitive notes here.\n\n#confidential";
      const doc3 = "Note with nested tag #confidential/finance in body.";
      expect(hasConfidentialTag(doc1)).toBe(true);
      expect(hasConfidentialTag(doc2)).toBe(true);
      expect(hasConfidentialTag(doc3)).toBe(true);
    });

    it("should NOT treat markdown headings like # Confidential Title as #confidential tag", () => {
      const doc = `# Confidential Title

This is a public note explaining confidentiality in general without any tag.`;
      expect(hasConfidentialTag(doc)).toBe(false);
    });

    it("should NOT flag ordinary notes without confidential tag", () => {
      const doc = `---
title: Architecture Guide
tags: [public, docs]
---
# Normal Heading
Just a regular guide with word confidential in plain text body.`;
      expect(hasConfidentialTag(doc)).toBe(false);
    });
  });
});
