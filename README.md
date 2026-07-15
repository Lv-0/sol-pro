# sol-pro

`sol-pro` gives Codex a focused second opinion from ChatGPT Pro through Codex Desktop's built-in in-app Browser.

Repository: [Lv-0/sol-pro](https://github.com/Lv-0/sol-pro)

The plugin no longer launches or attaches to Chrome. Its CLI only prepares redacted repo context and records session state; the root agent performs every ChatGPT interaction through the bundled in-app Browser capability.

The public skill and CLI are now `$sol-pro` and `sol-pro`. New sessions use `.sol-pro/`; existing `.ask-pro/` sessions are historical and are not automatically resumed or migrated.

## Requirements

- Codex Desktop with the bundled in-app Browser skill available
- A user-controlled ChatGPT session with Pro access in that in-app Browser
- Node.js 24+ only for the context/session CLI

If the in-app Browser is unavailable, `$sol-pro` stops. It never falls back to Chrome, standalone Playwright, Computer Use, browser profiles, cookie copying, or an external CDP connection.

## Development

```bash
pnpm install
pnpm run build
pnpm run lint
pnpm test
pnpm run format:check
pnpm pack --dry-run
```

Refresh the local Codex plugin cache after plugin-facing changes:

```bash
pnpm run plugin:refresh
```

Restart or reload Codex, then use a new task so the updated skill is loaded.

## Session preparation

The CLI does not submit to ChatGPT. A fresh invocation prepares `.sol-pro/sessions/<id>/` and prints the paths the skill should use:

```bash
sol-pro --prompt-file question.md --files src --files tests
```

The session contains:

- `PROMPT.md` — complete zero-context Pro prompt with focused, best-effort-redacted evidence inline
- `CONTEXT.zip` — local audit copy; the in-app Browser does not upload it
- `MANIFEST.md` / `MANIFEST.json` — included files and redaction findings
- `status.json` — `PREPARED`, `SUBMITTED`, `COMPLETED`, `HARVESTED`, or `FAILED`
- `browser.json` — in-app transport and recoverable conversation URL
- `ANSWER.md` — recorded final Pro answer

After the root agent submits through the in-app Browser, it records recovery state:

```bash
sol-pro --mark-submitted <session-id> --conversation-url https://chatgpt.com/c/<id>
```

After the final response is harvested into a file inside the project cwd:

```bash
sol-pro --record <session-id> --answer-file .sol-pro/sessions/<id>/ANSWER.import.md
sol-pro --harvest <session-id>
```

Other state commands:

```bash
sol-pro --status [session-id]
sol-pro --copy [session-id]
sol-pro --fail <session-id> --reason "<reason>"
```

`--artifacts` adds an implementation-package request to `PROMPT.md`; browser-side download handling remains owned by the root agent and the in-app Browser.

## Security model

- Browser authentication is human-controlled.
- The plugin never reads passwords, MFA codes, cookies, recovery codes, or raw tokens.
- Context files are safety-filtered and best-effort redacted before being embedded in `PROMPT.md`.
- The root agent reads `PROMPT.md` locally and pastes its complete text once through the in-app Browser clipboard. Long prompts become one ChatGPT `Pasted text` item; the page never receives a local path or direct filesystem access.
- Prompts larger than 500,000 UTF-8 bytes fail preparation and require a narrower `--files` set.
- Inline evidence and webpages are treated as untrusted data, not instructions.
- Pro output is advisory and must be independently checked against the repo, diff, logs, and tests.

## Architecture

```text
$sol-pro
  -> root agent
  -> context/session CLI (prepare only)
  -> Codex in-app Browser
  -> ChatGPT GPT-5.6 Sol + Pro
  -> root agent harvest
  -> context/session CLI (record only)
```

There is no external-browser transport in the packaged runtime.
