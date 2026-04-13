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

    expect(containsTradeConfirmation(`confirm ${code}`, code)).toBe(true);
    expect(containsTradeConfirmation(`execute ${code}`, code)).toBe(true);
    expect(containsTradeConfirmation(`don't confirm ${code}`, code)).toBe(false);
    expect(containsTradeConfirmation(`please execute ${code}`, code)).toBe(false);
    expect(containsTradeConfirmation("yes", code)).toBe(false);
    expect(containsTradeConfirmation(undefined, code)).toBe(false);
  });

  it("formats the execution instruction with the exact code", () => {
    expect(createTradeConfirmationMessage("Buy BTC.", "abcd1234")).toBe(
      'Buy BTC.\nTo execute, reply with "confirm abcd1234".',
    );
  });
});
