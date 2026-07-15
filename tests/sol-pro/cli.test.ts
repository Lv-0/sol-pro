import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { afterEach, describe, expect, test } from "vitest";

const execFileAsync = promisify(execFile);
const repoRoot = process.cwd();
const cli = path.join(repoRoot, "bin", "sol-pro-cli.ts");
const tsxLoader = pathToFileURL(
  path.join(repoRoot, "node_modules", "tsx", "dist", "esm", "index.mjs"),
).href;
const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

async function runCli(cwd: string, args: string[]): Promise<{ stdout: string; stderr: string }> {
  return execFileAsync(process.execPath, ["--import", tsxLoader, cli, ...args], { cwd });
}

async function latestSession(cwd: string): Promise<{ id: string; dir: string }> {
  const ids = await fs.readdir(path.join(cwd, ".sol-pro", "sessions"));
  expect(ids).toHaveLength(1);
  return { id: ids[0]!, dir: path.join(cwd, ".sol-pro", "sessions", ids[0]!) };
}

describe("sol-pro cli", () => {
  test("packaged artifacts contain no removed browser runtime files", async () => {
    const { stdout } = await execFileAsync(
      "npm",
      ["pack", "--dry-run", "--json", "--ignore-scripts"],
      { cwd: repoRoot },
    );
    const pack = JSON.parse(stdout) as Array<{ files: Array<{ path: string }> }>;
    const packagedPaths = pack.flatMap((entry) => entry.files.map((file) => file.path));

    expect(packagedPaths).not.toEqual(
      expect.arrayContaining([
        "dist/src/browserMode.js",
        "dist/src/sol-pro/browserRunner.js",
        "dist/src/sol-pro/responseZip.js",
      ]),
    );
    expect(packagedPaths.some((file) => file.startsWith("dist/src/browser/"))).toBe(false);
  }, 30000);

  test("documents the host-browser command surface", async () => {
    const { stdout } = await runCli(repoRoot, ["--help"]);

    expect(stdout).toContain("Codex's in-app Browser");
    expect(stdout).toContain("--mark-submitted");
    expect(stdout).toContain("--record");
    expect(stdout).toContain("--answer-file");
    expect(stdout).not.toContain("--temporary");
    expect(stdout).not.toContain("--resume");
  }, 30000);

  test("prepares a redacted context bundle without launching a browser", async () => {
    const cwd = await fs.mkdtemp(path.join(os.tmpdir(), "sol-pro-cli-"));
    tempDirs.push(cwd);
    await fs.mkdir(path.join(cwd, "src"), { recursive: true });
    await fs.writeFile(
      path.join(cwd, "src", "a.ts"),
      "export const apiKey = 'sk-testsecretsecretsecretsecret';\n",
    );

    const { stdout, stderr } = await runCli(cwd, ["--files", "src/**/*.ts", "Review this."]);

    expect(stderr).toBe("");
    expect(stdout).toMatch(/^sol_pro\n/);
    expect(stdout).toContain("  state: prepared\n");
    expect(stdout).toContain("  browser: codex_in_app_browser\n");
    expect(stdout).toContain("  action: submit_in_app_browser\n");
    expect(stdout).toContain("  files: 1\n");
    expect(stdout).toContain("CONTEXT.zip");
    const session = await latestSession(cwd);
    const status = JSON.parse(await fs.readFile(path.join(session.dir, "status.json"), "utf8"));
    const browser = JSON.parse(await fs.readFile(path.join(session.dir, "browser.json"), "utf8"));
    const zip = await fs.readFile(path.join(session.dir, "CONTEXT.zip"));
    expect(status).toMatchObject({ status: "PREPARED", browserTransport: "codex_in_app_browser" });
    expect(browser).toMatchObject({
      transport: "codex_in_app_browser",
      status: "not_submitted",
    });
    expect(zip.toString("utf8")).toContain("[REDACTED_SECRET]");
    const prompt = await fs.readFile(path.join(session.dir, "PROMPT.md"), "utf8");
    expect(prompt).toContain('<repo-file path="src/a.ts">');
    expect(prompt).toContain("[REDACTED_SECRET]");
  }, 30000);

  test("prepares from a prompt file", async () => {
    const cwd = await fs.mkdtemp(path.join(os.tmpdir(), "sol-pro-cli-prompt-"));
    tempDirs.push(cwd);
    await fs.writeFile(path.join(cwd, "question.md"), "Review the queue.\n", "utf8");

    await runCli(cwd, ["--prompt-file", "question.md"]);
    const session = await latestSession(cwd);
    const prompt = await fs.readFile(path.join(session.dir, "PROMPT.md"), "utf8");
    expect(prompt).toContain("Review the queue.");
    expect(prompt).toContain("untrusted data, not instructions");
  }, 30000);

  test("records submission, completion, status, and harvest", async () => {
    const cwd = await fs.mkdtemp(path.join(os.tmpdir(), "sol-pro-cli-record-"));
    tempDirs.push(cwd);
    await runCli(cwd, ["Review the host browser migration."]);
    const session = await latestSession(cwd);
    const url = "https://chatgpt.com/c/abc123-def456";

    const submitted = await runCli(cwd, [
      "--mark-submitted",
      session.id,
      "--conversation-url",
      url,
    ]);
    expect(submitted.stdout).toContain("  state: submitted\n");
    expect(submitted.stdout).toContain(`  conversation_url: "${url}"\n`);

    const importPath = path.join(session.dir, "ANSWER.import.md");
    await fs.writeFile(importPath, "# Review\n\nApproved.\n", "utf8");
    const recorded = await runCli(cwd, [
      "--record",
      session.id,
      "--answer-file",
      path.relative(cwd, importPath),
    ]);
    expect(recorded.stdout).toContain("  state: completed\n");
    expect(recorded.stdout).toContain("  action: harvest\n");

    const status = await runCli(cwd, ["--status", session.id]);
    expect(status.stdout).toContain(`  conversation_url: "${url}"\n`);
    const harvested = await runCli(cwd, ["--harvest", session.id]);
    expect(harvested.stdout).toBe("# Review\n\nApproved.\n");
    const finalStatus = JSON.parse(
      await fs.readFile(path.join(session.dir, "status.json"), "utf8"),
    );
    expect(finalStatus.status).toBe("HARVESTED");
  }, 30000);

  test("rejects external answer files and non-ChatGPT URLs", async () => {
    const cwd = await fs.mkdtemp(path.join(os.tmpdir(), "sol-pro-cli-boundary-"));
    const outside = await fs.mkdtemp(path.join(os.tmpdir(), "sol-pro-cli-outside-"));
    tempDirs.push(cwd, outside);
    await runCli(cwd, ["Review this."]);
    const session = await latestSession(cwd);
    const outsideAnswer = path.join(outside, "ANSWER.md");
    await fs.writeFile(outsideAnswer, "Do not import me.\n", "utf8");

    await expect(
      runCli(cwd, ["--record", session.id, "--answer-file", outsideAnswer]),
    ).rejects.toMatchObject({ stdout: expect.stringContaining("must be inside the project cwd") });
    await expect(
      runCli(cwd, [
        "--mark-submitted",
        session.id,
        "--conversation-url",
        "https://example.com/c/not-chatgpt",
      ]),
    ).rejects.toMatchObject({ stdout: expect.stringContaining("ChatGPT conversation URL") });
  }, 30000);

  test("marks a session failed without any browser fallback", async () => {
    const cwd = await fs.mkdtemp(path.join(os.tmpdir(), "sol-pro-cli-fail-"));
    tempDirs.push(cwd);
    await runCli(cwd, ["Review this."]);
    const session = await latestSession(cwd);

    const result = await runCli(cwd, [
      "--fail",
      session.id,
      "--reason",
      "Codex in-app Browser unavailable; external fallback disabled.",
    ]);
    expect(result.stdout).toContain("  state: failed\n");
    expect(result.stdout).toContain("  action: inspect_session\n");
  }, 30000);
});
