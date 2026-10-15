/** The six stat buckets, in PS's canonical HP/Atk/Def/SpA/SpD/Spe order. */
export interface StatsValue {
  hp: number;
  atk: number;
  def: number;
  spa: number;
  spd: number;
  spe: number;
}

export const STAT_KEYS = ["hp", "atk", "def", "spa", "spd", "spe"] as const;
export type StatKey = (typeof STAT_KEYS)[number];

export const emptyStats = (): StatsValue => ({ hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 });
export const perfectIVs = (): StatsValue => ({ hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 });

export function statsToOrdered(stats: StatsValue): number[] {
  return STAT_KEYS.map((key) => stats[key]);
}

export function statsFromOrdered(ordered: number[]): StatsValue {
  if (ordered.length !== 6) throw new Error("expected six stats");
  const out = emptyStats();
  STAT_KEYS.forEach((key, i) => {
    out[key] = ordered[i] ?? 0;
  });
  return out;
}

/**
 * A Pokémon set — the JSON team format's unit (mirrors PS's `PokemonSet`).
 * Defaults match PS semantics: IVs default to 31, level to 100, happiness to
 * 255; empty string == "not specified" for item/ability/gender/nature.
 */
export interface PokemonSet {
  /** Nickname; empty means "use species name". */
  name: string;
  species: string;
  /** "M", "F", "N", or "" (unspecified). */
  gender: string;
  item: string;
  ability: string;
  evs: StatsValue;
  /** Nature display name, "" = none. */
  nature: string;
  ivs: StatsValue;
  shiny: boolean;
  /** undefined = 100. */
  level?: number;
  /** undefined = 255. */
  happiness?: number;
  pokeball: string;
  /** Hidden Power base type name ("" = none). */
  hiddenPower: string;
  gigantamax: boolean;
  /** undefined = 10. */
  dynamaxLevel?: number;
  teraType: string;
  /** Move display names. */
  moves: string[];
}

export function newSet(): PokemonSet {
  return {
    name: "",
    species: "",
    gender: "",
    item: "",
    ability: "",
    evs: emptyStats(),
    nature: "",
    ivs: perfectIVs(),
    shiny: false,
    pokeball: "",
    hiddenPower: "",
    gigantamax: false,
    teraType: "",
    moves: [],
  };
}

/* JSON normalization helpers: PS omits defaulted fields (`ivs` when all 31,
 * `level` when 100, …); these apply the same defaults, matching the Swift
 * `PokemonSet` Codable init. */

function str(raw: Record<string, unknown>, key: string): string {
  const value = raw[key];
  return typeof value === "string" ? value : "";
}

function optInt(raw: Record<string, unknown>, key: string): number | undefined {
  const value = raw[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function statsFromJSONRaw(raw: unknown, missingDefault: number): StatsValue {
  const obj = (raw ?? {}) as Record<string, unknown>;
  const out = emptyStats();
  for (const key of STAT_KEYS) {
    const value = obj[key];
    out[key] = typeof value === "number" && Number.isFinite(value) ? value : missingDefault;
  }
  return out;
}

/** Normalize one raw JSON team entry into a fully-defaulted `PokemonSet`. */
export function setFromJSON(raw: unknown): PokemonSet {
  if (typeof raw !== "object" || raw === null) return newSet();
  const obj = raw as Record<string, unknown>;
  const set = newSet();
  set.name = str(obj, "name");
  set.species = str(obj, "species");
  set.gender = str(obj, "gender");
  set.item = str(obj, "item");
  set.ability = str(obj, "ability");
  set.evs = "evs" in obj ? statsFromJSONRaw(obj.evs, 0) : emptyStats();
  set.nature = str(obj, "nature");
  // Missing IV keys default to 31, and a wholly-missing object too.
  set.ivs = "ivs" in obj ? statsFromJSONRaw(obj.ivs, 31) : perfectIVs();
  set.shiny = obj.shiny === true;
  set.level = optInt(obj, "level");
  set.happiness = optInt(obj, "happiness");
  set.pokeball = str(obj, "pokeball");
  set.hiddenPower = str(obj, "hiddenPower");
  set.gigantamax = obj.gigantamax === true;
  set.dynamaxLevel = optInt(obj, "dynamaxLevel");
  set.teraType = str(obj, "teraType");
  set.moves = Array.isArray(obj.moves) ? obj.moves.filter((m): m is string => typeof m === "string") : [];
  return set;
}
