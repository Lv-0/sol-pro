# Naming and command surface

## Names

Use exactly:

```text
Repo/package: ask_pro
CLI binary:   ask-pro
Agent skill:  $ask-pro
Project dir:  .ask-pro/
Global dir:   ~/.agents/skills/ask-pro/
```

Agent-specific browser profiles:

```bash
ASK_PRO_AGENT_ID=review-t1 ask-pro "<question>"
```

This stores the persistent browser profile under
`~/.agents/skills/ask-pro/agents/review-t1-<hash>/browser-profile`.

`ASK_PRO_AGENT_ID` must be lowercase and may contain only letters, numbers,
`.`, `_`, or `-`.

Leave `ASK_PRO_AGENT_ID` unset for normal single-agent use. Set it only for
concurrent or role-specific agents that need isolated browser profiles, and
reuse stable ids. One-off ids create new Chrome profiles and may require a fresh
human login.

## Avoid

Do not use:

```text
ask-smart-guy
smart-guy
consult
oracle-review
guru
wizard
brain
```

## CLI command surface

V1 commands:

```bash
ask-pro "<question>"
ask-pro --dry-run "<question>"
ask-pro --prompt-file <path>
ask-pro --artifacts --prompt-file <path>
ask-pro --resume [session-id]
ask-pro --status [session-id]
ask-pro --harvest [session-id]
ask-pro --copy [session-id]
ask-pro --extended "<question>"
ask-pro --temporary "<question>"
ask-pro --no-temporary --resume [session-id]
```

Optional file flags:

```bash
ask-pro --files "src/**" --files "prisma/**" "<question>"
```

Use `--prompt-file <path>` for multiline prompts; `--prompt-file -` reads stdin.
`--prompt-file -` reads stdin and fails fast if stdin is interactive. `--files`
accepts files, directories, and globs. Windows absolute paths inside the project
cwd and backslash paths are normalized to relative POSIX manifest paths. Prefer
`--cwd <repo-root>` plus repo-relative `--files` for cross-repo work.

Do not expose broad model/preset complexity in the normal path. `--extended` is
the single explicit long-thinking opt-in for hard architecture, production-risk,
and implementation-plan package questions where a multi-hour wait is acceptable.
Fresh runs try Temporary Chat by default and automatically retry in normal
ChatGPT if the current account hides Pro models there. `--temporary` makes
Temporary Chat strict and disables that fallback; `--no-temporary` starts or
resumes the session in normal ChatGPT.

## Default behavior

`ask-pro "<question>"` should:

1. create a new session
2. collect focused context
3. write/accept prompt
4. open or attach to ChatGPT browser
5. start in Temporary Chat unless `--no-temporary` is set
6. fall back to normal ChatGPT if the default Temporary Chat path hides Pro
7. select best Pro target if possible
8. select normal Pro thinking effort, or Extended when `--extended` is set
9. upload context
10. submit
11. wait/heartbeat/status
12. harvest markdown
13. download generated zip if available

## Output contract

`ask-pro` is agent-only. Normal stdout is compact TOON-style telemetry. Browser
progress, waiting heartbeats, and verbose diagnostics go to stderr and the
session log. `--harvest` prints raw `ANSWER.md` so the Pro answer can be piped
or read without a wrapper.

The wrapper prompt does not request generated response zips by default. Agents
should pass `--artifacts` / `--response-zip` only when the task needs an
implementation bundle.

Status/create/auth/error records should stay tiny and action-oriented:

```toon
ask_pro
  session: 2026-05-01-billing-webhook
  state: waiting
  thinking: standard
  temporary: default
  action: wait
  resume: "ask-pro --resume 2026-05-01-billing-webhook"
```

Auth-needed records:

```toon
ask_pro
  session: 2026-05-01-billing-webhook
  state: needs_auth
  reason: login_page_detected
  profile: shared
  profile_path: ~/.agents/skills/ask-pro/browser-profile
  chrome: launched
  language: "en-US,en"
  action: human_login_then_resume
  resume: "ask-pro --resume 2026-05-01-billing-webhook"
```

When known, status records include compact browser preflight fields:
`profile` (`shared`, `agent`, or `legacy`), `profile_path`, `chrome`, and
`language`. Keep deeper browser diagnostics in stderr/session logs, not stdout.

Errors are structured on stdout with a non-zero exit:

```toon
ask_pro_error
  code: browser_failed
  message: "Unable to locate the ChatGPT model selector button"
  action: inspect_session
```

Do not print human prose such as:

```text
Asking the smart guy...
Consulting the guru...
Opening ChatGPT Pro. Waiting...
```
