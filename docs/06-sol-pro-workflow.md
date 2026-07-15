# Workflow

1. The root agent inspects the repo and writes a zero-context question.
2. The CLI creates a focused, best-effort-redacted inline `PROMPT.md`, a local audit `CONTEXT.zip`, and a `PREPARED` session.
3. The root agent invokes `browser:control-in-app-browser`, explicitly selects the in-app Browser, and opens a dedicated ChatGPT tab.
4. The root agent selects GPT-5.6 Sol and Pro, reads `PROMPT.md` locally, pastes its complete text once through the in-app Browser clipboard, verifies the inline prompt or single ChatGPT `Pasted text` item, submits it, and records the `/c/<id>` URL.
5. The root agent waits for the real final response without clicking `Answer now`.
6. The root agent validates and records the answer, then harvests `ANSWER.md`.
7. The root agent closes only the task-created tab.

If the in-app Browser is missing, signed out, blocked, or cannot accept the prepared prompt, stop with a clear reason. Never launch another browser.
