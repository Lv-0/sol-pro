import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";
import {
  createSolProSession,
  getSolProSessionPaths,
  markSolProSubmitted,
  MAX_INLINE_PROMPT_BYTES,
  readSolProAnswer,
  readSolProStatus,
  recordSolProAnswer,
  updateSolProStatus,
} from "../../src/sol-pro/session.js";

const tempDirs: string[] = [];

afterEach(async () => {
  vi.useRealTimers();
  await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

async function createRepoWithOutsideSibling(): Promise<string> {
  const parent = await fs.mkdtemp(path.join(os.tmpdir(), "sol-pro-parent-"));
  const cwd = path.join(parent, "repo");
  const sibling = path.join(parent, "sibling");
  await fs.mkdir(path.join(cwd, "src", "a"), { recursive: true });
  await fs.mkdir(sibling);
  tempDirs.push(parent);
  await fs.writeFile(path.join(sibling, "outside.ts"), "export const outside = true;\n");
  return cwd;
}

describe("sol-pro sessions", () => {
  test("does not discover legacy .ask-pro sessions", async () => {
    const cwd = await fs.mkdtemp(path.join(os.tmpdir(), "sol-pro-session-"));
    tempDirs.push(cwd);
    const legacyDir = path.join(cwd, ".ask-pro", "sessions", "legacy-session");
    await fs.mkdir(legacyDir, { recursive: true });
    await fs.writeFile(
      path.join(legacyDir, "status.json"),
      `${JSON.stringify({ sessionId: "legacy-session", status: "COMPLETED" })}\n`,
      "utf8",
    );

    await expect(readSolProStatus({ cwd })).rejects.toMatchObject({ code: "ENOENT" });
  });

  test("excludes legacy .ask-pro artifacts from prepared context", async () => {
    const cwd = await fs.mkdtemp(path.join(os.tmpdir(), "sol-pro-session-"));
    tempDirs.push(cwd);
    await fs.mkdir(path.join(cwd, ".ask-pro", "sessions", "legacy-session"), {
      recursive: true,
    });
    await fs.writeFile(path.join(cwd, "review.ts"), "export const review = true;\n", "utf8");
    await fs.writeFile(
      path.join(cwd, ".ask-pro", "sessions", "legacy-session", "ANSWER.md"),
      "historical private answer\n",
      "utf8",
    );

    const session = await createSolProSession({
      cwd,
      question: "Review the current source.",
      filePatterns: ["**/*"],
    });

    expect(session.manifest.includedFiles.map((file) => file.path)).toEqual(["review.ts"]);
  });

  test("creates a prepared in-app-browser session with manifests and a context zip", async () => {
    const cwd = await fs.mkdtemp(path.join(os.tmpdir(), "sol-pro-session-"));
    tempDirs.push(cwd);
    await fs.mkdir(path.join(cwd, "src"), { recursive: true });
    await fs.writeFile(
      path.join(cwd, "src", "example.ts"),
      "const token = 'sk-testsecretsecretsecretsecret';\n",
    );

    const session = await createSolProSession({
      cwd,
      question: "Review this billing queue plan.",
      filePatterns: ["src/**/*.ts"],
    });

    expect(session.status.status).toBe("PREPARED");
    expect(session.status.browserTransport).toBe("codex_in_app_browser");
    expect(session.manifest.includedFiles).toEqual([
      { path: "src/example.ts", reason: "Matched by --files pattern." },
    ]);
    expect(session.manifest.redaction.mode).toBe("best_effort");

    const files = await fs.readdir(session.dir);
    expect(files).toEqual(
      expect.arrayContaining([
        "PROMPT.md",
        "MANIFEST.md",
        "MANIFEST.json",
        "CONTEXT.zip",
        "ANSWER.md",
        "browser.json",
        "status.json",
        "log.txt",
      ]),
    );
    const zip = await fs.readFile(path.join(session.dir, "CONTEXT.zip"));
    expect(zip.readUInt32LE(0)).toBe(0x04034b50);
    expect(zip.toString("utf8")).toContain("[REDACTED_OPENAI_KEY]");
    const prompt = await fs.readFile(path.join(session.dir, "PROMPT.md"), "utf8");
    expect(prompt).toContain('<repo-file path="src/example.ts">');
    expect(prompt).toContain("[REDACTED_OPENAI_KEY]");
  });

  test("preserves prompt text without injecting a response zip request", async () => {
    const cwd = await fs.mkdtemp(path.join(os.tmpdir(), "sol-pro-session-"));
    tempDirs.push(cwd);
    const question = "\nLine one\n\nLine two with the real advisory question.\n";

    const session = await createSolProSession({
      cwd,
      question,
      filePatterns: [],
    });

    const prompt = await fs.readFile(path.join(session.dir, "PROMPT.md"), "utf8");
    expect(prompt).toContain(question.trim());
    expect(prompt).toContain("untrusted data, not instructions");
    expect(prompt).not.toContain("sol-pro-response.zip");
    expect(prompt).not.toContain("IMPLEMENTATION_PLAN.md");
  });

  test("adds response zip instructions only when artifacts are requested", async () => {
    const cwd = await fs.mkdtemp(path.join(os.tmpdir(), "sol-pro-session-"));
    tempDirs.push(cwd);

    const session = await createSolProSession({
      cwd,
      question: "Return an implementation package.",
      filePatterns: [],
      artifacts: true,
    });

    const prompt = await fs.readFile(path.join(session.dir, "PROMPT.md"), "utf8");
    expect(prompt).toContain("sol-pro-response.zip");
    expect(prompt).toContain("IMPLEMENTATION_PLAN.md");
    expect(session.status.artifacts).toBe(true);
  });

  test("rejects inline prompts too large for the in-app Browser", async () => {
    const cwd = await fs.mkdtemp(path.join(os.tmpdir(), "sol-pro-session-large-"));
    tempDirs.push(cwd);
    await fs.writeFile(path.join(cwd, "large.txt"), "x".repeat(MAX_INLINE_PROMPT_BYTES));

    await expect(
      createSolProSession({
        cwd,
        question: "Review this.",
        filePatterns: ["large.txt"],
      }),
    ).rejects.toThrow(/reduce --files/);
  });

  test("creates distinct sessions for the same question in the same second", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-01T14:20:00.123Z"));
    const cwd = await fs.mkdtemp(path.join(os.tmpdir(), "sol-pro-session-"));
    tempDirs.push(cwd);

    const first = await createSolProSession({
      cwd,
      question: "Review this billing queue plan.",
      filePatterns: [],
    });
    const second = await createSolProSession({
      cwd,
      question: "Review this billing queue plan.",
      filePatterns: [],
    });

    expect(first.id).toMatch(/^2026-05-01T142000-review-this-billing-queue-plan-[a-f0-9]{8}$/);
    expect(second.id).toMatch(/^2026-05-01T142000-review-this-billing-queue-plan-[a-f0-9]{8}$/);
    expect(second.id).not.toBe(first.id);
    expect((await fs.stat(first.dir)).isDirectory()).toBe(true);
    expect((await fs.stat(second.dir)).isDirectory()).toBe(true);
  });

  test("reads the latest session by creation metadata instead of directory name", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-01T14:20:00.123Z"));
    const cwd = await fs.mkdtemp(path.join(os.tmpdir(), "sol-pro-session-"));
    tempDirs.push(cwd);

    const first = await createSolProSession({
      cwd,
      question: "Zzz older question.",
      filePatterns: [],
    });
    const second = await createSolProSession({
      cwd,
      question: "Aaa newer question.",
      filePatterns: [],
    });
    expect(first.id.localeCompare(second.id)).toBeGreaterThan(0);

    for (const [session, createdAt] of [
      [first, "2026-05-01T14:20:00.000Z"],
      [second, "2026-05-01T14:20:00.001Z"],
    ] as const) {
      const statusPath = path.join(session.dir, "status.json");
      const status = JSON.parse(await fs.readFile(statusPath, "utf8")) as Record<string, unknown>;
      await fs.writeFile(
        statusPath,
        `${JSON.stringify({ ...status, createdAt, updatedAt: createdAt }, null, 2)}\n`,
        "utf8",
      );
    }

    await expect(readSolProStatus({ cwd })).resolves.toMatchObject({
      status: { sessionId: second.id },
    });
  });

  test("rejects path-like session ids before resolving session files", async () => {
    const cwd = path.join(os.tmpdir(), "sol-pro-missing-session-root");
    const invalidIds = ["", ".", "..", "../escape", "nested/id", "nested\\id", "bad.id"];

    for (const sessionId of invalidIds) {
      expect(() => getSolProSessionPaths(cwd, sessionId)).toThrow(/Invalid sol-pro session id/);
      await expect(readSolProStatus({ cwd, sessionId })).rejects.toThrow(
        /Invalid sol-pro session id/,
      );
      await expect(updateSolProStatus({ cwd, sessionId, status: "COMPLETED" })).rejects.toThrow(
        /Invalid sol-pro session id/,
      );
    }
  });

  test("normalizes Windows-style file and directory patterns", async () => {
    const cwd = await fs.mkdtemp(path.join(os.tmpdir(), "sol-pro-session-"));
    tempDirs.push(cwd);
    await fs.mkdir(path.join(cwd, "src", "nested"), { recursive: true });
    await fs.writeFile(path.join(cwd, "src", "nested", "a.ts"), "export const a = 1;\n");
    await fs.writeFile(path.join(cwd, "src", "b.ts"), "export const b = 2;\n");

    const session = await createSolProSession({
      cwd,
      question: "Review these files.",
      filePatterns: [
        path.join(cwd, "src", "nested", "a.ts"),
        ".\\src\\b.ts",
        path.join(cwd, "src", "nested"),
      ],
    });

    expect(session.manifest.includedFiles.map((file) => file.path)).toEqual([
      "src/b.ts",
      "src/nested/a.ts",
    ]);
  });

  test("keeps absolute project-root directory patterns scoped to the project", async () => {
    const cwd = await fs.mkdtemp(path.join(os.tmpdir(), "sol-pro-session-"));
    tempDirs.push(cwd);
    await fs.mkdir(path.join(cwd, "src"), { recursive: true });
    await fs.writeFile(path.join(cwd, "src", "rooted.ts"), "export const rooted = true;\n");

    const session = await createSolProSession({
      cwd,
      question: "Review the project.",
      filePatterns: [cwd],
    });

    expect(session.manifest.includedFiles.map((file) => file.path)).toEqual(["src/rooted.ts"]);
    expect(session.manifest.includedFiles.some((file) => path.isAbsolute(file.path))).toBe(false);
  });

  test("rejects absolute file paths outside the project cwd", async () => {
    const cwd = await fs.mkdtemp(path.join(os.tmpdir(), "sol-pro-session-"));
    const other = await fs.mkdtemp(path.join(os.tmpdir(), "sol-pro-outside-"));
    tempDirs.push(cwd, other);
    await fs.writeFile(path.join(other, "outside.ts"), "export const outside = true;\n");

    await expect(
      createSolProSession({
        cwd,
        question: "Review this.",
        filePatterns: [path.join(other, "outside.ts")],
      }),
    ).rejects.toThrow(/inside the project cwd/);
  });

  test("rejects parent-relative file paths outside the project cwd", async () => {
    const parent = await fs.mkdtemp(path.join(os.tmpdir(), "sol-pro-parent-"));
    const cwd = path.join(parent, "repo");
    const sibling = path.join(parent, "sibling");
    await fs.mkdir(cwd);
    await fs.mkdir(sibling);
    tempDirs.push(parent);
    await fs.writeFile(path.join(sibling, "outside.ts"), "export const outside = true;\n");

    await expect(
      createSolProSession({
        cwd,
        question: "Review this.",
        filePatterns: ["../sibling/outside.ts"],
      }),
    ).rejects.toThrow(/inside the project cwd/);
  });

  test.each([
    "../sibling/**/*.ts",
    "..\\sibling\\**\\*.ts",
    "../missing/**/*.ts",
    "src/*/../../../sibling/**/*.ts",
    "{src,../sibling}/**/*.ts",
    "src/*/{..,a}/../../sibling/**/*.ts",
    "src/*/@(..)/../../sibling/**/*.ts",
    "src/@(..|a)/../sibling/**/*.ts",
    "src/@(?(a))/../../sibling/**/*.ts",
    "src/{,a}/../../sibling/**/*.ts",
    "src/{a/../../../sibling,a}/**/*.ts",
    "src/?(a)/../../sibling/**/*.ts",
    "src/@(a|)/../../sibling/**/*.ts",
    "src/!(a)/../../sibling/**/*.ts",
    "src/@(a|@(b|))/../../sibling/**/*.ts",
    "src/?(a)../../sibling/**/*.ts",
    "src/@(?(a))../../sibling/**/*.ts",
    "src/@(a|@(b|))../../sibling/**/*.ts",
    "src/@(@(a|).)./../sibling/**/*.ts",
    "src/@(a|@(b|c)|)../../sibling/**/*.ts",
    "src/@(?()../..)/sibling/**/*.ts",
    "src/@(@(a|)/../../sibling|a)/**/*.ts",
    "src/+(a/../../sibling|b)/**/*.ts",
    "{src,C:/outside}/**/*.ts",
  ])("rejects outside project glob pattern %s", async (pattern) => {
    const cwd = await createRepoWithOutsideSibling();

    await expect(
      createSolProSession({
        cwd,
        question: "Review this.",
        filePatterns: [pattern],
      }),
    ).rejects.toThrow(/inside the project cwd/);
  });

  test("does not reject glob patterns with parent segments that stay inside the project cwd", async () => {
    const cwd = await fs.mkdtemp(path.join(os.tmpdir(), "sol-pro-session-"));
    tempDirs.push(cwd);
    await fs.mkdir(path.join(cwd, "src", "a"), { recursive: true });
    await fs.writeFile(path.join(cwd, "src", "root.ts"), "export const root = true;\n");

    await expect(
      createSolProSession({
        cwd,
        question: "Review this.",
        filePatterns: ["src/*/../*.ts"],
      }),
    ).resolves.toMatchObject({ status: { status: "PREPARED" } });
  });

  test.each(["src/{..,a}/**/*.ts"])(
    "does not reject in-project parent alternative glob %s",
    async (pattern) => {
      const cwd = await fs.mkdtemp(path.join(os.tmpdir(), "sol-pro-session-"));
      tempDirs.push(cwd);
      await fs.mkdir(path.join(cwd, "src", "a"), { recursive: true });

      await expect(
        createSolProSession({
          cwd,
          question: "Review this.",
          filePatterns: [pattern],
        }),
      ).resolves.toMatchObject({ status: { status: "PREPARED" } });
    },
  );

  test("does not reject in-project brace ranges with dot-dot text", async () => {
    const cwd = await fs.mkdtemp(path.join(os.tmpdir(), "sol-pro-session-"));
    tempDirs.push(cwd);
    await fs.mkdir(path.join(cwd, "src"), { recursive: true });

    await expect(
      createSolProSession({
        cwd,
        question: "Review this.",
        filePatterns: ["src/{a..z}/**/*.ts"],
      }),
    ).resolves.toMatchObject({ status: { status: "PREPARED" } });
  });

  test("allows parent segments that resolve inside the project cwd", async () => {
    const cwd = await fs.mkdtemp(path.join(os.tmpdir(), "sol-pro-session-"));
    tempDirs.push(cwd);
    await fs.mkdir(path.join(cwd, "src"), { recursive: true });
    await fs.writeFile(path.join(cwd, "README.md"), "# Inside\n");

    const session = await createSolProSession({
      cwd,
      question: "Review this.",
      filePatterns: ["src/../README.md"],
    });

    expect(session.manifest.includedFiles.map((file) => file.path)).toEqual(["README.md"]);
  });

  test("rejects absolute symlinked file paths that resolve outside the project cwd", async () => {
    const cwd = await fs.mkdtemp(path.join(os.tmpdir(), "sol-pro-session-"));
    const other = await fs.mkdtemp(path.join(os.tmpdir(), "sol-pro-outside-"));
    tempDirs.push(cwd, other);
    await fs.writeFile(path.join(other, "outside.ts"), "export const outside = true;\n");
    const link = path.join(cwd, "outside-link");
    await fs.symlink(other, link, process.platform === "win32" ? "junction" : "dir");

    await expect(
      createSolProSession({
        cwd,
        question: "Review this.",
        filePatterns: [link],
      }),
    ).rejects.toThrow(/inside the project cwd/);
  });

  test("rejects glob matches that traverse symlinked directories outside the project cwd", async () => {
    const cwd = await fs.mkdtemp(path.join(os.tmpdir(), "sol-pro-session-"));
    const other = await fs.mkdtemp(path.join(os.tmpdir(), "sol-pro-outside-"));
    tempDirs.push(cwd, other);
    await fs.writeFile(path.join(other, "outside.ts"), "export const outside = true;\n");
    const link = path.join(cwd, "outside-link");
    await fs.symlink(other, link, process.platform === "win32" ? "junction" : "dir");

    await expect(
      createSolProSession({
        cwd,
        question: "Review this.",
        filePatterns: ["outside-link/**/*.ts"],
      }),
    ).rejects.toThrow(/inside the project cwd/);
  });

  test("reads latest status and answer", async () => {
    const cwd = await fs.mkdtemp(path.join(os.tmpdir(), "sol-pro-session-"));
    tempDirs.push(cwd);
    const session = await createSolProSession({
      cwd,
      question: "Return a plan.",
      filePatterns: [],
    });

    const latest = await readSolProStatus({ cwd });
    expect(latest.status.sessionId).toBe(session.id);

    const answer = await readSolProAnswer({ cwd, sessionId: session.id });
    expect(answer.answer).toContain("Awaiting submission through the Codex in-app Browser");
  });

  test("records the in-app conversation URL and final answer", async () => {
    const cwd = await fs.mkdtemp(path.join(os.tmpdir(), "sol-pro-session-record-"));
    tempDirs.push(cwd);
    const session = await createSolProSession({
      cwd,
      question: "Review the host browser migration.",
      filePatterns: [],
    });
    const conversationUrl = "https://chatgpt.com/c/abc123-def456";

    const submitted = await markSolProSubmitted({
      cwd,
      sessionId: session.id,
      conversationUrl,
    });
    expect(submitted).toMatchObject({ status: "SUBMITTED", conversationUrl });

    const completed = await recordSolProAnswer({
      cwd,
      sessionId: session.id,
      answer: "# Approved\n\nUse the in-app Browser only.",
    });
    expect(completed).toMatchObject({ status: "COMPLETED", conversationUrl });
    await expect(readSolProAnswer({ cwd, sessionId: session.id })).resolves.toMatchObject({
      answer: "# Approved\n\nUse the in-app Browser only.\n",
    });
    const metadata = JSON.parse(await fs.readFile(path.join(session.dir, "browser.json"), "utf8"));
    expect(metadata).toMatchObject({
      transport: "codex_in_app_browser",
      status: "completed",
      conversationUrl,
    });
  });

  test("rejects non-ChatGPT recovery URLs", async () => {
    const cwd = await fs.mkdtemp(path.join(os.tmpdir(), "sol-pro-session-url-"));
    tempDirs.push(cwd);
    const session = await createSolProSession({
      cwd,
      question: "Review this.",
      filePatterns: [],
    });

    await expect(
      markSolProSubmitted({
        cwd,
        sessionId: session.id,
        conversationUrl: "https://example.com/c/not-chatgpt",
      }),
    ).rejects.toThrow(/ChatGPT conversation URL/);
  });

  test("clears stale reason when a later status has no reason", async () => {
    const cwd = await fs.mkdtemp(path.join(os.tmpdir(), "sol-pro-session-reason-"));
    tempDirs.push(cwd);
    const session = await createSolProSession({
      cwd,
      question: "Return a plan.",
      filePatterns: [],
    });

    await updateSolProStatus({
      cwd,
      sessionId: session.id,
      status: "FAILED",
      reason: "assistant_timeout",
    });
    const completed = await updateSolProStatus({
      cwd,
      sessionId: session.id,
      status: "COMPLETED",
    });

    expect(completed).not.toHaveProperty("reason");
    const { status } = await readSolProStatus({ cwd, sessionId: session.id });
    expect(status).not.toHaveProperty("reason");
  });
});
