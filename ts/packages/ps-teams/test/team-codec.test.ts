import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  exportTeam,
  exportToJSON,
  importFromJSON,
  importTeam,
  newSet,
  packTeam,
  perfectIVs,
  statsFromOrdered,
  unpackTeam,
} from "../src/index";

/**
 * Loads the shared team fixtures (fixtures/teams/) that the Swift
 * `PSTeamsTests` suite asserts against too — identical expectations both sides.
 */
function fixture(name: string): string {
  return readFileSync(new URL(`../../../../fixtures/teams/${name}`, import.meta.url), "utf8");
}

describe("team export format", () => {
  it("imports the articuno fixture", () => {
    const sets = importTeam(fixture("articuno.export.txt"));
    expect(sets).toHaveLength(6);

    const articuno = sets[0]!;
    expect(articuno.species).toBe("Articuno");
    expect(articuno.name).toBe("");
    expect(articuno.item).toBe("Leftovers");
    expect(articuno.ability).toBe("Pressure");
    expect(articuno.nature).toBe("Modest");
    expect(articuno.evs).toEqual(statsFromOrdered([252, 0, 0, 252, 4, 0]));
    expect(articuno.ivs).toEqual(statsFromOrdered([31, 31, 31, 30, 30, 31]));
    expect(articuno.moves).toEqual(["Ice Beam", "Hurricane", "Substitute", "Roost"]);

    const volbeat = sets[2]!;
    expect(volbeat.gender).toBe("M");
    expect(volbeat.item).toBe("Damp Rock");
  });

  it("re-exporting reproduces the fixture modulo markdown trailing spaces", () => {
    const reExported = exportTeam(importTeam(fixture("articuno.export.txt")))
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line !== "");
    const original = fixture("articuno.export.txt")
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line !== "");
    expect(reExported).toEqual(original);
  });

  it("round-trips export → import → export", () => {
    const sets = importTeam(fixture("articuno.export.txt"));
    expect(importTeam(exportTeam(sets))).toEqual(sets);
  });
});

describe("JSON team format", () => {
  it("the JSON fixture matches the export parse", () => {
    const sets = importFromJSON(fixture("articuno.json"));
    expect(sets).not.toBeNull();
    expect(sets).toEqual(importTeam(fixture("articuno.export.txt")));
  });

  it("round-trips through JSON", () => {
    const sets = importTeam(fixture("articuno.export.txt"));
    expect(importFromJSON(exportToJSON(sets))).toEqual(sets);
  });

  it("applies PS defaults to omitted fields", () => {
    const [set] = importFromJSON('[{"species":"Ditto","moves":["Transform"]}]')!;
    expect(set.ivs).toEqual(perfectIVs());
    expect(set.level).toBeUndefined();
    expect(set.shiny).toBe(false);
  });

  it("returns null on garbage", () => {
    expect(importFromJSON("<html>")).toBeNull();
    expect(importFromJSON("{}")).toBeNull();
  });
});

describe("packed format", () => {
  it("packs to the shared packed fixture", () => {
    const packed = fixture("articuno.packed.txt").trim();
    expect(packTeam(importTeam(fixture("articuno.export.txt")))).toBe(packed);
    expect(packTeam(importFromJSON(fixture("articuno.json"))!)).toBe(packed);
  });

  it("unpack → repack is byte-identical", () => {
    const packed = fixture("articuno.packed.txt").trim();
    const sets = unpackTeam(packed);
    expect(sets).toHaveLength(6);
    expect(packTeam(sets)).toBe(packed);

    const articuno = sets[0]!;
    expect(articuno.species).toBe("Articuno");
    expect(articuno.moves).toEqual(["icebeam", "hurricane", "substitute", "roost"]);
    expect(articuno.ivs).toEqual(statsFromOrdered([31, 31, 31, 30, 30, 31]));
    expect(articuno.nature).toBe("Modest");
  });

  it("packs edge-case fields (shiny/level/HP/gmax/dmax/tera/ball)", () => {
    const set = {
      ...newSet(),
      name: "Sparky",
      species: "Pikachu",
      gender: "M",
      shiny: true,
      level: 50,
      happiness: 100,
      pokeball: "cherishball",
      hiddenPower: "Fire",
      gigantamax: true,
      dynamaxLevel: 5,
      teraType: "Flying",
      evs: statsFromOrdered([252, 0, 0, 0, 0, 252]),
      ivs: statsFromOrdered([31, 0, 31, 31, 31, 31]),
      nature: "Timid",
      item: "Light Ball",
      ability: "Static",
      moves: ["Volt Tackle", "Quick Attack"],
    };

    const packed = packTeam([set]);
    expect(packed).toBe(
      "Sparky|pikachu|lightball|static|volttackle,quickattack|Timid|252,,,,,252|M|,0,,,,|S|50|100,cherishball,Fire,G,5,Flying",
    );

    const back = unpackTeam(packed);
    // unpack returns dex IDs (not display names) for species/item/ability/moves.
    expect(back).toEqual([
      {
        ...set,
        species: "pikachu",
        item: "lightball",
        ability: "static",
        moves: ["volttackle", "quickattack"],
      },
    ]);
  });

  it("leaves default values blank", () => {
    const set = { ...newSet(), species: "Ditto", moves: ["Transform"] };
    // Level 100 / happiness 255 / IVs 31 / EVs 0 / no gender → all blank.
    expect(packTeam([set])).toBe("Ditto||||transform|||||||");
  });
});
