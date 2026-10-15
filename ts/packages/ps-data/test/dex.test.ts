import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  DEX_RESOURCE_RELPATH,
  dexAbility,
  dexEffectiveness,
  dexItem,
  dexMove,
  dexSpecies,
  parseDex,
} from "../src/index";

function sampleDex() {
  const text = readFileSync(
    new URL("../../../../fixtures/dex/dex-sample.json", import.meta.url),
    "utf8",
  );
  return parseDex(text);
}

describe("Dex", () => {
  it("loads the fixture", () => {
    const dex = sampleDex();
    expect(dex.format).toBe("ps-client-dex/1");
    expect(Object.keys(dex.pokemon)).toHaveLength(9);
    expect(dexSpecies(dex, "articuno")?.name).toBe("Articuno");
    expect(dexSpecies(dex, "Great Tusk")?.num).toBe(984); // display name lookup
    expect(dexMove(dex, "Ice Beam")?.basePower).toBe(90);
    expect(dexMove(dex, "icebeam")?.category).toBe("Special");
    expect(dexItem(dex, "leftovers")?.name).toBe("Leftovers");
    expect(dexAbility(dex, "swiftswim")?.name).toBe("Swift Swim");
  });

  it("computes type effectiveness", () => {
    const dex = sampleDex();
    expect(dexEffectiveness(dex, "Electric", ["Ground"])).toBe(0);
    expect(dexEffectiveness(dex, "Electric", ["Flying"])).toBe(2);
    expect(dexEffectiveness(dex, "Electric", ["Grass"])).toBe(0.5);
    // Ice vs Ice/Flying: 0.5 (resisted by Ice) * 2 (weak to Flying) = 1
    expect(dexEffectiveness(dex, "Ice", ["Ice", "Flying"])).toBe(1);
    // Ground vs Water/Ground: 2 * 1 (Ground hitting Ground is neutral) = 2
    expect(dexEffectiveness(dex, "Ground", ["Water", "Ground"])).toBe(2);
    // Unknown attacker or defender defaults to neutral.
    expect(dexEffectiveness(dex, "Bug", ["Stellar"])).toBe(1);
  });

  it("rejects a mismatched format tag", () => {
    expect(() => parseDex('{"format":"other"}')).toThrow(/unrecognized dex format/);
  });

  it("the shared full-path dex exists and loads", () => {
    // The single canonical dex file both languages read (Swift bundle copy
    // comes from this path at build time).
    const repoRoot = new URL("../../../../", import.meta.url);
    const dex = parseDex(readFileSync(new URL(DEX_RESOURCE_RELPATH, repoRoot), "utf8"));
    expect(Object.keys(dex.pokemon).length).toBeGreaterThanOrEqual(9);
    expect(dexSpecies(dex, "articuno")).toBeDefined();
  });
});
