#!/usr/bin/env node
// Converts Pokémon Showdown's static data/*.js files into the single dex JSON
// consumed by both the Swift (PSData) and TypeScript (ps-data) stacks.
//
// PS's data files are JavaScript assignments onto `window` (with functions and
// comments embedded), so we evaluate them in a sandbox and then re-serialize
// the subsets we actually want as plain JSON.
//
// Usage:
//   node dexextract.mjs                       # full extraction → repo Packages/PSData/.../Resources/dex
//   node dexextract.mjs --subset subsets/fixtures.json
//   node dexextract.mjs --out ../../dex-full  # alternate output dir
//   node dexextract.mjs --source https://play.pokemonshowdown.com/data
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const DEFAULT_BASE = "https://play.pokemonshowdown.com/data";

const argv = process.argv.slice(2);
const argOf = (name, dflt) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : dflt;
};
const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../..");
const base = argOf("source", DEFAULT_BASE);
const outDir = path.resolve(argOf("out", path.join(repoRoot, "Packages/PSData/Sources/PSData/Resources/dex")));
const subsetPath = argOf("subset", null);
const cacheDir = path.join(here, ".cache");

// --- fetch + eval -----------------------------------------------------------

async function loadExports(name) {
  const url = `${base}/${name}.js`;
  const cacheFile = path.join(cacheDir, `${name}.js`);
  let text;
  try {
    text = await readFile(cacheFile, "utf8");
    console.log(`[cache] ${name}.js`);
  } catch {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`GET ${url} → ${res.status}`);
    text = await res.text();
    await mkdir(cacheDir, { recursive: true });
    await writeFile(cacheFile, text);
    console.log(`[fetch] ${url} (${text.length} bytes)`);
  }
  // Current PS data files are compiled sim data: `exports.BattleXxx = {...};`.
  // A classic Script in a null-prototype sandbox is the smallest safe eval.
  const sandbox = Object.create(null);
  sandbox.exports = {};
  vm.runInNewContext(text, sandbox, { filename: `${name}.js`, timeout: 20000 });
  return sandbox.exports;
}

const capitalize = (id) => id.charAt(0).toUpperCase() + id.slice(1);

// Mod files (data/mods/...) add entries with "inherit" semantics we do not
// model; for the default (gen 9) dex we only need the root files.
function entriesOf(obj) {
  return obj && typeof obj === "object" ? Object.entries(obj) : [];
}

const toID = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, "");

// --- extractors -------------------------------------------------------------

function extractTypechart(typeChart) {
  // BattleTypeChart is keyed by DEFENDING type ID ("bug"); damageTaken keys
  // are attacking type display names ("Bug"), with codes:
  //   0 = neutral, 1 = defender is weak (2x), 2 = defender resists (0.5x),
  //   3 = defender immune (0x). Other keys (par, brn, prankster…) are skipped.
  // We flip this to attacker -> { defender -> multiplier } (only != 1).
  const CODE = { 0: 1, 1: 2, 2: 0.5, 3: 0 };
  const validNames = new Set(Object.keys(typeChart).map(capitalize));
  const chart = {};
  for (const [atkName] of [...validNames].map((n) => [n])) chart[atkName] = { efficacy: {} };
  for (const [defId, data] of entriesOf(typeChart)) {
    const defender = capitalize(defId);
    for (const [atk, code] of entriesOf(data.damageTaken)) {
      if (!validNames.has(atk)) continue;
      const mult = CODE[code];
      if (mult !== undefined && mult !== 1) chart[atk].efficacy[defender] = mult;
    }
  }
  return chart;
}

function pickScalars(obj, numberFields = [], stringFields = []) {
  const out = {};
  for (const f of numberFields) {
    if (typeof obj[f] === "number") out[f] = obj[f];
  }
  for (const f of stringFields) {
    if (typeof obj[f] === "string") out[f] = obj[f];
  }
  if (Array.isArray(obj.types)) out.types = obj.types;
  return out;
}

// --- main -------------------------------------------------------------------

const typechart = extractTypechart((await loadExports("typechart")).BattleTypeChart);

const dexIn = (await loadExports("pokedex")).BattlePokedex;
const pokemon = {};
for (const [id, entry] of entriesOf(dexIn)) {
  if (!entry || typeof entry !== "object" || typeof entry.name !== "string") continue;
  const picked = pickScalars(entry, ["num"], ["name", "gender"]);
  picked.types = entry.types || ["Normal"];
  if (entry.baseStats && typeof entry.baseStats === "object") picked.baseStats = entry.baseStats;
  if (!picked.name) continue;
  pokemon[toID(id)] = picked;
}

const movesIn = (await loadExports("moves")).BattleMovedex;
const moves = {};
for (const [id, entry] of entriesOf(movesIn)) {
  if (typeof entry === "string") continue; // alias entry
  if (!entry || typeof entry !== "object" || typeof entry.name !== "string") continue;
  const picked = pickScalars(entry, ["basePower", "pp", "priority"], ["name", "type", "category"]);
  if (!picked.name) continue;
  moves[toID(id)] = picked;
}

const abilitiesIn = (await loadExports("abilities")).BattleAbilities;
const abilities = {};
for (const [id, entry] of entriesOf(abilitiesIn)) {
  if (!entry || typeof entry !== "object" || typeof entry.name !== "string") continue;
  abilities[toID(id)] = { name: entry.name };
}

const itemsIn = (await loadExports("items")).BattleItems;
const items = {};
for (const [id, entry] of entriesOf(itemsIn)) {
  if (!entry || typeof entry !== "object" || typeof entry.name !== "string") continue;
  items[toID(id)] = { name: entry.name };
}

// PS's client data has no natures.js — the 25 natures are static.
const natures = ["Adamant", "Bashful", "Bold", "Brave", "Calm", "Careful", "Docile", "Gentle",
  "Hardy", "Hasty", "Impish", "Jolly", "Lax", "Lonely", "Mild", "Modest", "Naive", "Naughty",
  "Quiet", "Rash", "Relaxed", "Sassy", "Serious", "Timid"];

let dex = {
  format: "ps-client-dex/1",
  fetched: new Date().toISOString(),
  types: Object.keys(typechart),
  typechart,
  pokemon,
  moves,
  abilities,
  items,
  natures,
};

if (subsetPath) {
  const subset = JSON.parse(await readFile(path.resolve(here, subsetPath), "utf8"));
  for (const section of ["pokemon", "moves", "abilities", "items"]) {
    const wanted = subset[section] || [];
    const kept = {};
    for (const id of wanted) {
      if (dex[section][id]) kept[id] = dex[section][id];
      else console.warn(`subset: ${section} id "${id}" not found in PS data`);
    }
    dex[section] = kept;
  }
}

await mkdir(outDir, { recursive: true });
const outFile = path.join(outDir, "dex.json");
await writeFile(outFile, JSON.stringify(dex, null, 1));
console.log(`wrote ${outFile}`);
console.log(`  types: ${dex.types.length}, pokemon: ${Object.keys(dex.pokemon).length}, moves: ${Object.keys(dex.moves).length}, abilities: ${Object.keys(dex.abilities).length}, items: ${Object.keys(dex.items).length}`);
