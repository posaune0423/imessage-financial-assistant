import { readFileSync } from "node:fs";

export function loadTextFile(filePath: string | URL): string {
  return readFileSync(filePath, "utf8").trim();
}
