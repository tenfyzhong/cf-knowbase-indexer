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

export const EnvSchema = z.object({
  CLOUDFLARE_ACCOUNT_ID: z.string().min(1),
  CLOUDFLARE_API_TOKEN: z.string().min(1),
  CLOUDFLARE_KV_NAMESPACE_ID: z.string().min(1),
  CLOUDFLARE_VECTORIZE_INDEX_NAME: z.string().min(1),
  CLOUDFLARE_AI_MODEL: z.string().default("@cf/baai/bge-base-en-v1.5")
});

export interface Env {
  accountId: string;
  apiToken: string;
  kvNamespaceId: string;
  vectorizeIndexName: string;
  aiModel: string;
}

export function parseConfig(rawJson: string): Config {
  const parsed = JSON.parse(rawJson);
  return ConfigSchema.parse(parsed);
}

export function parseEnv(rawEnv: Record<string, string | undefined> = process.env): Env {
  const validated = EnvSchema.parse(rawEnv);
  return {
    accountId: validated.CLOUDFLARE_ACCOUNT_ID,
    apiToken: validated.CLOUDFLARE_API_TOKEN,
    kvNamespaceId: validated.CLOUDFLARE_KV_NAMESPACE_ID,
    vectorizeIndexName: validated.CLOUDFLARE_VECTORIZE_INDEX_NAME,
    aiModel: validated.CLOUDFLARE_AI_MODEL
  };
}

export function sanitizeLogs(config: Config, env: Env): void {
  if (env.apiToken && env.apiToken.length > 3) {
    core.setSecret(env.apiToken);
  }

  for (const src of config) {
    if (src.url && src.url.length > 3) {
      core.setSecret(src.url);

      // Extract embedded tokens/passwords in URLs like https://user:token@github.com/...
      try {
        const parsedUrl = new URL(src.url);
        if (parsedUrl.password && parsedUrl.password.length > 3) {
          core.setSecret(parsedUrl.password);
        }
        if (parsedUrl.username && parsedUrl.username.length > 3 && parsedUrl.username !== "git") {
          core.setSecret(parsedUrl.username);
        }
      } catch {
        // Not a standard HTTP(S) URL, e.g. git SSH URL
      }
    }

    if (src.type === "git" && src.token && src.token.length > 3) {
      core.setSecret(src.token);
    }
  }
}
