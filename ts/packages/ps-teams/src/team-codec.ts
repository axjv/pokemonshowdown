import { setFromJSON, newSet, emptyStats, perfectIVs, statsFromOrdered, type PokemonSet, type StatsValue } from "./pokemon-set";

/**
 * The four team formats from sim/TEAMS.md: export (human), JSON (`PokemonSet[]`),
 * and packed (wire/save). See docs/PROTOCOL-NOTES.md for the packed grammar.
 * Mirrors the Swift `TeamCodec` — both run against fixtures/teams.
 */
export function importFromJSON(data: string): PokemonSet[] | null {
  try {
    const parsed: unknown = JSON.parse(data);
    if (!Array.isArray(parsed)) return null;
    return parsed.map(setFromJSON);
  } catch {
    return null;
  }
}

export function exportToJSON(sets: PokemonSet[]): string {
  return JSON.stringify(sets, null, 2);
}

/* MARK: - Export format ↔ PokemonSet */

/**
 * Parse PS export format ("Pokémon Showdown team paste"). Lenient: unknown
 * lines are ignored, trailing double-spaces and CRLF tolerated.
 */
export function importTeam(text: string): PokemonSet[] {
  const normalized = text.replace(/\r\n/g, "\n");
  const sets: PokemonSet[] = [];
  for (const block of normalized.split("\n\n")) {
    const lines = block
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line !== "");
    const header = lines[0];
    if (header === undefined || header.startsWith("-") || header.startsWith("Ability")) continue;
    sets.push(parseSet(header, lines.slice(1)));
  }
  return sets;
}

function parseSet(header: string, lines: string[]): PokemonSet {
  const set = newSet();

  // Header: [Nick] [(Species|Gender)] [@ Item]
  let namePart = header;
  const atFull = namePart.indexOf(" @ ");
  const atShort = atFull < 0 ? namePart.indexOf("@ ") : -1;
  const at = atFull >= 0 ? { index: atFull, len: 3 } : atShort > 0 ? { index: atShort, len: 2 } : null;
  if (at !== null && at.index > 0) {
    set.item = namePart.slice(at.index + at.len).trim();
    namePart = namePart.slice(0, at.index).trim();
  }
  let base = namePart;
  const paren = /\(([^()]+)\)\s*$/.exec(namePart);
  if (paren !== null) {
    const inner = paren[1]!.trim();
    base = namePart.slice(0, paren.index).trim();
    // Inner is a gender, a species, or "Species Gender".
    let speciesPart = inner;
    let genderToken = "";
    const tokens = inner.split(" ").filter((t) => t !== "");
    const last = tokens.at(-1);
    if (last !== undefined && ["M", "F", "N"].includes(last)) {
      genderToken = last;
      speciesPart = inner.slice(0, inner.lastIndexOf(" ")).trim();
    }
    if (genderToken !== "") set.gender = genderToken;
    if (speciesPart !== "" && !["M", "F", "N"].includes(speciesPart)) {
      set.species = speciesPart;
      if (speciesPart !== base) set.name = base;
    }
  }
  if (set.species === "") {
    set.species = base;
  } else if (set.name === "" && set.species === base) {
    set.name = "";
  }

  for (const line of lines) {
    const lower = line.toLowerCase();
    if (line.startsWith("- ")) {
      const move = line.slice(2).trim();
      if (move !== "" && !move.toLowerCase().startsWith("no move yet generated")) {
        set.moves.push(move);
      }
    } else if (lower.startsWith("ability:")) {
      set.ability = valueAfter(line, "ability:");
    } else if (lower.startsWith("evs:")) {
      set.evs = parseStats(valueAfter(line, "evs:"), 0);
    } else if (lower.startsWith("ivs:")) {
      set.ivs = parseStats(valueAfter(line, "ivs:"), 31);
    } else if (lower.startsWith("nature:")) {
      set.nature = firstWord(valueAfter(line, "nature:"));
    } else if (line.endsWith("Nature")) {
      set.nature = firstWord(line);
    } else if (lower.startsWith("shiny:")) {
      set.shiny = valueAfter(line, "shiny:").toLowerCase() === "yes";
    } else if (lower.startsWith("level:")) {
      set.level = parseIntOr(valueAfter(line, "level:"));
    } else if (lower.startsWith("happiness:")) {
      set.happiness = parseIntOr(valueAfter(line, "happiness:"));
    } else if (lower.startsWith("hidden power:")) {
      set.hiddenPower = valueAfter(line, "hidden power:");
    } else if (lower.startsWith("tera type:")) {
      set.teraType = valueAfter(line, "tera type:");
    } else if (lower.startsWith("gigantamax:")) {
      set.gigantamax = valueAfter(line, "gigantamax:").toLowerCase() === "yes";
    } else if (lower.startsWith("dynamax level:")) {
      set.dynamaxLevel = parseIntOr(valueAfter(line, "dynamax level:"));
    }
  }
  return set;
}

function valueAfter(line: string, prefix: string): string {
  return line.slice(prefix.length).trim();
}

function firstWord(text: string): string {
  const words = text.split(" ").filter((word) => word !== "");
  return words[0] ?? text;
}

function parseIntOr(text: string): number | undefined {
  const value = Number.parseInt(text, 10);
  return Number.isFinite(value) ? value : undefined;
}

const STAT_ALIASES: Record<string, number> = {
  hp: 0,
  atk: 1, attack: 1,
  def: 2, defense: 2,
  spa: 3, spatk: 3, satk: 3, saten: 3,
  spd: 4, spdef: 4, sdrf: 4, spdfe: 4,
  spe: 5, speed: 5, sspe: 5, ssee: 5,
};

/** "252 HP / 4 SpD" → StatsValue (absent stats = defaultValue). */
export function parseStats(text: string, defaultValue: number): StatsValue {
  const values = Array<number>(6).fill(defaultValue);
  for (const chunk of text.split("/")) {
    const tokens = chunk.split(" ").filter((t) => t !== "");
    if (tokens.length < 2) continue;
    const value = Number.parseInt(tokens[0]!, 10);
    if (!Number.isFinite(value)) continue;
    const index = STAT_ALIASES[tokens[1]!.toLowerCase()];
    if (index !== undefined) values[index] = value;
  }
  return statsFromOrdered(values);
}

/** Render PS export format (trailing double-spaces included). */
export function exportTeam(sets: PokemonSet[]): string {
  const blocks: string[] = [];
  for (const set of sets) {
    const lines: string[] = [];
    let head = set.species;
    const nicked = set.name !== "" && set.name !== set.species;
    if (nicked && set.gender !== "") head = `${set.name} (${set.species} ${set.gender})`;
    else if (nicked) head = `${set.name} (${set.species})`;
    else if (set.gender !== "") head = `${set.species} (${set.gender})`;
    if (set.item !== "") head += ` @ ${set.item}`;
    lines.push(head);
    if (set.ability !== "") lines.push(`Ability: ${set.ability}`);
    if (set.happiness !== undefined && set.happiness !== 255) lines.push(`Happiness: ${set.happiness}`);
    if (set.shiny) lines.push("Shiny: Yes");
    if (set.level !== undefined && set.level !== 100) lines.push(`Level: ${set.level}`);
    if (set.gigantamax) lines.push("Gigantamax: Yes");
    if (set.dynamaxLevel !== undefined && set.dynamaxLevel !== 10) lines.push(`Dynamax Level: ${set.dynamaxLevel}`);
    if (!statsEqual(set.evs, emptyStats())) lines.push(`EVs: ${renderStats(set.evs, true)}`);
    if (set.nature !== "") lines.push(`${set.nature} Nature`);
    if (!statsEqual(set.ivs, perfectIVs())) lines.push(`IVs: ${renderStats(set.ivs, false)}`);
    if (set.hiddenPower !== "") lines.push(`Hidden Power: ${set.hiddenPower}`);
    if (set.teraType !== "") lines.push(`Tera Type: ${set.teraType}`);
    for (const move of set.moves) lines.push(`- ${move}`);
    blocks.push(lines.map((line) => `${line}  `).join("\n"));
  }
  return blocks.join("\n\n") + "\n";
}

function statsEqual(a: StatsValue, b: StatsValue): boolean {
  return STAT_KEYS_FOR_EXPORT.every((key) => a[key] === b[key]);
}

const STAT_NAMES = ["HP", "Atk", "Def", "SpA", "SpD", "Spe"] as const;
const STAT_KEYS_FOR_EXPORT = ["hp", "atk", "def", "spa", "spd", "spe"] as const;

function renderStats(stats: StatsValue, omitIfZero: boolean): string {
  const values = [stats.hp, stats.atk, stats.def, stats.spa, stats.spd, stats.spe];
  const chunks: string[] = [];
  values.forEach((value, i) => {
    const isDefault = omitIfZero ? value === 0 : value === 31;
    if (isDefault) return;
    chunks.push(`${value} ${STAT_NAMES[i]}`);
  });
  return chunks.join(" / ");
}
