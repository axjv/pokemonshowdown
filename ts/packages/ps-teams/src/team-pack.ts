import { toID } from "ps-protocol";
import {
  newSet,
  statsFromOrdered,
  statsToOrdered,
  type PokemonSet,
} from "./pokemon-set";

/**
 * Packed format (sets joined by `]`), per sim/TEAMS.md:
 *
 *   NICK|SPECIES|ITEM|ABILITY|MOVES|NATURE|EVS|GENDER|IVS|SHINY|LEVEL|HAPPINESS,POKEBALL,HPTYPE,GIGANTAMAX,DYNAMAXLEVEL,TERATYPE
 *
 * Blanks mean defaults: IVs 31, EVs 0, level 100, happiness 255,
 * dmax level 10; SPECIES blank when it equals NICK.
 * Mirrors the Swift `TeamPack` — both run against fixtures/teams.
 */
export function packTeam(sets: PokemonSet[]): string {
  return sets.map(packSet).join("]");
}

function packSet(set: PokemonSet): string {
  const nick = set.name === "" ? set.species : set.name;
  const species = set.name === "" || set.name === set.species ? "" : toID(set.species);

  const details2 = [
    set.happiness !== undefined && set.happiness !== 255 ? String(set.happiness) : "",
    set.pokeball,
    set.hiddenPower,
    set.gigantamax ? "G" : "",
    set.dynamaxLevel !== undefined && set.dynamaxLevel !== 10 ? String(set.dynamaxLevel) : "",
    set.teraType,
  ];
  const details2Joined = details2.every((part) => part === "") ? "" : details2.join(",");

  return [
    nick,
    species,
    toID(set.item),
    toID(set.ability),
    set.moves.map(toID).join(","),
    set.nature,
    joinStats(statsToOrdered(set.evs), 0),
    set.gender,
    joinStats(statsToOrdered(set.ivs), 31),
    set.shiny ? "S" : "",
    set.level !== undefined && set.level !== 100 ? String(set.level) : "",
    details2Joined,
  ].join("|");
}

function joinStats(values: number[], defaultValue: number): string {
  if (values.every((value) => value === defaultValue)) return "";
  return values.map((value) => (value === defaultValue ? "" : String(value))).join(",");
}

/**
 * Inverse of `packTeam`. Species/item/ability/moves stay as the packed IDs —
 * display-name resolution needs the dex (ps-data, milestone M3).
 */
export function unpackTeam(packed: string): PokemonSet[] {
  return packed
    .split("]")
    .filter((set) => set !== "")
    .map(unpackSet);
}

function unpackSet(text: string): PokemonSet {
  const fields = text.split("|");
  while (fields.length < 12) fields.push("");
  const field = (i: number) => fields[i] ?? "";
  const set = newSet();

  const nick = field(0);
  const species = field(1);
  if (species === "") {
    set.species = nick;
    set.name = "";
  } else {
    set.species = species;
    set.name = nick;
  }
  set.item = field(2);
  set.ability = field(3);
  set.moves = field(4) === "" ? [] : field(4).split(",");
  set.nature = field(5);
  set.evs = statsFromOrdered(splitStats(field(6), 0));
  set.gender = field(7);
  set.ivs = statsFromOrdered(splitStats(field(8), 31));
  set.shiny = field(9) === "S";
  set.level = field(10) === "" ? undefined : parseIntOr(field(10), undefined);

  if (field(11) !== "") {
    const details = field(11).split(",");
    while (details.length < 6) details.push("");
    set.happiness = details[0] === "" ? undefined : parseIntOr(details[0]!, undefined);
    set.pokeball = details[1] ?? "";
    set.hiddenPower = details[2] ?? "";
    set.gigantamax = details[3] === "G";
    set.dynamaxLevel = details[4] === "" ? undefined : parseIntOr(details[4]!, undefined);
    set.teraType = details[5] ?? "";
  }
  return set;
}

function splitStats(text: string, defaultValue: number): number[] {
  if (text === "") return Array(6).fill(defaultValue);
  const parts = text.split(",");
  return Array.from({ length: 6 }, (_, i) => {
    const raw = i < parts.length ? parts[i]! : "";
    const value = raw === "" ? Number.NaN : Number.parseInt(raw, 10);
    return Number.isFinite(value) ? value : defaultValue;
  });
}

function parseIntOr(text: string, fallback: number | undefined): number | undefined {
  const value = Number.parseInt(text, 10);
  return Number.isFinite(value) ? value : fallback;
}
