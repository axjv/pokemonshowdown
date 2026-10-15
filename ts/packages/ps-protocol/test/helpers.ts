import { readFileSync } from "node:fs";

/** Shared-fixture loader: repo-root `fixtures/` relative to this package. */
export function loadFixture(rel: string): string {
  return readFileSync(new URL(`../../../../fixtures/${rel}`, import.meta.url), "utf8");
}
