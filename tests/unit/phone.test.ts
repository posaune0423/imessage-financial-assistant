import { describe, expect, it } from "vitest";

import { normalizePhone, samePhone } from "../../src/utils/phone";

describe("phone utils", () => {
  it("normalizes phone formatting characters", () => {
    expect(normalizePhone("+81 (90) 1234-5678")).toBe("+819012345678");
  });

  it("compares equivalent phone strings", () => {
    expect(samePhone("+81 90-1234-5678", "+819012345678")).toBe(true);
  });

  it("matches local format numbers against international owner numbers", () => {
    expect(samePhone("090-1234-5678", "+819012345678")).toBe(true);
  });
});
