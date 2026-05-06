# ask_pro

`ask_pro` is a browser-backed ChatGPT Pro escalation tool for coding agents.

It gives an agent a small command surface for the moments where a second opinion
is worth the wait: architecture calls, production-risk reviews, migrations,
debugging strategy, and implementation planning. The agent chooses the prompt
and context, `ask-pro` opens ChatGPT in a persistent browser profile, uploads the
bundle, waits for Pro, and stores the result in a project-local session.

```bash
ask-pro --no-temporary --files src --files tests "Review this implementation plan before I edit."
```

Status: pre-release. The CLI is usable from source, and the Codex plugin can be
installed from a local marketplace entry. The package is not published to npm
yet.

## What It Does

- Builds a focused `CONTEXT.zip` from files the agent explicitly selects.
- Uses a persistent Chrome profile so ChatGPT login stays human-controlled.
- Selects ChatGPT Pro with standard thinking by default.
- Supports `--extended` for deep, long-running Pro consults.
- Writes compact agent-readable telemetry on stdout.
- Harvests markdown answers by default.
- Extracts a generated response zip only when `--artifacts` is requested.

The coding agent still owns the work. `ask-pro` gets the consult; it does not
apply generated code or execute generated files.

## Requirements

- Node.js 24+
- pnpm 10+
- A ChatGPT account with Pro access in the browser profile used by `ask-pro`

Authentication is deliberately manual. `ask-pro` never asks for, types, reads,
or logs passwords, MFA codes, recovery codes, session cookies, or raw auth
tokens.

## Install From Source

```bash
git clone https://github.com/Pimpmuckl/ask-pro.git
cd ask-pro
pnpm install
pnpm run build
pnpm start -- "Return exactly ASK_PRO_OK."
```

For a shell-local binary:

```bash
pnpm link --global
ask-pro "Review the staged implementation plan."
```

An eventual `npm install -g ask_pro` would install the `ask-pro` CLI only. It
would not automatically register the Codex plugin unless Codex adds an npm-based
plugin installer or marketplace source.

## Install The Codex Plugin

The Codex plugin is what makes `$ask-pro` and `$ask-pro:ask-pro` appear in
Codex. Add this repo to your home marketplace file:

```text
~/.agents/plugins/marketplace.json
```

Example marketplace:

```json
{
  "name": "local",
  "interface": {
    "displayName": "Local Plugins"
  },
  "plugins": [
    {
      "name": "ask-pro",
      "source": {
        "source": "local",
        "path": "../../Code/ask-pro"
      },
      "policy": {
        "installation": "AVAILABLE",
        "authentication": "ON_USE"
      },
      "category": "Productivity"
    }
  ]
}
```

Then enable the plugin in your Codex config:

```toml
[plugins."ask-pro@local"]
enabled = true
```

Use your marketplace name in place of `local` if your marketplace uses another
name. Restart or reload Codex; the skill list should include `$ask-pro` and
`$ask-pro:ask-pro`.

After changing plugin-facing files such as `README.md`,
`.codex-plugin/plugin.json`, or `skills/ask-pro/SKILL.md`, refresh the local
plugin cache from the repo source:

```bash
pnpm run plugin:refresh
```

The cache under `~/.codex/plugins/cache/...` is generated install state. Do not
edit or copy files there by hand. Agents should use the cached runner, not a
mutable development checkout, when `ask-pro` is not on `PATH`:

```bash
node "$HOME/.codex/plugins/cache/<marketplace-name>/ask-pro/local/scripts/run-cached-cli.mjs" -- --cwd /path/to/repo --no-temporary --prompt-file question.md --files src
```

PowerShell equivalent:

```powershell
node "$env:USERPROFILE\.codex\plugins\cache\<marketplace-name>\ask-pro\local\scripts\run-cached-cli.mjs" -- --cwd C:\path\to\repo --no-temporary --prompt-file question.md --files src
```

In cached-runner mode, `--files` must resolve inside `--cwd`. Prefer
repo-relative file paths.

## First Login

The default persistent browser profile lives at:

```text
~/.agents/skills/ask-pro/browser-profile
```

For ordinary single-agent use, leave `ASK_PRO_AGENT_ID` unset so runs reuse this
shared profile. For independent concurrent agents, set a stable reusable id:

```bash
ASK_PRO_AGENT_ID=review-t1 ask-pro --no-temporary "Review this migration plan."
```

That creates an isolated profile under:

```text
~/.agents/skills/ask-pro/agents/review-t1-<hash>/browser-profile
```

Each new profile may need a human login. If auth is required, `ask-pro` records
the session and prints a compact state with a resume command. Log in in the
opened browser, then resume:

```bash
ask-pro --resume <session-id>
```

On Windows, after login is healthy and the ChatGPT composer is visible,
authenticated runs may minimize freshly launched managed Chrome so the desktop is
less distracting. Local managed Chrome also ignores accidental human input while
Pro is answering. If login, MFA, a browser challenge, or incomplete-answer
debugging needs human attention, `ask-pro` restores the retained browser.

## Temporary Chat

Fresh runs try ChatGPT Temporary Chat first:

```text
https://chatgpt.com/?temporary-chat=true
```

If the current account or UI does not expose Pro in Temporary Chat, `ask-pro`
automatically retries the fresh default run in normal ChatGPT. Use
`--temporary` only when Temporary Chat is required and fallback would be wrong.

For repo advisories, large bundles, review rounds, or anything where recovery
matters, prefer `--no-temporary`:

```bash
ask-pro --no-temporary --prompt-file question.md --files src
```

Temporary Chat sessions are less recoverable if the browser or tab is closed
before harvest. Non-temporary runs can surface a recoverable `conversation_url`
when ChatGPT provides one.

## Thinking Effort

Normal Pro thinking is the default. Use `--extended` only for difficult
architecture questions, production-risk reviews, or implementation-plan packages
where a multi-hour wait is acceptable:

```bash
ask-pro --extended --no-temporary --prompt-file architecture-question.md --files docs --files src
```

When ChatGPT labels the model row simply as `Pro`, `ask-pro` treats that as the
current Pro target. Exact dated model strings are only hints.

## Commands

```bash
ask-pro [options] [question...]
```

| Option                   | Purpose                                                                 |
| ------------------------ | ----------------------------------------------------------------------- |
| `--files <pattern>`      | Add a file, directory, or glob to the context bundle. Repeat as needed. |
| `--prompt-file <path>`   | Read the question from a UTF-8 file; use `-` for stdin.                 |
| `--artifacts`            | Ask for `ask-pro-response.zip` plus markdown fallback.                  |
| `--response-zip`         | Alias for `--artifacts`.                                                |
| `--dry-run`              | Create the session and `CONTEXT.zip` without opening ChatGPT.           |
| `--resume [session-id]`  | Resume the latest or selected prepared/waiting session.                 |
| `--status [session-id]`  | Show the latest or selected session status.                             |
| `--harvest [session-id]` | Print `ANSWER.md` only for answer-bearing sessions; else print status.  |
| `--copy [session-id]`    | Print `ANSWER.md` path for answer-bearing sessions, else status.        |
| `--extended`             | Request Extended Pro thinking for deep, multi-hour escalations.         |
| `--temporary`            | Require ChatGPT Temporary Chat; fail instead of falling back.           |
| `--no-temporary`         | Start or resume outside Temporary Chat.                                 |
| `--verbose`              | Print browser automation diagnostics.                                   |

Examples:

```bash
ask-pro --dry-run --files "src/**/*.ts" "Audit this slice for hidden coupling."
ask-pro --files src/ask-pro/session.ts --files tests/ask-pro "Find missing tests."
ask-pro --no-temporary --prompt-file question.md --files src --files tests
ask-pro --artifacts --prompt-file implementation-plan.md --files src
ask-pro --status
ask-pro --harvest <session-id>
```

Use `--prompt-file` for multiline prompts. This avoids shell quoting issues and
keeps the exact question in `PROMPT.md`.

`--files` accepts files, directories, and globs. Windows backslash paths and
absolute paths inside the project cwd are normalized into stable relative
manifest paths. For cross-repo calls, pass `--cwd <target-repo-root>` and keep
`--files` repo-relative to that cwd.

Add `.ask-pro/` to consuming repos' `.gitignore`. Session files are local run
artifacts and should not show up in normal diffs.

Keep context bundles focused: relevant source files, focused tests, docs that
define the contract, known recent changes, and validation status. Avoid
whole-repo bundles unless the question is explicitly broad architecture.

## Agent Output

`ask-pro` is agent-facing. Normal stdout is compact TOON-style telemetry;
browser progress and diagnostics go to stderr and session logs. `--harvest` is
the exception: it prints the raw markdown answer so agents can pipe or read the
Pro answer without metadata noise.

Example status output:

```toon
ask_pro
  session: 2026-05-02T192156-review-this
  state: dry_run_complete
  thinking: standard
  temporary: default
  action: resume
  resume: "ask-pro --resume 2026-05-02T192156-review-this"
  files: 1
```

Example auth gate:

```toon
ask_pro
  session: 2026-05-02T192156-review-this
  state: needs_auth
  reason: login_page_detected
  profile: shared
  profile_path: ~/.agents/skills/ask-pro/browser-profile
  chrome: launched
  language: "en-US,en"
  action: human_login_then_resume
  resume: "ask-pro --resume 2026-05-02T192156-review-this"
```

When known, status records may include `profile`, `profile_path`, `chrome`,
`language`, and `conversation_url`.

Generated response zips are harvested only for `--artifacts` /
`--response-zip` sessions. The wrapper does not ask for a zip by default. For
normal advisory runs, use `ask-pro --harvest <session-id>` to print the markdown
answer.

If a capture looks like a deferred-work preamble instead of a real answer,
`ask-pro` marks the session `INCOMPLETE_ANSWER` / `preamble_without_artifacts`.
Do not treat that as a completed consult. Try resume/harvest if recoverable;
otherwise rerun with `--no-temporary`, a tighter bundle, and a more direct
prompt.

During generation, `ask-pro` blocks browser input through CDP after submit so
accidental human input is less likely to activate ChatGPT's Stop control.

Useful advisory prompt starter:

```text
Return final markdown only. Do not answer with a preamble. Do not produce an implementation package. Rank findings by severity. Treat attached bundle as authoritative. Call out uncertainty.
```

## Sessions

Project-local session data lives in:

```text
.ask-pro/sessions/<session-id>/
```

Important files:

| File                            | Purpose                                            |
| ------------------------------- | -------------------------------------------------- |
| `PROMPT.md`                     | The prompt sent to ChatGPT Pro.                    |
| `MANIFEST.md` / `MANIFEST.json` | Context bundle inventory.                          |
| `CONTEXT.zip`                   | Redacted context uploaded to ChatGPT.              |
| `ANSWER.md`                     | Harvested markdown answer.                         |
| `browser.json`                  | Browser runtime metadata.                          |
| `status.json`                   | Session state and timestamps.                      |
| `downloads/`                    | Downloaded response zip, when ChatGPT exposes one. |
| `pro-output/`                   | Extracted generated response zip files.            |
| `PRO_OUTPUT_MANIFEST.json`      | Response zip status and extracted file metadata.   |

Generated session data is ignored by git.

## Response Zip

Markdown is the default output. If `--artifacts` / `--response-zip` is set and
the Pro answer exposes a `.zip` link, `ask-pro` downloads it in the browser
context, validates it, extracts it under `pro-output/`, and writes
`PRO_OUTPUT_MANIFEST.json`.

The expected generated zip contract is:

```text
IMPLEMENTATION_PLAN.md
TASKS.json
TEST_PLAN.md
RISK_REGISTER.md
FILES_TO_EDIT.md
REPO_CONTEXT_USED.md
```

`ask-pro` never executes generated zip contents.

## Validation

Fast local checks:

```bash
pnpm run build
pnpm run lint
pnpm run test:ask-pro
pnpm run format:check
pnpm pack --dry-run
```

Manual browser smokes are opt-in because they open a real ChatGPT session. See
`docs/manual-tests.md`.
