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

describe("managed Chrome cleanup ownership", () => {
  test("closes Chrome only when this run launched it", () => {
    expect(
      __test__.shouldCloseManagedChromeOnCleanup({
        reusedChrome: false,
        keepBrowserOpen: false,
        connectionClosedUnexpectedly: false,
      }),
    ).toBe(true);
  });

  test("leaves reused shared Chrome running after closing the run tab", () => {
    expect(
      __test__.shouldCloseManagedChromeOnCleanup({
        reusedChrome: true,
        keepBrowserOpen: false,
        connectionClosedUnexpectedly: false,
      }),
    ).toBe(false);
  });

  test("does not close Chrome when retained or already disconnected", () => {
    expect(
      __test__.shouldCloseManagedChromeOnCleanup({
        keepBrowserOpen: true,
        connectionClosedUnexpectedly: false,
      }),
    ).toBe(false);
    expect(
      __test__.shouldCloseManagedChromeOnCleanup({
        keepBrowserOpen: false,
        connectionClosedUnexpectedly: true,
      }),
    ).toBe(false);
  });

  test("preserves live reused manual-login profile state", () => {
    expect(
      __test__.shouldCleanupManualLoginStateOnCleanup({
        reusedChrome: true,
        connectionClosedUnexpectedly: false,
      }),
    ).toBe(false);
    expect(
      __test__.shouldCleanupManualLoginStateOnCleanup({
        reusedChrome: true,
        connectionClosedUnexpectedly: true,
      }),
    ).toBe(true);
    expect(
      __test__.shouldCleanupManualLoginStateOnCleanup({
        reusedChrome: false,
        connectionClosedUnexpectedly: false,
      }),
    ).toBe(true);
  });

  test("captures launch cleanup targets only for temporary owned profiles", () => {
    expect(
      __test__.shouldCaptureLaunchTargetsForCleanup({
        manualLogin: false,
        reusedChrome: false,
      }),
    ).toBe(true);
    expect(
      __test__.shouldCaptureLaunchTargetsForCleanup({
        manualLogin: true,
        reusedChrome: false,
      }),
    ).toBe(false);
    expect(
      __test__.shouldCaptureLaunchTargetsForCleanup({
        manualLogin: false,
        reusedChrome: true,
      }),
    ).toBe(false);
  });
});

describe("launch tab cleanup", () => {
  test("selects only disposable launch page targets that are not the active run tab", () => {
    expect(
      __test__.selectDisposableLaunchTargetIds(
        [
          { id: "launch-blank", type: "page", url: "about:blank" },
          { id: "launch-newtab", type: "page", url: "chrome://newtab/" },
          { id: "launch-edge-newtab", type: "page", url: "edge://newtab/" },
          { id: "launch-brave-newtab", type: "page", url: "brave://newtab/" },
          { id: "launch-new-tab-page", type: "page", url: "chrome://new-tab-page/" },
          { targetId: "current", type: "page", url: "about:blank" },
          { targetId: "chat", type: "page", url: "https://chatgpt.com/c/abc" },
          { targetId: "worker", type: "service_worker", url: "about:blank" },
        ],
        "current",
      ),
    ).toEqual([
      "launch-blank",
      "launch-newtab",
      "launch-edge-newtab",
      "launch-brave-newtab",
      "launch-new-tab-page",
    ]);
  });

  test("ignores non-disposable and missing target ids", () => {
    expect(
      __test__.selectDisposableLaunchTargetIds([
        { type: "page", url: "about:blank" },
        { targetId: "settings", type: "page", url: "chrome://settings/" },
        { targetId: "chat", type: "page", url: "https://chatgpt.com/" },
      ]),
    ).toEqual([]);
  });

  test("closes only launch-owned targets that are still disposable", () => {
    expect(
      __test__.selectClosableLaunchTargetIds(
        ["launch-blank", "restored", "other-blank"],
        [
          { id: "launch-blank", type: "page", url: "about:blank" },
          { id: "restored", type: "page", url: "https://example.test/restored" },
          { id: "other-blank", type: "page", url: "about:blank" },
          { id: "new-blank", type: "page", url: "about:blank" },
        ],
        "other-blank",
      ),
    ).toEqual(["launch-blank"]);
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

describe("login recovery reveal hook", () => {
  test("calls auth-needed hook before non-manual login failures escape", async () => {
    const onAuthNeeded = vi.fn();
    const error = new Error("ChatGPT session not detected. Login button detected on page.");

    await expect(
      __test__.waitForLogin({
        runtime: {} as never,
        logger: vi.fn<(message: string) => void>(),
        appliedCookies: 0,
        manualLogin: false,
        timeoutMs: 1000,
        onAuthNeeded,
        ensureLoggedInFn: vi.fn().mockRejectedValue(error),
      }),
    ).rejects.toThrow(error);

    expect(onAuthNeeded).toHaveBeenCalledTimes(1);
  });

  test("keeps original non-manual login failure if auth-needed hook fails", async () => {
    const logger = vi.fn<(message: string) => void>();
    const error = new Error("ChatGPT session not detected. Login button detected on page.");

    await expect(
      __test__.waitForLogin({
        runtime: {} as never,
        logger,
        appliedCookies: 0,
        manualLogin: false,
        timeoutMs: 1000,
        onAuthNeeded: vi.fn().mockRejectedValue(new Error("restore failed")),
        ensureLoggedInFn: vi.fn().mockRejectedValue(error),
      }),
    ).rejects.toThrow(error);

    expect(logger).toHaveBeenCalledWith(
      "Failed to reveal browser for auth recovery: restore failed",
    );
  });

  test("reveals before manual-login auth blockers that are not login-button shaped", async () => {
    const onAuthNeeded = vi.fn();
    const error = new Error("Cloudflare challenge detected.");

    await expect(
      __test__.waitForLogin({
        runtime: {} as never,
        logger: vi.fn<(message: string) => void>(),
        appliedCookies: 0,
        manualLogin: true,
        timeoutMs: 1000,
        onAuthNeeded,
        ensureLoggedInFn: vi.fn().mockRejectedValue(error),
      }),
    ).rejects.toThrow(error);

    expect(onAuthNeeded).toHaveBeenCalledTimes(1);
  });

  test("continues manual-login polling if auth-needed reveal fails", async () => {
    const logger = vi.fn<(message: string) => void>();
    const loginMissing = new Error("ChatGPT session not detected. Login button detected on page.");
    const checkLogin = vi.fn().mockRejectedValueOnce(loginMissing).mockResolvedValueOnce(undefined);

    await expect(
      __test__.waitForLogin({
        runtime: {} as never,
        logger,
        appliedCookies: 0,
        manualLogin: true,
        timeoutMs: 3000,
        onAuthNeeded: vi.fn().mockRejectedValue(new Error("restore failed")),
        ensureLoggedInFn: checkLogin,
      }),
    ).resolves.toBeUndefined();

    expect(checkLogin).toHaveBeenCalledTimes(2);
    expect(logger).toHaveBeenCalledWith(
      "Failed to reveal browser for auth recovery: restore failed",
    );
  });
});
