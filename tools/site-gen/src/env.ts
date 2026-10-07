import { readFile } from "node:fs/promises";
import path from "node:path";

import { PACKAGE_ROOT } from "./config.js";

/**
 * Load KEY=VALUE pairs from tools/site-gen/.env into process.env
 * when not already set. No dependency on dotenv.
 */
export async function loadDotEnv(): Promise<void> {
  const envPath = path.join(PACKAGE_ROOT, ".env");
  let text: string;
  try {
    text = await readFile(envPath, "utf8");
  } catch {
    return;
  }
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}
