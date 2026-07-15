# Risk register

| Risk                                   | Control                                                                                                    |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| In-app Browser unavailable             | Stop; external fallback is disabled                                                                        |
| Login or CAPTCHA required              | Hand off the in-app tab to the user                                                                        |
| In-app Browser file upload unsupported | Embed bounded redacted evidence in `PROMPT.md`; keep `CONTEXT.zip` local only                              |
| Large direct composer fill is ignored  | Paste the complete `PROMPT.md` once through the in-app Browser clipboard and verify one `Pasted text` item |
| Prompt injection in repo files         | Redact first and label inline evidence as untrusted data                                                   |
| Prompt is too large                    | Fail above 500,000 bytes and narrow `--files`                                                              |
| Long Pro response interrupted          | Record the normal-chat conversation URL immediately                                                        |
| Incomplete answer harvested            | Require final assistant content and no active thinking state                                               |
| Pro advice is wrong                    | Root agent independently checks repo evidence and tests                                                    |
| User tabs are disrupted                | Create and close only a dedicated task tab                                                                 |
