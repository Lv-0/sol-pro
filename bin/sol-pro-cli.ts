#!/usr/bin/env node
import "dotenv/config";
import fs from "node:fs/promises";
import path from "node:path";
import { Command, Option } from "commander";
import {
  createSolProSession,
  markSolProSubmitted,
  readSolProAnswer,
  readSolProStatus,
  recordSolProAnswer,
  type SolProStatusFile,
  updateSolProCommands,
  updateSolProStatus,
} from "../src/sol-pro/session.js";
import { renderToonRecord, type SolProToonFields } from "../src/sol-pro/toon.js";
import { getCliVersion } from "../src/version.js";

interface SolProOptions {
  files?: string[];
  promptFile?: string;
  artifacts?: boolean;
  responseZip?: boolean;
  markSubmitted?: string;
  record?: string;
  answerFile?: string;
  conversationUrl?: string;
  status?: string | boolean;
  harvest?: string | boolean;
  copy?: string | boolean;
  fail?: string;
  reason?: string;
  cwd?: string;
}

const program = new Command();

program
  .name("sol-pro")
  .description("Prepare and record ChatGPT Pro reviews for Codex's in-app Browser.")
  .version(getCliVersion())
  .argument("[question...]", "question to prepare for ChatGPT Pro")
  .option("--files <pattern>", "include files or globs in the context bundle", collectFiles, [])
  .option("--prompt-file <path>", "read the question from a UTF-8 file; use - for stdin")
  .option("--artifacts", "ask Pro for sol-pro-response.zip plus markdown fallback")
  .option("--response-zip", "alias for --artifacts")
  .option("--mark-submitted <session-id>", "record the in-app ChatGPT conversation URL")
  .option("--record <session-id>", "record a completed Pro answer from --answer-file")
  .option("--answer-file <path>", "UTF-8 markdown answer to record; must be inside the project cwd")
  .option("--conversation-url <url>", "recoverable https://chatgpt.com/c/... URL")
  .option("--status [session-id]", "show sol-pro session status")
  .option("--harvest [session-id]", "print ANSWER.md for a completed session")
  .option("--copy [session-id]", "print the ANSWER.md copy target")
  .option("--fail <session-id>", "mark a prepared or submitted session as failed")
  .option("--reason <text>", "failure reason used with --fail")
  .addOption(new Option("--cwd <path>", "project working directory").hideHelp())
  .action(async (questionParts: string[], options: SolProOptions) => {
    try {
      await runSolPro(questionParts.join(" "), options);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      writeToon("sol_pro_error", {
        code: classifyCliError(message),
        message,
        action: "inspect_session",
      });
      process.exitCode = 1;
    }
  });

await program.parseAsync(process.argv);

async function runSolPro(question: string, options: SolProOptions): Promise<void> {
  const cwd = resolveProjectCwd(options);
  const selectedActions = [
    options.status !== undefined,
    options.harvest !== undefined,
    options.copy !== undefined,
    options.markSubmitted !== undefined,
    options.record !== undefined,
    options.fail !== undefined,
  ].filter(Boolean).length;
  if (selectedActions > 1) {
    throw new Error("Choose only one session action at a time.");
  }

  if (options.status !== undefined) {
    const { status } = await readSolProStatus({ cwd, sessionId: optionSessionId(options.status) });
    printStatusRecord(status);
    return;
  }

  if (options.harvest !== undefined) {
    const { status } = await readSolProStatus({
      cwd,
      sessionId: optionSessionId(options.harvest),
    });
    if (!isAnswerBearingStatus(status)) {
      printStatusRecord(status);
      return;
    }
    const result = await readSolProAnswer({ cwd, sessionId: status.sessionId });
    await writeStdout(result.answer);
    if (status.status !== "HARVESTED") {
      await updateSolProStatus({ cwd, sessionId: result.sessionId, status: "HARVESTED" });
    }
    return;
  }

  if (options.copy !== undefined) {
    const { dir, status } = await readSolProStatus({
      cwd,
      sessionId: optionSessionId(options.copy),
    });
    if (!isAnswerBearingStatus(status)) {
      printStatusRecord(status);
      return;
    }
    writeToon("sol_pro", {
      session: status.sessionId,
      state: normalizeState(status.status),
      target: path.join(dir, "ANSWER.md"),
      action: "copy_target",
    });
    return;
  }

  if (options.markSubmitted !== undefined) {
    assertNoQuestion(question, options);
    if (!options.conversationUrl) {
      throw new Error("--mark-submitted requires --conversation-url.");
    }
    const status = await markSolProSubmitted({
      cwd,
      sessionId: options.markSubmitted,
      conversationUrl: options.conversationUrl,
    });
    printStatusRecord(status);
    return;
  }

  if (options.record !== undefined) {
    assertNoQuestion(question, options);
    if (!options.answerFile) {
      throw new Error("--record requires --answer-file.");
    }
    const answerPath = await resolveInputPathInsideCwd(cwd, options.answerFile);
    const answer = await fs.readFile(answerPath, "utf8");
    const status = await recordSolProAnswer({
      cwd,
      sessionId: options.record,
      answer,
      conversationUrl: options.conversationUrl,
    });
    printStatusRecord(status, { answer: relativeSessionPath(status.sessionId, "ANSWER.md") });
    return;
  }

  if (options.fail !== undefined) {
    assertNoQuestion(question, options);
    const reason = options.reason?.trim();
    if (!reason) {
      throw new Error("--fail requires --reason.");
    }
    const status = await updateSolProStatus({
      cwd,
      sessionId: options.fail,
      status: "FAILED",
      reason,
    });
    printStatusRecord(status);
    return;
  }

  if (options.answerFile || options.conversationUrl || options.reason) {
    throw new Error("Session metadata flags require --record, --mark-submitted, or --fail.");
  }

  const resolvedQuestion = await resolveQuestion(question, options, cwd);
  const artifacts = options.artifacts === true || options.responseZip === true;
  const session = await createSolProSession({
    cwd,
    question: resolvedQuestion,
    filePatterns: options.files ?? [],
    artifacts,
  });
  const currentStatus = await updateSolProCommands({
    cwd,
    sessionId: session.id,
    markSubmittedCommand: buildMarkSubmittedCommand(session.id, cwd),
    recordCommand: buildRecordCommand(session.id, cwd),
    harvestCommand: buildHarvestCommand(session.id, cwd),
  });
  printStatusRecord(currentStatus, {
    files: session.manifest.includedFiles.length,
    prompt: relativeSessionPath(session.id, "PROMPT.md"),
    context: relativeSessionPath(session.id, "CONTEXT.zip"),
  });
}

function collectFiles(value: string, previous: string[]): string[] {
  return previous.concat(value);
}

async function resolveQuestion(
  question: string,
  options: SolProOptions,
  cwd: string,
): Promise<string> {
  if (!options.promptFile) {
    return question;
  }
  if (question.trim()) {
    throw new Error("Use either a question argument or --prompt-file, not both.");
  }
  if (options.promptFile === "-") {
    if (process.stdin.isTTY) {
      throw new Error("--prompt-file - requires piped stdin.");
    }
    return readStdin();
  }
  return fs.readFile(path.resolve(cwd, options.promptFile), "utf8");
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf8");
}

function optionSessionId(value: string | boolean | undefined): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function assertNoQuestion(question: string, options: SolProOptions): void {
  if (question.trim() || options.promptFile || (options.files?.length ?? 0) > 0) {
    throw new Error("Session actions cannot be combined with a new question or --files.");
  }
}

async function resolveInputPathInsideCwd(cwd: string, input: string): Promise<string> {
  const root = await fs.realpath(cwd);
  const absolute = path.resolve(cwd, input);
  const real = await fs.realpath(absolute);
  const relative = path.relative(root, real);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("--answer-file must be inside the project cwd.");
  }
  return real;
}

function buildMarkSubmittedCommand(sessionId: string, cwd: string): string {
  return buildSessionCommand(cwd, ["--mark-submitted", sessionId, "--conversation-url", "<url>"]);
}

function buildRecordCommand(sessionId: string, cwd: string): string {
  return buildSessionCommand(cwd, ["--record", sessionId, "--answer-file", "<path>"]);
}

function buildHarvestCommand(sessionId: string, cwd: string): string {
  return buildSessionCommand(cwd, ["--harvest", sessionId]);
}

function buildSessionCommand(cwd: string, args: string[]): string {
  const launcher = buildLauncherCommand();
  const flags = [
    needsExplicitCwd(launcher) ? "--cwd" : null,
    needsExplicitCwd(launcher) ? quoteCommandArg(cwd) : null,
    ...args,
  ].filter((value): value is string => value !== null);
  return `${launcher} ${flags.join(" ")}`;
}

function buildLauncherCommand(): string {
  return process.env.SOL_PRO_SOURCE_CHECKOUT_LAUNCHER?.trim() || "sol-pro";
}

function needsExplicitCwd(launcher: string): boolean {
  return launcher !== "sol-pro";
}

function resolveProjectCwd(options: SolProOptions): string {
  if (options.cwd) return path.resolve(options.cwd);
  if (process.env.SOL_PRO_SOURCE_CHECKOUT_LAUNCHER && process.env.INIT_CWD) {
    return path.resolve(process.env.INIT_CWD);
  }
  return process.cwd();
}

function quoteCommandArg(value: string): string {
  if (process.platform !== "win32") {
    return `'${value.replace(/'/g, "'\\''")}'`;
  }
  return `"${value.replace(/"/g, '""')}"`;
}

function printStatusRecord(status: SolProStatusFile, extra: SolProToonFields = {}): void {
  writeToon("sol_pro", {
    session: status.sessionId,
    state: normalizeState(status.status),
    browser: status.browserTransport,
    reason: status.reason,
    conversation_url: status.conversationUrl,
    action: actionForStatus(status),
    mark_submitted: status.status === "PREPARED" ? status.markSubmittedCommand : undefined,
    record: ["PREPARED", "SUBMITTED", "WAITING"].includes(status.status)
      ? status.recordCommand
      : undefined,
    harvest: status.status === "COMPLETED" ? status.harvestCommand : undefined,
    ...extra,
  });
}

function actionForStatus(status: SolProStatusFile): string {
  switch (status.status) {
    case "PREPARED":
      return "submit_in_app_browser";
    case "SUBMITTED":
    case "WAITING":
      return "wait_or_reopen_conversation";
    case "COMPLETED":
      return "harvest";
    case "HARVESTED":
      return "read_answer";
    case "FAILED":
      return "inspect_session";
  }
}

function normalizeState(status: SolProStatusFile["status"]): string {
  return status.toLowerCase();
}

function isAnswerBearingStatus(status: SolProStatusFile): boolean {
  return status.status === "COMPLETED" || status.status === "HARVESTED";
}

function relativeSessionPath(sessionId: string, fileName: string): string {
  return `.sol-pro/sessions/${sessionId}/${fileName}`;
}

function writeToon(name: string, fields: SolProToonFields): void {
  process.stdout.write(`${renderToonRecord(name, fields)}\n`);
}

async function writeStdout(value: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    process.stdout.write(value, (error) => (error ? reject(error) : resolve()));
  });
}

function classifyCliError(message: string): string {
  const normalized = message.toLowerCase();
  if (
    normalized.includes("requires") ||
    normalized.includes("choose only one") ||
    normalized.includes("cannot be combined") ||
    normalized.includes("must be inside") ||
    normalized.includes("conversation url") ||
    normalized.includes("requires a question") ||
    normalized.includes("no sol-pro sessions") ||
    normalized.includes("use either a question argument or --prompt-file")
  ) {
    return "usage";
  }
  return "failed";
}
