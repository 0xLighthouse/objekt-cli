import { MIME_MAP } from "@objekt/shared";
import { Cli, z } from "incur";
import { sha256 } from "viem";

import { getApiUrl } from "../api";
import { getWalletAddress, signUpload } from "../sign";

const MAX_TOTAL_SIZE = 10 * 1024 * 1024; // 10MB

const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  ".next",
  ".svelte-kit",
  "__pycache__",
]);

function getMime(filePath: string): string {
  const ext = `.${filePath.split(".").pop()?.toLowerCase()}`;
  return MIME_MAP[ext] ?? "application/octet-stream";
}

const deploy = Cli.create("deploy", {
  description: "Deploy a static site to a temporary preview URL",
  args: z.object({
    directory: z
      .string()
      .describe("Path to static site directory (e.g. ./dist)"),
  }),
  options: z.object({
    ows: z.string().describe("OWS wallet name"),
    api: z.string().optional().describe("API base URL"),
    network: z
      .enum(["mainnet", "sepolia"])
      .default("mainnet")
      .describe("Network"),
    testnet: z.boolean().default(false).describe("Use testnet"),
    storage: z
      .enum(["tmp", "ipfs"])
      .default("tmp")
      .describe(
        "Storage: tmp (7d preview) or ipfs (permanent, sets contenthash)",
      ),
  }),
  alias: { ows: "w" },
  output: z.object({
    url: z.string(),
    hash: z.string(),
    files: z.number(),
    size: z.string(),
    expiresIn: z.string(),
    uri: z.string().optional(),
    contenthash: z.string().optional(),
  }),
  async run(c) {
    const { readdir, readFile, stat } = await import("node:fs/promises");
    const { join } = await import("node:path");

    const dir = c.args.directory.replace(/\/$/, "");

    // Verify directory exists
    const dirStat = await stat(dir).catch(() => null);
    if (!dirStat?.isDirectory()) {
      return c.error({
        code: "NOT_DIRECTORY",
        message: `${dir} is not a directory`,
        exitCode: 1,
      });
    }

    // Pre-scan: count files and total size before reading into memory
    const entries = await readdir(dir, { recursive: true });
    const filePaths: { entry: string; fullPath: string; size: number }[] = [];
    let totalSize = 0;

    for (const entry of entries) {
      const parts = entry.split("/");
      if (parts.some((p) => p.startsWith(".") || SKIP_DIRS.has(p))) continue;

      const fullPath = join(dir, entry);
      const fileStat = await stat(fullPath).catch(() => null);
      if (!fileStat?.isFile()) continue;

      totalSize += fileStat.size;
      filePaths.push({ entry, fullPath, size: fileStat.size });
    }

    if (filePaths.length === 0) {
      return c.error({
        code: "EMPTY",
        message: "No files found in directory",
        exitCode: 1,
      });
    }

    if (filePaths.length > 200) {
      return c.error({
        code: "TOO_MANY_FILES",
        message: `${filePaths.length} files exceeds 200 file limit`,
        exitCode: 1,
      });
    }

    if (totalSize > MAX_TOTAL_SIZE) {
      return c.error({
        code: "TOO_LARGE",
        message: `Total size ${(totalSize / 1024 / 1024).toFixed(1)}MB exceeds 10MB limit`,
        exitCode: 1,
      });
    }

    // Read files into memory
    const files: { path: string; buffer: Buffer }[] = [];
    for (const { entry, fullPath } of filePaths) {
      files.push({ path: entry, buffer: await readFile(fullPath) });
    }

    // Warn if no index.html
    if (!files.some((f) => f.path === "index.html")) {
      console.error("Warning: no index.html found at root of directory");
    }

    // Compute hash from sorted file bytes
    const sorted = [...files].sort((a, b) => a.path.localeCompare(b.path));
    const combined = Buffer.concat(sorted.map((f) => f.buffer));
    const hash = sha256(new Uint8Array(combined));

    // Sign with wallet
    const address = getWalletAddress(c.options.ows);
    const { sig, expiry, unverifiedAddress } = signUpload({
      wallet: c.options.ows,
      name: address,
      uploadType: "deploy",
      bytes: new Uint8Array(combined),
    });

    // Build file entries
    const fileEntries = files.map((f) => ({
      path: f.path,
      dataURL: `data:${getMime(f.path)};base64,${f.buffer.toString("base64")}`,
    }));

    const storageParam = c.options.storage === "ipfs" ? "?storage=ipfs" : "";
    const url = `${getApiUrl(c.options)}/deploy${storageParam}`;

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        hash,
        files: fileEntries,
        expiry,
        sig,
        unverifiedAddress,
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      return c.error({ code: "DEPLOY_FAILED", message: text, exitCode: 1 });
    }

    return await res.json();
  },
});

export default deploy;
