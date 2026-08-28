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

  it("should parse required cloudflare environment variables", () => {
    const envMock = {
      CLOUDFLARE_ACCOUNT_ID: "acc_123456",
      CLOUDFLARE_API_TOKEN: "token_secret",
      CLOUDFLARE_KV_NAMESPACE_ID: "kv_namespace_789",
      CLOUDFLARE_VECTORIZE_INDEX_NAME: "kb-index"
    };

    const env = parseEnv(envMock);
    expect(env.accountId).toBe("acc_123456");
    expect(env.apiToken).toBe("token_secret");
    expect(env.kvNamespaceId).toBe("kv_namespace_789");
    expect(env.vectorizeIndexName).toBe("kb-index");
    expect(env.aiModel).toBe("@cf/baai/bge-base-en-v1.5");
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
      accountId: "acc_123456",
      apiToken: "token_secret_value",
      kvNamespaceId: "kv_123",
      vectorizeIndexName: "kb-index",
      aiModel: "@cf/baai/bge-base-en-v1.5"
    };

    sanitizeLogs(config, env);

    expect(core.setSecret).toHaveBeenCalledWith("ghp_123456789");
    expect(core.setSecret).toHaveBeenCalledWith("token_secret_value");
    expect(core.setSecret).toHaveBeenCalledWith("https://x-access-token:ghp_123456789@github.com/org/repo.git");
  });
});
