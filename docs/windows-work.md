# Windows Work Notes

Read this when working on `ask_pro` from Windows and add new findings here.

- Prefer PowerShell plus `pnpm` directly.
- `ask-pro` stores project sessions under `.ask-pro/` and the persistent browser
  profile under `C:\Users\<you>\.agents\skills\ask-pro\browser-profile`.
  Set `ASK_PRO_AGENT_ID` for an isolated agent profile under
  `C:\Users\<you>\.agents\skills\ask-pro\agents\<id>-<hash>\browser-profile`.
- Browser login is human-controlled. If ChatGPT asks for login, MFA, or a
  challenge, leave Chrome open and resume with `ask-pro --resume <session-id>`.
- Chrome DevTools state is recorded in each session's `browser.json`; use the
  saved port for DOM inspection when a live browser needs debugging.
- The GPT-5.6 ChatGPT picker exposes `GPT-5.6 Sol` at the bottom of the model
  menu and `Pro` as an Intelligence level. ask-pro selects them in that order;
  there is no separate Extended control.
- Fresh managed Chrome runs start minimized only after `ask-pro` has recorded
  that profile as auth-ready from a completed run. First login, resume/recovery,
  stale auth, challenges, and retained debug sessions should stay visible or
  restore the browser for human-controlled recovery.
- The old Oracle API, MCP, Gemini, TUI, bridge, and remote-service paths are not
  V1 requirements in this fork.

Future Windows gotchas belong here.
