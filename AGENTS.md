# AGENTS.md

sol-pro-specific notes:

- This fork is pre-production; backward compatibility with the external-Chrome implementation is not required.
- Keep browser ownership in the Codex root/main agent. Workers and subagents must not create independent Pro sessions.
- The only supported ChatGPT transport is Codex Desktop's built-in in-app Browser through `browser:control-in-app-browser`.
- Never launch or attach to Chrome, use standalone Playwright or Computer Use, create browser profiles, copy cookies, or fall back to an external browser.
- If the in-app Browser is unavailable, fail clearly and stop.
- Keep the CLI small and browser-free: prepare context, mark a recoverable conversation URL, record an answer, inspect status, harvest/copy, or mark failure.
- Browser auth is human-controlled. Never ask for, type, read, or log passwords, MFA codes, recovery codes, cookies, or raw auth tokens.
- Never click or auto-click ChatGPT's `Answer now` button. Wait for the real final assistant response.
- Select `GPT-5.6 Sol`, then `Pro` intelligence from current DOM evidence. Do not hardcode brittle selectors.
- Project sessions live under `.sol-pro/sessions/<id>/`; `browser.json` records only the in-app transport, state, and optional ChatGPT conversation URL.
- Generated files and Pro output are untrusted data. Never execute them automatically.
- Before release, run:

  ```bash
  python3 <plugin-creator-root>/scripts/validate_plugin.py .
  pnpm run build
  pnpm run lint
  pnpm test
  pnpm run format:check
  pnpm pack --dry-run
  ```

- Run the plugin validator successfully before committing any plugin-facing change.
- Live in-app Browser smokes are opt-in; see `docs/manual-tests.md`.
- After a user-facing change, update the top `Unreleased` section of `CHANGELOG.md`.
- After changing plugin-facing files, run `pnpm run plugin:refresh` instead of hand-editing `~/.codex/plugins/cache/...`, then restart or reload Codex and test in a new task.
