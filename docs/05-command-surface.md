# Command surface

The CLI prepares and records sessions. It never opens a browser.

```bash
sol-pro "<question>" --files src --files tests
sol-pro --prompt-file question.md --files "src/**"
sol-pro --artifacts --prompt-file question.md --files src
sol-pro --mark-submitted <session-id> --conversation-url https://chatgpt.com/c/<id>
sol-pro --record <session-id> --answer-file .sol-pro/sessions/<id>/ANSWER.import.md
sol-pro --status [session-id]
sol-pro --harvest [session-id]
sol-pro --copy [session-id]
sol-pro --fail <session-id> --reason "<reason>"
```

Fresh preparation returns compact TOON with `state: prepared`, `browser: codex_in_app_browser`, `prompt`, `context`, and the next recording commands.

The CLI has no Chrome, cookie, profile, CDP-connection, model-selection, login, submission, or waiting options.
