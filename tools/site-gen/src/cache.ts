import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdir, readFile, writeFile, access } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

import { CACHE_DIR } from "./config.js";

const execFileAsync = promisify(execFile);

async function ensureCacheDir(): Promise<void> {
  await mkdir(CACHE_DIR, { recursive: true });
}

function cacheKey(label: string, url: string): string {
  const hash = createHash("sha256").update(url).digest("hex").slice(0, 16);
  const safe = label.replace(/[^a-z0-9_-]+/gi, "_").toLowerCase();
  return `${safe}_${hash}`;
}

export function cachePath(label: string, url: string, ext: string): string {
  return path.join(CACHE_DIR, `${cacheKey(label, url)}.${ext}`);
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

function formatFetchError(err: unknown): string {
  if (!(err instanceof Error)) return String(err);
  const cause = (err as Error & { cause?: unknown }).cause;
  if (cause instanceof Error) {
    return `${err.message}: ${cause.message}`;
  }
  return err.message;
}

/**
 * Some environments (IPv6 / corporate DNS) time out Node fetch while curl works.
 */
const CURL_UA = "city-td-site-gen/0.0.1";

async function curlGet(url: string, outPath: string): Promise<void> {
  await execFileAsync(
    "curl",
    [
      "-fsSL",
      "-A",
      CURL_UA,
      "--connect-timeout",
      "30",
      "--max-time",
      "300",
      "-o",
      outPath,
      url,
    ],
    { maxBuffer: 64 * 1024 * 1024 },
  );
}

async function curlOverpass(
  url: string,
  query: string,
  outPath: string,
): Promise<void> {
  await execFileAsync(
    "curl",
    [
      "-fsSL",
      "-A",
      CURL_UA,
      "--connect-timeout",
      "30",
      "--max-time",
      "300",
      "-X",
      "POST",
      "--data-urlencode",
      `data=${query}`,
      "-o",
      outPath,
      url,
    ],
    { maxBuffer: 64 * 1024 * 1024 },
  );
}

/**
 * Fetch a URL into the cache directory. Reuses the cached file unless
 * `forceRefresh` is set.
 */
export async function cachedFetch(args: {
  label: string;
  url: string;
  ext: string;
  forceRefresh?: boolean;
  headers?: Record<string, string>;
}): Promise<{ path: string; fromCache: boolean; body: Buffer }> {
  await ensureCacheDir();
  const filePath = cachePath(args.label, args.url, args.ext);

  if (!args.forceRefresh && (await fileExists(filePath))) {
    const body = await readFile(filePath);
    return { path: filePath, fromCache: true, body };
  }

  try {
    const response = await fetch(
      args.url,
      args.headers ? { headers: args.headers } : undefined,
    );
    if (!response.ok) {
      throw new Error(
        `Failed to fetch ${args.label} (${args.url}): ${response.status} ${response.statusText}`,
      );
    }
    const body = Buffer.from(await response.arrayBuffer());
    await writeFile(filePath, body);
    return { path: filePath, fromCache: false, body };
  } catch (err) {
    console.warn(
      `  fetch failed for ${args.label} (${formatFetchError(err)}); trying curl…`,
    );
    await curlGet(args.url, filePath);
    const body = await readFile(filePath);
    return { path: filePath, fromCache: false, body };
  }
}

/**
 * Cache an Overpass POST body by hashing the query text.
 */
export async function cachedOverpass(args: {
  label: string;
  url: string;
  query: string;
  forceRefresh?: boolean;
}): Promise<{ path: string; fromCache: boolean; body: Buffer }> {
  await ensureCacheDir();
  const hash = createHash("sha256").update(args.query).digest("hex").slice(0, 16);
  const filePath = path.join(CACHE_DIR, `${args.label}_${hash}.json`);

  if (!args.forceRefresh && (await fileExists(filePath))) {
    const body = await readFile(filePath);
    return { path: filePath, fromCache: true, body };
  }

  const formBody = `data=${encodeURIComponent(args.query)}`;
  try {
    const response = await fetch(args.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": CURL_UA,
      },
      body: formBody,
    });
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(
        `Overpass ${args.label} failed: ${response.status} ${response.statusText} ${text.slice(0, 200)}`,
      );
    }
    const body = Buffer.from(await response.arrayBuffer());
    await writeFile(filePath, body);
    return { path: filePath, fromCache: false, body };
  } catch (err) {
    console.warn(
      `  Overpass fetch failed for ${args.label} (${formatFetchError(err)}); trying curl…`,
    );
    await curlOverpass(args.url, args.query, filePath);
    const body = await readFile(filePath);
    return { path: filePath, fromCache: false, body };
  }
}

export async function writeJsonCache(
  name: string,
  value: unknown,
): Promise<string> {
  await ensureCacheDir();
  const filePath = path.join(CACHE_DIR, name);
  await writeFile(filePath, JSON.stringify(value, null, 2), "utf8");
  return filePath;
}
