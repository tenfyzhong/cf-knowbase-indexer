import { describe, it, expect, vi, beforeEach } from "vitest";
import { parseConfig, parseEnv, sanitizeLogs, type Config, type Env } from "./config.js";
import * as core from "@actions/core";

vi.mock("@actions/core", () => ({
  setSecret: vi.fn(),
  info: vi.fn(),
  warning: vi.fn(),
  error: vi.fn()
}));

describe("config parser", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should parse valid git and web sources", () => {
    const rawConfig = JSON.stringify([
      {
        name: "obsidian",
        type: "git",
        url: "git@github.com:user/private-notes.git",
        branch: "main",
        include: ["**/*.md"]
      },
      {
        name: "blog",
        type: "web",
        url: "https://example.com/blog",
        maxDepth: 2,
        urlPattern: "https://example.com/blog/.*"
      }
    ]);

    const parsed = parseConfig(rawConfig);
    expect(parsed).toHaveLength(2);
    expect(parsed[0]).toEqual({
      name: "obsidian",
      type: "git",
      url: "git@github.com:user/private-notes.git",
      branch: "main",
      include: ["**/*.md"]
    });
    expect(parsed[1]).toEqual({
      name: "blog",
      type: "web",
      url: "https://example.com/blog",
      maxDepth: 2,
      urlPattern: "https://example.com/blog/.*"
    });
  });

  it("should reject invalid source configuration", () => {
    const rawConfig = JSON.stringify([
      {
        name: "invalid-type",
        type: "ftp",
        url: "ftp://example.com"
      }
    ]);

    expect(() => parseConfig(rawConfig)).toThrow();
  });

  it("should parse required API environment variables", () => {
    const envMock = {
      CF_KNOWBASE_API_URL: "https://my-knowbase-api.workers.dev",
      CF_KNOWBASE_API_TOKEN: "token_secret_123"
    };

    const env = parseEnv(envMock);
    expect(env.apiUrl).toBe("https://my-knowbase-api.workers.dev");
    expect(env.apiToken).toBe("token_secret_123");
  });

  it("should normalize api url by trimming trailing slashes", () => {
    const envMock = {
      CF_KNOWBASE_API_URL: "https://my-knowbase-api.workers.dev///",
      CF_KNOWBASE_API_TOKEN: "token_secret_123"
    };

    const env = parseEnv(envMock);
    expect(env.apiUrl).toBe("https://my-knowbase-api.workers.dev");
  });

  it("should throw if required env vars are missing", () => {
    expect(() => parseEnv({})).toThrow();
  });

  it("should mask sensitive values with @actions/core.setSecret", () => {
    const config: Config = [
      {
        name: "private-repo",
        type: "git",
        url: "https://x-access-token:ghp_123456789@github.com/org/repo.git"
      },
      {
        name: "auth-web",
        type: "web",
        url: "https://example.com/internal"
      }
    ];

    const env: Env = {
      apiUrl: "https://my-knowbase-api.workers.dev",
      apiToken: "token_secret_value"
    };

    sanitizeLogs(config, env);

    expect(core.setSecret).toHaveBeenCalledWith("ghp_123456789");
    expect(core.setSecret).toHaveBeenCalledWith("token_secret_value");
    expect(core.setSecret).toHaveBeenCalledWith("https://x-access-token:ghp_123456789@github.com/org/repo.git");
  });
});
