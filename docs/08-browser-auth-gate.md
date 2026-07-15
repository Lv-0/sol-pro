# In-app Browser auth gate

Authentication belongs to the user and the Codex in-app Browser.

- Never inspect browser storage, profiles, cookies, passwords, MFA codes, recovery codes, or raw tokens.
- If ChatGPT is signed out, keep the task tab as a handoff and ask the user to sign in there.
- Follow the Browser skill's confirmation and CAPTCHA rules.
- Resume only after the user confirms that the ChatGPT composer is visible.
- Record only the recoverable `https://chatgpt.com/c/<id>` URL; do not persist session material.

There is no Chrome or external-browser auth recovery path.
