import { mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { describe, expect, it } from "vitest";

import { acquireProcessLock } from "../../src/utils/process-lock";

describe("process lock", () => {
  it("acquires and releases a new lock file", () => {
    const dir = mkdtempSync(join(tmpdir(), "imessage-agent-lock-"));
    const lockPath = join(dir, "agent.lock");

    const release = acquireProcessLock(lockPath);

    expect(() => acquireProcessLock(lockPath)).toThrow(/already running/);

    release();
    expect(() => acquireProcessLock(lockPath)).not.toThrow();
  });

  it("replaces a stale lock file", () => {
    const dir = mkdtempSync(join(tmpdir(), "imessage-agent-lock-"));
    const lockPath = join(dir, "agent.lock");
    writeFileSync(lockPath, "999999\n");

    expect(() => acquireProcessLock(lockPath)).not.toThrow();
  });
});
