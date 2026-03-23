import { describe, expect, it } from "vitest";

import {
  buildTradeConfirmationCode,
  containsTradeConfirmation,
  createTradeConfirmationMessage,
} from "../../../../src/domain/trading/confirmation";

describe("trade confirmation helpers", () => {
  it("builds a stable confirmation code from normalized inputs", () => {
    const left = buildTradeConfirmationCode([" BTC ", "BUY", "0.01", "95000"]);
    const right = buildTradeConfirmationCode(["btc", "buy", "0.01", "95000"]);

    expect(left).toBe(right);
    expect(left).toHaveLength(8);
  });

  it("matches explicit confirmation phrases but rejects vague confirmations", () => {
    const code = buildTradeConfirmationCode(["btc", "buy", "0.01"]);

    expect(containsTradeConfirmation(`注文実行 ${code}`, code)).toBe(true);
    expect(containsTradeConfirmation(`confirm ${code}`, code)).toBe(true);
    expect(containsTradeConfirmation("はい", code)).toBe(false);
    expect(containsTradeConfirmation(undefined, code)).toBe(false);
  });

  it("formats the execution instruction with the exact code", () => {
    expect(createTradeConfirmationMessage("BTC を買います。", "abcd1234")).toBe(
      "BTC を買います。\n実行する場合は「注文実行 abcd1234」と送ってください。",
    );
  });
});
