import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Owns the directory, not connections: restart/migration tests close those explicitly.
export function temporaryRepository() {
  const directory = mkdtempSync(join(tmpdir(), "caro-test-"));
  return {
    path: join(directory, "test.sqlite"),
    remove() { rmSync(directory, { recursive: true, force: true }); },
  };
}
