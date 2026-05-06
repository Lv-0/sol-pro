import type { BrowserLogger, ChromeClient } from "../types.js";

type InputWithIgnoreEvents = ChromeClient["Input"] & {
  setIgnoreInputEvents?: (params: { ignore: boolean }) => Promise<unknown>;
};

export interface PostSubmitInputGuard {
  enable: () => Promise<void>;
  disable: () => Promise<boolean>;
  readonly enabled: boolean;
}

export function createPostSubmitInputGuard(
  Input: ChromeClient["Input"],
  logger: BrowserLogger,
): PostSubmitInputGuard {
  const input = Input as InputWithIgnoreEvents;
  let enabled = false;

  const setIgnored = async (ignore: boolean): Promise<void> => {
    if (typeof input.setIgnoreInputEvents !== "function") {
      if (ignore) {
        logger(
          "[browser] CDP input guard unavailable; continuing with focus-only stop protection.",
        );
      }
      return;
    }
    await input.setIgnoreInputEvents({ ignore });
    enabled = ignore;
    logger(
      ignore
        ? "[browser] Enabled post-submit input guard"
        : "[browser] Disabled post-submit input guard",
    );
  };

  return {
    get enabled() {
      return enabled;
    },
    async enable() {
      if (enabled) return;
      try {
        await setIgnored(true);
      } catch (error) {
        enabled = false;
        logger(
          `[browser] Failed to enable post-submit input guard: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    },
    async disable() {
      if (!enabled) return true;
      let lastError: unknown;
      for (let attempt = 1; attempt <= 3; attempt += 1) {
        try {
          await setIgnored(false);
          return true;
        } catch (error) {
          lastError = error;
          if (attempt < 3) {
            await new Promise((resolve) => setTimeout(resolve, 100 * attempt));
          }
        }
      }
      logger(
        `[browser] Failed to disable post-submit input guard after retries: ${lastError instanceof Error ? lastError.message : String(lastError)}`,
      );
      return false;
    },
  };
}
