# Manual in-app Browser tests

These tests intentionally use the signed-in ChatGPT account and should run only when a live smoke is warranted.

## Preconditions

- Codex Desktop in-app Browser skill is available.
- The user is signed in to ChatGPT Pro in that in-app Browser.
- The inline prompt contains no credentials or unnecessary PHI/PII.

## Smoke

1. Run `sol-pro "Return exactly SOL_PRO_IAB_OK"` and confirm no browser process opens.
2. Invoke `browser:control-in-app-browser`, explicitly select the in-app Browser, and create a dedicated ChatGPT tab.
3. Select GPT-5.6 Sol and Pro from current DOM evidence.
4. Read the complete emitted `PROMPT.md` locally. Paste it once through the in-app Browser clipboard. For a long prompt, verify exactly one task-owned `Pasted text` item, add a short instruction in the composer, and confirm Send is enabled. For a short inline prompt, verify its beginning and end.
5. Submit it, wait for the real response, and never click `Answer now`.
6. Record the `/c/<id>` URL with `--mark-submitted`.
7. Save the final markdown inside the session, record it with `--record`, and verify `--harvest` prints it.
8. Finalize only the task-created tab.

## Failure cases

- Signed out: keep the in-app tab as a handoff and ask the user to sign in.
- CAPTCHA: follow the Browser skill's explicit confirmation rule.
- Missing Browser capability or unverifiable single-paste transfer: mark the session failed and stop; do not open Chrome.
