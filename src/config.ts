import * as core from "@actions/core";
import { z } from "zod";

export const GitSourceSchema = z.object({
  name: z.string().min(1),
  type: z.literal("git"),
  url: z.string().min(1),
  branch: z.string().optional(),
  include: z.array(z.string()).optional(),
  exclude: z.array(z.string()).optional(),
  token: z.string().optional()
});

export const WebSourceSchema = z.object({
  name: z.string().min(1),
  type: z.literal("web"),
  url: z.string().url(),
  maxDepth: z.number().int().min(1).default(1),
  urlPattern: z.string().optional(),
  headers: z.record(z.string()).optional(),
  include: z.array(z.string()).optional(),
  exclude: z.array(z.string()).optional()
});

export const SourceSchema = z.discriminatedUnion("type", [
  GitSourceSchema,
  WebSourceSchema
]);

export const ConfigSchema = z.array(SourceSchema);

export type GitSource = z.infer<typeof GitSourceSchema>;
export type WebSource = z.infer<typeof WebSourceSchema>;
export type Source = z.infer<typeof SourceSchema>;
export type Config = z.infer<typeof ConfigSchema>;

export interface Env {
  apiUrl: string;
  apiToken: string;
}

function normalizeUrl(url: string): string {
  let normalized = url.trim().replace(/\/+$/, "");
  if (normalized.endsWith("/search")) {
    normalized = normalized.slice(0, -"/search".length).replace(/\/+$/, "");
  }
  return normalized;
}

export function parseConfig(rawJson: string): Config {
  const parsed = JSON.parse(rawJson);
  return ConfigSchema.parse(parsed);
}

export function parseEnv(rawEnv: Record<string, string | undefined> = process.env): Env {
  const apiUrl = rawEnv.CF_KNOWBASE_API_URL || rawEnv.KNOWBASE_API_URL || rawEnv.API_URL;
  const apiToken = rawEnv.CF_KNOWBASE_API_TOKEN || rawEnv.KNOWBASE_API_TOKEN || rawEnv.API_TOKEN;

  if (!apiUrl || !apiToken) {
    throw new Error(
      "Missing required environment variables: CF_KNOWBASE_API_URL and CF_KNOWBASE_API_TOKEN must be set."
    );
  }
  return {
    apiUrl: normalizeUrl(apiUrl),
    apiToken: apiToken.trim()
  };
}

export function sanitizeLogs(config: Config, env: Env): void {
  if (env.apiToken && env.apiToken.length > 3) {
    core.setSecret(env.apiToken);
  }

  for (const src of config) {
    if (src.url && src.url.length > 3) {
      core.setSecret(src.url);

      try {
        const parsedUrl = new URL(src.url);
        if (parsedUrl.password && parsedUrl.password.length > 3) {
          core.setSecret(parsedUrl.password);
        }
        if (parsedUrl.username && parsedUrl.username.length > 3 && parsedUrl.username !== "git") {
          core.setSecret(parsedUrl.username);
        }
      } catch {
        // Not a standard HTTP(S) URL
      }
    }

    if (src.type === "git" && src.token && src.token.length > 3) {
      core.setSecret(src.token);
    }
  }
}
