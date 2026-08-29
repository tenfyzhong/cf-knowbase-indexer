import { describe, it, expect } from "vitest";
import { parseGitDiffOutput } from "./git.js";

describe("Git diff parser", () => {
  it("should correctly classify Added, Modified, Deleted, and Renamed files", () => {
    const diffOutput = [
      "A\tnotes/new-feature.md",
      "M\tnotes/existing-guide.md",
      "D\tnotes/old-doc.md",
      "R100\tnotes/old-name.md\tnotes/new-name.md",
      "A\timages/picture.png", // binary / non-matching
      "M\tnode_modules/pkg/readme.md" // excluded
    ].join("\n");

    const result = parseGitDiffOutput(
      diffOutput,
      ["**/*.md"],
      [".git", "node_modules"]
    );

    expect(result.added).toEqual(["notes/new-feature.md", "notes/new-name.md"]);
    expect(result.modified).toEqual(["notes/existing-guide.md"]);
    expect(result.deleted).toEqual(["notes/old-doc.md", "notes/old-name.md"]);
  });

  it("should handle empty diff output", () => {
    const result = parseGitDiffOutput("", ["**/*.md"], [".git"]);
    expect(result.added).toEqual([]);
    expect(result.modified).toEqual([]);
    expect(result.deleted).toEqual([]);
  });
});
