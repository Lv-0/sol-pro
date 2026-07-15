# Changelog

## 0.2.0 - Unreleased

### Changed

- Rename the plugin, skill, CLI, telemetry, package, and session paths from `ask-pro` to `sol-pro`. Existing `.ask-pro` sessions remain historical and are not resumed or migrated by `sol-pro`.
- Replace the removed self-launched Chrome/CDP transport with Codex Desktop's built-in in-app Browser. The CLI now only prepares redacted context and records session, conversation, and answer state; it never opens a browser.
- Remove Chrome launch, browser profiles, cookie copying, reattach, external CDP runtime, and their dependencies and tests. Missing in-app Browser capability fails closed with no external fallback.
- Add `--mark-submitted`, `--record`, and `--fail` for host-browser session bookkeeping.
- Embed bounded, best-effort-redacted evidence in `PROMPT.md`; `CONTEXT.zip` remains a local audit artifact because the in-app Browser cannot upload local files.
- Transfer the complete prepared prompt once through the in-app Browser clipboard. Long text is verified as one ChatGPT `Pasted text` item rather than a filesystem attachment.
- Select `GPT-5.6 Sol`, then `Pro` intelligence in ChatGPT, and remove obsolete Chrome/model-effort CLI options.
- Make the root/main agent the only owner of Browser submission and harvesting; workers reuse its recorded result.

### Added

- Add browser-free session commands for preparation, status, submission recording, answer recording, harvesting, copying, and explicit failure.
- Add an automated package-manifest regression test that rejects removed external-browser runtime files.
- Add live in-app Browser smoke coverage for signed-in submission, long pasted-text transfer, conversation URL recording, and answer harvesting.

### Security

- Keep authentication human-controlled and never read or store passwords, MFA codes, cookies, recovery codes, or raw tokens.
- Treat repository evidence, webpages, and Pro output as untrusted data rather than instructions.
- Reject answer imports outside the project root and non-ChatGPT conversation URLs.

## Historical development notes

Pre-0.2.0 unreleased V0/V1 experiments used managed Chrome, browser profiles, cookie helpers, and CDP automation. Those paths were removed before 0.2.0 and are not supported architecture.
