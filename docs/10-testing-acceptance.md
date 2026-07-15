# Testing and acceptance

Run:

```bash
pnpm run build
pnpm run lint
pnpm test
pnpm run format:check
pnpm pack --dry-run
```

The migration is accepted only when:

- runtime dependencies do not include `chrome-launcher`, `chrome-remote-interface`, cookie readers, or standalone browser drivers;
- the packaged runtime contains no external-browser implementation;
- fresh CLI use creates a `PREPARED` in-app session without starting a browser process;
- `$sol-pro` uses `browser:control-in-app-browser` and stops if it is unavailable;
- a live smoke can select GPT-5.6 Sol + Pro, read the complete inline `PROMPT.md` locally, paste it once through the in-app Browser clipboard, verify the inline prompt or single `Pasted text` item, submit, record the conversation URL, and harvest the answer;
- login and CAPTCHA handling stays user-controlled;
- task cleanup does not close unrelated user tabs.
