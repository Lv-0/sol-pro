import { describe, expect, test, vi } from "vitest";
import { ensureNotBlocked } from "../../src/browser/pageActions.js";

describe("Cloudflare interstitial detection", () => {
  test("ignores a stale challenge script when the ChatGPT composer is visible", async () => {
    const Runtime = {
      evaluate: vi.fn().mockResolvedValue({
        result: {
          value: {
            title: "ChatGPT",
            hasPrompt: true,
            hasChallengeScript: true,
          },
        },
      }),
    };

    await expect(
      ensureNotBlocked(Runtime as never, false, vi.fn<(message: string) => void>()),
    ).resolves.toBeUndefined();
    expect(Runtime.evaluate.mock.calls[0]?.[0]?.expression).toContain("getClientRects");
  });

  test("blocks a challenge script when only a hidden composer remains", async () => {
    const Runtime = {
      evaluate: vi.fn().mockResolvedValue({
        result: {
          value: {
            title: "ChatGPT",
            hasPrompt: false,
            hasChallengeScript: true,
          },
        },
      }),
    };

    await expect(
      ensureNotBlocked(Runtime as never, false, vi.fn<(message: string) => void>()),
    ).rejects.toMatchObject({ details: { stage: "cloudflare-challenge" } });
  });

  test("still blocks a real challenge page without a composer", async () => {
    const Runtime = {
      evaluate: vi.fn().mockResolvedValue({
        result: {
          value: {
            title: "Just a moment...",
            hasPrompt: false,
            hasChallengeScript: true,
          },
        },
      }),
    };

    await expect(
      ensureNotBlocked(Runtime as never, false, vi.fn<(message: string) => void>()),
    ).rejects.toMatchObject({ details: { stage: "cloudflare-challenge" } });
  });

  test("ignores a stale challenge title after the composer becomes visible", async () => {
    const Runtime = {
      evaluate: vi.fn().mockResolvedValue({
        result: {
          value: {
            title: "Just a moment...",
            hasPrompt: true,
            hasChallengeScript: true,
          },
        },
      }),
    };

    await expect(
      ensureNotBlocked(Runtime as never, false, vi.fn<(message: string) => void>()),
    ).resolves.toBeUndefined();
  });
});
