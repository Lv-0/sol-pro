#!/usr/bin/env node
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rawArgs = process.argv.slice(2);
const args = rawArgs[0] === "--" ? rawArgs.slice(1) : rawArgs;
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const cacheRoot = path.resolve(scriptDir, "..");
const cliEntry = path.join(cacheRoot, "dist", "bin", "sol-pro-cli.js");
const launcher = `${quoteCommandPart(process.execPath)} ${quoteCommandPart(fileURLToPath(import.meta.url))} --`;

await ensureBuiltCli();

const child = spawn(process.execPath, [cliEntry, ...args], {
  env: {
    ...process.env,
    SOL_PRO_SOURCE_CHECKOUT_LAUNCHER: launcher,
  },
  stdio: "inherit",
});

child.on("exit", (code) => {
  process.exit(code ?? 0);
});

function quoteCommandPart(value) {
  if (process.platform !== "win32") {
    return `'${value.replace(/'/g, "'\\''")}'`;
  }
  return `"${value.replace(/"/g, '""')}"`;
}

async function ensureBuiltCli() {
  if (fs.existsSync(cliEntry)) return;

  const packageJson = path.join(cacheRoot, "package.json");
  if (!fs.existsSync(packageJson)) {
    throw new Error(`sol-pro plugin cache is missing package.json at ${packageJson}`);
  }

  console.error("[sol-pro] dist is missing; bootstrapping marketplace plugin cache.");
  await runNpm(["exec", "--yes", "pnpm@10.33.2", "--", "install", "--frozen-lockfile"]);
  if (!fs.existsSync(cliEntry)) {
    await runNpm(["exec", "--yes", "pnpm@10.33.2", "--", "run", "build"]);
  }

  if (!fs.existsSync(cliEntry)) {
    throw new Error(`sol-pro bootstrap completed but CLI entry is still missing: ${cliEntry}`);
  }
}

function runNpm(args) {
  const npmCli = path.join(
    path.dirname(process.execPath),
    "node_modules",
    "npm",
    "bin",
    "npm-cli.js",
  );
  if (fs.existsSync(npmCli)) {
    return run(process.execPath, [npmCli, ...args], false);
  }
  return run("npm", args, process.platform === "win32");
}

function run(command, args, shell) {
  const child = spawn(command, args, {
    cwd: cacheRoot,
    env: process.env,
    shell,
    stdio: "inherit",
  });

  return new Promise((resolve, reject) => {
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} ${args.join(" ")} exited with ${code ?? "unknown"}`));
    });
  });
}
