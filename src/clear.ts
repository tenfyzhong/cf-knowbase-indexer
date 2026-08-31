import * as core from "@actions/core";
import { parseEnv } from "./config.js";
import { KnowbaseApiClient } from "./api.js";

export function resolveClearSource(
  args: string[] = process.argv.slice(2),
  env: Record<string, string | undefined> = process.env
): string | undefined {
  const argumentSource = args.find((value) => value !== "--" && value.trim());
  return argumentSource?.trim() || env.CLEAR_SOURCE?.trim() || undefined;
}

async function main(): Promise<void> {
  try {
    const env = parseEnv(process.env);
    const client = new KnowbaseApiClient(env);
    const source = resolveClearSource();

    core.info(
      source
        ? `Starting knowledge base data reset for source: ${source}`
        : "Starting full knowledge base data reset via API..."
    );
    const result = await client.clearData(source);

    core.info("Knowledge base data cleared successfully!");
    core.info(`Deleted Vectors Count: ${result.deletedVectorsCount}`);
    core.info(`Cleared Sources: ${result.clearedSources.join(", ") || "(none)"}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    core.setFailed(`Knowledge Base Clear failed: ${message}`);
    process.exit(1);
  }
}

if (process.env.NODE_ENV !== "test") {
  main();
}
