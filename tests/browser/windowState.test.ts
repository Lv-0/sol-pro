import { describe, expect, test, vi } from "vitest";
import { setChromeWindowState } from "../../src/browser/actions/windowState.js";

describe("Chrome window state actions", () => {
  test("minimizes the current target window", async () => {
    const getWindowForTarget = vi.fn().mockResolvedValue({ windowId: 42 });
    const setWindowBounds = vi.fn().mockResolvedValue(undefined);
    const logger = vi.fn<(message: string) => void>();

    const result = await setChromeWindowState(
      { Browser: { getWindowForTarget, setWindowBounds } } as never,
      "minimized",
      logger,
      { targetId: "target-1", reason: "composer-ready" },
    );

    expect(result).toBe(true);
    expect(getWindowForTarget).toHaveBeenCalledWith({ targetId: "target-1" });
    expect(setWindowBounds).toHaveBeenCalledWith({
      windowId: 42,
      bounds: { windowState: "minimized" },
    });
    expect(logger).toHaveBeenCalledWith(
      "[browser] Chrome window parked (minimized) (composer-ready)",
    );
  });

  test("restores the current target window", async () => {
    const getWindowForTarget = vi.fn().mockResolvedValue({ windowId: 42 });
    const setWindowBounds = vi.fn().mockResolvedValue(undefined);
    const getTargetInfo = vi.fn().mockResolvedValue({ targetInfo: { targetId: "current-target" } });
    const logger = vi.fn<(message: string) => void>();

    await setChromeWindowState(
      { Browser: { getWindowForTarget, setWindowBounds }, Target: { getTargetInfo } } as never,
      "normal",
      logger,
      { reason: "manual-recovery" },
    );

    expect(getTargetInfo).toHaveBeenCalledWith({});
    expect(getWindowForTarget).toHaveBeenCalledWith({ targetId: "current-target" });
    expect(setWindowBounds).toHaveBeenCalledWith({
      windowId: 42,
      bounds: { windowState: "normal" },
    });
    expect(logger).toHaveBeenCalledWith("[browser] Chrome window restored (manual-recovery)");
  });

  test("returns false when Browser window APIs are unavailable", async () => {
    const logger = vi.fn<(message: string) => void>();

    const result = await setChromeWindowState({ Browser: {} } as never, "minimized", logger);

    expect(result).toBe(false);
    expect(logger).toHaveBeenCalledWith(
      "[browser] Chrome window parking unavailable in this DevTools session.",
    );
  });
});
