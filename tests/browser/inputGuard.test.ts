import { describe, expect, test, vi } from "vitest";
import { createPostSubmitInputGuard } from "../../src/browser/actions/inputGuard.js";

describe("post-submit input guard", () => {
  test("enables and disables CDP input ignore once", async () => {
    const setIgnoreInputEvents = vi.fn().mockResolvedValue(undefined);
    const logger = vi.fn<(message: string) => void>();
    const guard = createPostSubmitInputGuard({ setIgnoreInputEvents } as never, logger);

    await guard.enable();
    await guard.enable();
    expect(guard.enabled).toBe(true);

    await guard.disable();
    await guard.disable();

    expect(setIgnoreInputEvents).toHaveBeenCalledTimes(2);
    expect(setIgnoreInputEvents).toHaveBeenNthCalledWith(1, { ignore: true });
    expect(setIgnoreInputEvents).toHaveBeenNthCalledWith(2, { ignore: false });
    expect(guard.enabled).toBe(false);
  });

  test("falls back cleanly when CDP input ignore is unavailable", async () => {
    const logger = vi.fn<(message: string) => void>();
    const guard = createPostSubmitInputGuard({} as never, logger);

    await guard.enable();
    await guard.disable();

    expect(guard.enabled).toBe(false);
    expect(logger).toHaveBeenCalledWith(
      "[browser] CDP input guard unavailable; continuing with focus-only stop protection.",
    );
  });

  test("keeps guard logically enabled if disable keeps failing", async () => {
    const setIgnoreInputEvents = vi
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValue(new Error("cdp gone"));
    const logger = vi.fn<(message: string) => void>();
    const guard = createPostSubmitInputGuard({ setIgnoreInputEvents } as never, logger);

    await guard.enable();
    const disabled = await guard.disable();

    expect(disabled).toBe(false);
    expect(guard.enabled).toBe(true);
    expect(setIgnoreInputEvents).toHaveBeenCalledTimes(4);
    expect(logger).toHaveBeenCalledWith(
      "[browser] Failed to disable post-submit input guard after retries: cdp gone",
    );
  });

  test("retries disable before clearing guard state", async () => {
    const setIgnoreInputEvents = vi
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("transient"))
      .mockResolvedValueOnce(undefined);
    const logger = vi.fn<(message: string) => void>();
    const guard = createPostSubmitInputGuard({ setIgnoreInputEvents } as never, logger);

    await guard.enable();
    const disabled = await guard.disable();

    expect(disabled).toBe(true);
    expect(guard.enabled).toBe(false);
    expect(setIgnoreInputEvents).toHaveBeenNthCalledWith(2, { ignore: false });
    expect(setIgnoreInputEvents).toHaveBeenNthCalledWith(3, { ignore: false });
  });

  test("does not fail the run if enabling input ignore fails", async () => {
    const setIgnoreInputEvents = vi.fn().mockRejectedValueOnce(new Error("unsupported"));
    const logger = vi.fn<(message: string) => void>();
    const guard = createPostSubmitInputGuard({ setIgnoreInputEvents } as never, logger);

    await guard.enable();

    expect(guard.enabled).toBe(false);
    expect(logger).toHaveBeenCalledWith(
      "[browser] Failed to enable post-submit input guard: unsupported",
    );
  });
});
