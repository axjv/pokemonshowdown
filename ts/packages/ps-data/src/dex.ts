import { toID } from "ps-protocol";

/**
 * Read-only Pokémon dex loaded from the `ps-client-dex/1` JSON produced by
 * `Tools/dexextract`. Keys are `toID` strings; entries carry display names.
 * Mirrors the Swift `Dex`.
 */
export interface DexTypeEffectiveness {
  efficacy: Record<string, number>;
}

export interface DexSpecies {
  num?: number;
  name: string;
  types: string[];
  baseStats?: Record<string, number>;
}

export interface DexMove {
  name: string;
  type?: string;
  basePower?: number;
  category?: string;
  pp?: number;
  priority?: number;
}

export interface DexNamed {
  name: string;
}

export interface Dex {
  format: string;
  fetched?: string;
  types: string[];
  typechart: Record<string, DexTypeEffectiveness>;
  pokemon: Record<string, DexSpecies>;
  moves: Record<string, DexMove>;
  abilities: Record<string, DexNamed>;
  items: Record<string, DexNamed>;
  natures: string[];
}

/** Parse dex JSON; throws on a wrong/missing format tag. */
export function parseDex(json: string): Dex {
  const parsed = JSON.parse(json) as Partial<Dex>;
  if (parsed.format !== "ps-client-dex/1") {
    throw new Error(`unrecognized dex format: ${String(parsed.format)}`);
  }
  return {
    format: parsed.format,
    fetched: parsed.fetched,
    types: parsed.types ?? [],
    typechart: parsed.typechart ?? {},
    pokemon: parsed.pokemon ?? {},
    moves: parsed.moves ?? {},
    abilities: parsed.abilities ?? {},
    items: parsed.items ?? {},
    natures: parsed.natures ?? [],
  };
}

export function dexSpecies(dex: Dex, key: string): DexSpecies | undefined {
  return dex.pokemon[toID(key)];
}

export function dexMove(dex: Dex, key: string): DexMove | undefined {
  return dex.moves[toID(key)];
}

export function dexAbility(dex: Dex, key: string): DexNamed | undefined {
  return dex.abilities[toID(key)];
}

export function dexItem(dex: Dex, key: string): DexNamed | undefined {
  return dex.items[toID(key)];
}

/** Damage multiplier of `attack` against `defense` (multi-type aware). */
export function dexEffectiveness(dex: Dex, attack: string, defense: string[]): number {
  return defense.reduce(
    (total, defender) => total * (dex.typechart[attack]?.efficacy[defender] ?? 1),
    1,
  );
}

/**
 * Where the desktop app finds the shared dex JSON. The canonical copy lives
 * next to the Swift package (single file, both languages read it); the
 * Electron main process reads this and hands the text to the renderer.
 */
export const DEX_RESOURCE_RELPATH = "Packages/PSData/Sources/PSData/Resources/dex/dex.json";
