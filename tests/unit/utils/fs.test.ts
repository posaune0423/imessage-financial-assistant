import { describe, expect, it } from "vitest";

import { loadTextFile } from "../../../src/utils/fs";

describe("loadTextFile", () => {
  it("reads and trims a text file", () => {
    const content = loadTextFile(new URL("../../../package.json", import.meta.url));
    expect(content).toContain('"name"');
  });

  it("throws for a non-existent file", () => {
    expect(() => loadTextFile("/tmp/__does_not_exist__.txt")).toThrow();
  });
});
