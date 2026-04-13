import { mkdirSync, openSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

function isRunningPid(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return typeof error === "object" && error !== null && "code" in error && error.code === "EPERM";
  }
}

function readLockPid(lockPath: string): number | null {
  try {
    const pid = Number.parseInt(readFileSync(lockPath, "utf8").trim(), 10);
    return Number.isInteger(pid) && pid > 0 ? pid : null;
  } catch {
    return null;
  }
}

export function acquireProcessLock(lockPath: string) {
  mkdirSync(dirname(lockPath), { recursive: true });

  const tryAcquire = () => {
    const fd = openSync(lockPath, "wx");
    writeFileSync(fd, `${process.pid}\n`);
    return () => rmSync(lockPath, { force: true });
  };

  try {
    return tryAcquire();
  } catch (error) {
    const code = typeof error === "object" && error !== null && "code" in error ? error.code : undefined;
    if (code !== "EEXIST") {
      throw error;
    }
  }

  const existingPid = readLockPid(lockPath);
  if (existingPid && isRunningPid(existingPid)) {
    throw new Error(
      `Another agent process is already running (pid=${existingPid}). Stop it before starting a new one.`,
    );
  }

  rmSync(lockPath, { force: true });
  return tryAcquire();
}
