# Session layout

```text
.sol-pro/sessions/<id>/
  PROMPT.md
  MANIFEST.md
  MANIFEST.json
  CONTEXT.zip
  ANSWER.md
  browser.json
  status.json
  log.txt
```

`PROMPT.md` is the only ChatGPT transport artifact and contains bounded redacted evidence inline. The root agent reads it through the local runtime and pastes its complete text once through the in-app Browser clipboard. A long prompt becomes one ChatGPT `Pasted text` item; a short prompt may remain inline. The page does not receive a local path. `CONTEXT.zip` stays local as an audit copy because the in-app Browser cannot upload local files.

`browser.json` contains only:

```json
{
  "schemaVersion": 1,
  "transport": "codex_in_app_browser",
  "status": "submitted",
  "conversationUrl": "https://chatgpt.com/c/<id>"
}
```

`status.json` uses `PREPARED`, `SUBMITTED`, `WAITING`, `COMPLETED`, `HARVESTED`, or `FAILED`. Sessions are not auto-deleted.
