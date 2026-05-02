import { describe, expect, test, vi } from "vitest";
import { __test__ } from "../../src/browser/actions/promptComposer.js";

describe("prompt composer actions", () => {
  test("moves focus away from the stop button after submit", async () => {
    const evaluate = vi.fn(async ({ expression }: { expression: string }) => {
      expect(expression).toContain("__ask_pro_focus_sink__");
      expect(expression).toContain("sink.focus({ preventScroll: true })");
      return { result: { value: { changed: true, stopFocused: false } } };
    });
    const logger = vi.fn();

    await __test__.defocusStopButtonAfterSubmit({ evaluate } as never, logger);

    expect(evaluate).toHaveBeenCalledTimes(1);
    expect(logger).toHaveBeenCalledWith("Moved focus away from ChatGPT stop button");
  });
});
