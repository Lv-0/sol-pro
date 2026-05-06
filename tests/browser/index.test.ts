import { describe, expect, test, vi } from "vitest";
import {
  __test__,
  runSubmissionWithRecoveryForTest,
  shouldPreserveBrowserOnErrorForTest,
} from "../../src/browser/index.js";
import { BrowserAutomationError } from "../../src/browser/errors.js";

describe("shouldPreserveBrowserOnErrorForTest", () => {
  test("preserves the browser for headful cloudflare challenge errors", () => {
    const error = new BrowserAutomationError("Cloudflare challenge detected.", {
      stage: "cloudflare-challenge",
    });
    expect(shouldPreserveBrowserOnErrorForTest(error, false)).toBe(true);
  });

  test("does not preserve the browser for headless cloudflare challenge errors", () => {
    const error = new BrowserAutomationError("Cloudflare challenge detected.", {
      stage: "cloudflare-challenge",
    });
    expect(shouldPreserveBrowserOnErrorForTest(error, true)).toBe(false);
  });

  test("preserves the browser for headful login-required recovery errors", () => {
    const error = new BrowserAutomationError("Login required.", {
      stage: "login-required",
    });
    expect(shouldPreserveBrowserOnErrorForTest(error, false)).toBe(true);
  });

  test("does not preserve the browser for unrelated browser errors", () => {
    const error = new BrowserAutomationError("other browser error", {
      stage: "execute-browser",
    });
    expect(shouldPreserveBrowserOnErrorForTest(error, false)).toBe(false);
  });
});

describe("runSubmissionWithRecoveryForTest", () => {
  test("preserves prompt-too-large fallback after a dead-composer retry", async () => {
    const submit = vi
      .fn()
      .mockRejectedValueOnce(new BrowserAutomationError("dead composer", { code: "dead-composer" }))
      .mockRejectedValueOnce(
        new BrowserAutomationError("prompt too large", { code: "prompt-too-large" }),
      )
      .mockResolvedValueOnce({
        baselineTurns: 7,
        baselineAssistantText: "done",
      });
    const reloadPromptComposer = vi.fn().mockResolvedValue(undefined);
    const prepareFallbackSubmission = vi.fn().mockResolvedValue(undefined);
    const logger: (message: string) => void = vi.fn();

    await expect(
      runSubmissionWithRecoveryForTest({
        prompt: "inline prompt",
        attachments: [],
        fallbackSubmission: {
          prompt: "fallback prompt",
          attachments: [{ path: "/tmp/fallback.txt", displayPath: "fallback.txt", sizeBytes: 12 }],
        },
        submit,
        reloadPromptComposer,
        prepareFallbackSubmission,
        logger,
      }),
    ).resolves.toEqual({
      baselineTurns: 7,
      baselineAssistantText: "done",
    });

    expect(reloadPromptComposer).toHaveBeenCalledTimes(1);
    expect(prepareFallbackSubmission).toHaveBeenCalledTimes(1);
    expect(submit).toHaveBeenNthCalledWith(1, "inline prompt", []);
    expect(submit).toHaveBeenNthCalledWith(2, "inline prompt", []);
    expect(submit).toHaveBeenNthCalledWith(3, "fallback prompt", [
      expect.objectContaining({ displayPath: "fallback.txt" }),
    ]);
  });

  test("throws when prompt-too-large happens again after fallback", async () => {
    const submit = vi
      .fn()
      .mockRejectedValueOnce(
        new BrowserAutomationError("prompt too large", { code: "prompt-too-large" }),
      )
      .mockRejectedValueOnce(
        new BrowserAutomationError("prompt too large again", { code: "prompt-too-large" }),
      );

    await expect(
      runSubmissionWithRecoveryForTest({
        prompt: "inline prompt",
        attachments: [],
        fallbackSubmission: {
          prompt: "fallback prompt",
          attachments: [],
        },
        submit,
        reloadPromptComposer: vi.fn().mockResolvedValue(undefined),
        prepareFallbackSubmission: vi.fn().mockResolvedValue(undefined),
        logger: vi.fn<(message: string) => void>(),
      }),
    ).rejects.toThrow(/prompt too large again/i);
  });
});

describe("remote Chrome option warnings", () => {
  test("does not mark browser-chrome-path as ignored for attach-running", () => {
    expect(
      __test__.listIgnoredRemoteChromeFlags({
        attachRunning: true,
        chromePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      }),
    ).not.toContain("--browser-chrome-path");
  });

  test("marks browser-chrome-path as ignored for classic remote-chrome", () => {
    expect(
      __test__.listIgnoredRemoteChromeFlags({
        attachRunning: false,
        chromePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      }),
    ).toContain("--browser-chrome-path");
  });
});

describe("authenticated Chrome window parking", () => {
  test("does not park explicit hidden-window runs", () => {
    expect(__test__.shouldParkAuthenticatedChromeWindow({ hideWindow: true })).toBe(false);
  });

  test("does not park explicit existing-tab runs", () => {
    expect(__test__.shouldParkAuthenticatedChromeWindow({ browserTabRef: "current" })).toBe(false);
  });

  test("does not park reused retained Chrome runs", () => {
    expect(
      __test__.shouldParkAuthenticatedChromeWindow({ reusedChrome: true, platform: "win32" }),
    ).toBe(false);
  });

  test("does not park non-Windows Chrome runs", () => {
    expect(__test__.shouldParkAuthenticatedChromeWindow({ platform: "linux" })).toBe(false);
  });

  test("parks ordinary headed managed Chrome runs", () => {
    expect(__test__.shouldParkAuthenticatedChromeWindow({ platform: "win32" })).toBe(true);
  });
});

describe("post-submit input guard scope", () => {
  test("uses the guard for managed local Chrome", () => {
    expect(__test__.shouldEnablePostSubmitInputGuard({})).toBe(true);
  });

  test("skips the guard for remote Chrome", () => {
    expect(
      __test__.shouldEnablePostSubmitInputGuard({
        remoteChrome: { host: "127.0.0.1", port: 9222 },
      }),
    ).toBe(false);
  });

  test("skips the guard for user-managed local tabs", () => {
    expect(__test__.shouldEnablePostSubmitInputGuard({ browserTabRef: "current" })).toBe(false);
  });

  test("uses the guard for reused retained managed Chrome", () => {
    expect(__test__.shouldEnablePostSubmitInputGuard({ reusedChrome: true })).toBe(true);
  });
});

describe("human intervention detection", () => {
  test("detects login/challenge reasons from the page probe", async () => {
    const Runtime = {
      evaluate: vi.fn().mockResolvedValue({ result: { value: "browser_challenge" } }),
    };

    await expect(__test__.detectHumanInterventionReason(Runtime as never)).resolves.toBe(
      "browser_challenge",
    );
  });

  test("ignores empty page probe results", async () => {
    const Runtime = {
      evaluate: vi.fn().mockResolvedValue({ result: { value: null } }),
    };

    await expect(__test__.detectHumanInterventionReason(Runtime as never)).resolves.toBeNull();
  });

  test("does not scan the full transcript text for challenge words", async () => {
    const Runtime = {
      evaluate: vi.fn().mockResolvedValue({ result: { value: null } }),
    };

    await __test__.detectHumanInterventionReason(Runtime as never);

    expect(Runtime.evaluate.mock.calls[0]?.[0]?.expression).not.toContain(
      "document.body?.innerText",
    );
  });
});
