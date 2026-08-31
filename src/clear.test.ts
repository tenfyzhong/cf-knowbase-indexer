import { describe, expect, it } from "vitest";
import { resolveClearSource } from "./clear.js";

describe("resolveClearSource", () => {
  it("should use the first command-line argument", () => {
    expect(resolveClearSource(["personal-notes"], {})).toBe("personal-notes");
  });

  it("should ignore the pnpm argument separator", () => {
    expect(resolveClearSource(["--", "personal-notes"], {})).toBe(
      "personal-notes"
    );
  });

  it("should fall back to CLEAR_SOURCE", () => {
    expect(resolveClearSource([], { CLEAR_SOURCE: "blog" })).toBe("blog");
  });

  it("should return undefined for blank values", () => {
    expect(resolveClearSource(["  "], { CLEAR_SOURCE: "  " })).toBeUndefined();
  });
});
