import { describe, expect, test, vi } from "vitest";
import {
  buildChromeLaunchFlags,
  buildChromeFlags,
  restoreChromeWindowByPid,
  shouldLaunchChromeMinimized,
} from "../../src/browser/chromeLifecycle.js";

describe("chrome lifecycle window restore", () => {
  test("uses a Windows pid fallback to restore retained Chrome windows", async () => {
    const execFileAsync = vi.fn().mockResolvedValue({ stdout: "", stderr: "" });
    const logger = vi.fn<(message: string) => void>();

    const restored = await restoreChromeWindowByPid(1234, logger, {
      platform: "win32",
      execFileAsync: execFileAsync as never,
    });

    expect(restored).toBe(true);
    expect(execFileAsync).toHaveBeenCalledWith(
      "powershell.exe",
      expect.arrayContaining(["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command"]),
      expect.objectContaining({ windowsHide: true, timeout: 5000 }),
    );
    const script = execFileAsync.mock.calls[0]?.[1]?.at(-1);
    expect(script).toContain("[uint32]1234");
    expect(script).toContain("ShowWindowAsync($hWnd, 9)");
    expect(logger).toHaveBeenCalledWith("[browser] Chrome window restored by pid fallback");
  });

  test("does not run the Windows restore fallback on other platforms", async () => {
    const execFileAsync = vi.fn();
    const logger = vi.fn<(message: string) => void>();

    const restored = await restoreChromeWindowByPid(1234, logger, {
      platform: "linux",
      execFileAsync: execFileAsync as never,
    });

    expect(restored).toBe(false);
    expect(execFileAsync).not.toHaveBeenCalled();
  });
});

describe("chrome lifecycle launch window state", () => {
  test("launches headed Chrome without automation-oriented default flags", () => {
    const flags = buildChromeLaunchFlags(buildChromeFlags(false, undefined, "en-US,en"));

    expect(flags).toContain("--no-first-run");
    expect(flags).toContain("--no-default-browser-check");
    expect(flags).not.toContain("--enable-automation");
    expect(flags).not.toContain("--test-type");
    expect(flags).not.toContain("--disable-extensions");
    expect(flags).not.toContain("--disable-sync");
    expect(flags).not.toContain("--mute-audio");
    expect(flags).not.toContain("--password-store=basic");
    expect(flags).not.toContain("--use-mock-keychain");
    expect(flags).not.toContain("--disable-backgrounding-occluded-windows");
    expect(flags).not.toContain("--disable-renderer-backgrounding");
    expect(flags).not.toContain("--disable-background-timer-throttling");
    expect(flags).not.toContain("--disable-ipc-flooding-protection");
  });

  test("keeps automation-oriented launch optimizations for headless Chrome", () => {
    const flags = buildChromeLaunchFlags(buildChromeFlags(true, undefined, "en-US,en"), {
      headless: true,
    });

    expect(flags).toContain("--headless=new");
    expect(flags).toContain("--disable-extensions");
    expect(flags).toContain("--disable-sync");
    expect(flags).toContain("--mute-audio");
    expect(flags).not.toContain("--enable-automation");
  });

  test("removes automation markers even if a launcher dependency adds them", () => {
    const flags = buildChromeLaunchFlags(["--enable-automation", "--test-type", "--lang=en-US"]);

    expect(flags).toEqual(["--lang=en-US"]);
  });

  test("adds start-minimized for headed Windows managed launches", () => {
    expect(buildChromeFlags(false, undefined, "en-US,en", { startMinimized: true })).toContain(
      "--start-minimized",
    );
  });

  test("does not add start-minimized for headless launches", () => {
    expect(buildChromeFlags(true, undefined, "en-US,en", { startMinimized: true })).not.toContain(
      "--start-minimized",
    );
  });

  test("starts minimized only for Windows managed local Chrome", () => {
    expect(
      shouldLaunchChromeMinimized(
        {
          headless: false,
          hideWindow: false,
          startMinimized: true,
          browserTabRef: null,
          remoteChrome: null,
        },
        "win32",
      ),
    ).toBe(true);
    expect(
      shouldLaunchChromeMinimized(
        {
          headless: false,
          hideWindow: false,
          startMinimized: true,
          browserTabRef: "current",
          remoteChrome: null,
        },
        "win32",
      ),
    ).toBe(false);
    expect(
      shouldLaunchChromeMinimized(
        {
          headless: false,
          hideWindow: false,
          startMinimized: true,
          browserTabRef: null,
          remoteChrome: null,
        },
        "linux",
      ),
    ).toBe(false);
  });

  test("does not start minimized unless the caller has opted in", () => {
    expect(
      shouldLaunchChromeMinimized(
        {
          headless: false,
          hideWindow: false,
          startMinimized: false,
          browserTabRef: null,
          remoteChrome: null,
        },
        "win32",
      ),
    ).toBe(false);
  });
});
