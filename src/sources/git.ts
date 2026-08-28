import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import type { GitSource } from "../config.js";
import { computeHash } from "../chunker.js";
import type { DocumentItem } from "../sync.js";

const execFileAsync = promisify(execFile);

function matchPattern(filePath: string, patterns: string[]): boolean {
  return patterns.some((pattern) => {
    if (pattern.startsWith("**/")) {
      const ext = pattern.slice(3);
      if (ext.startsWith("*.")) {
        return filePath.endsWith(ext.slice(1));
      }
    }
    return filePath.includes(pattern.replace(/\*/g, ""));
  });
}

export async function loadGitDocuments(source: GitSource): Promise<Map<string, DocumentItem>> {
  const tempDir = path.join(os.tmpdir(), `cf-kb-git-${crypto.randomUUID()}`);
  const docs = new Map<string, DocumentItem>();

  try {
    const cloneArgs = ["clone", "--depth", "1"];
    if (source.branch) {
      cloneArgs.push("-b", source.branch);
    }

    let cloneUrl = source.url;
    if (source.token && cloneUrl.startsWith("https://")) {
      const urlObj = new URL(cloneUrl);
      urlObj.username = "x-access-token";
      urlObj.password = source.token;
      cloneUrl = urlObj.toString();
    }

    cloneArgs.push(cloneUrl, tempDir);

    await execFileAsync("git", cloneArgs, { timeout: 120000 });

    const includePatterns = source.include && source.include.length > 0
      ? source.include
      : ["**/*.md", "**/*.txt", "**/*.markdown"];
    const excludePatterns = source.exclude && source.exclude.length > 0
      ? source.exclude
      : [".git", "node_modules", ".DS_Store"];

    async function walk(dir: string, relDir: string = ""): Promise<void> {
      const entries = await fs.readdir(dir, { withFileTypes: true });

      for (const entry of entries) {
        const relPath = relDir ? `${relDir}/${entry.name}` : entry.name;

        if (excludePatterns.some((ex) => relPath.includes(ex))) {
          continue;
        }

        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          await walk(fullPath, relPath);
        } else if (entry.isFile()) {
          const isIncluded = matchPattern(relPath, includePatterns);
          if (isIncluded) {
            const content = await fs.readFile(fullPath, "utf-8");
            const hash = computeHash(content);
            docs.set(relPath, {
              path: relPath,
              hash,
              content,
              title: entry.name.replace(/\.[^/.]+$/, "")
            });
          }
        }
      }
    }

    await walk(tempDir);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  }

  return docs;
}
