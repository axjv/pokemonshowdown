/**
 * Pokémon Showdown's canonical identifier transform (`toID` in PS's code):
 * lower-case alphanumeric only — `toID("Mr. Mime") === "mrmime"`.
 */
export function toID(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "");
}
