import * as core from "@actions/core";
import { parseEnv } from "./config.js";
import { KnowbaseApiClient } from "./api.js";

async function main(): Promise<void> {
  try {
    const env = parseEnv(process.env);
    const client = new KnowbaseApiClient(env);

    core.info("Starting knowledge base data reset via API...");
    const result = await client.clearAllData();

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
