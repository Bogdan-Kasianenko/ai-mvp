import { readFileSync } from "node:fs";

// Use the shipped catalogue; expected prices remain literal assertions in tests.
const catalogue = JSON.parse(readFileSync(new URL("../../company.json", import.meta.url), "utf8"));

// Top-level overrides replace whole fields. Every caller receives an isolated copy.
export function createTestCompany(overrides = {}) {
  return structuredClone({ ...catalogue, ...overrides });
}
