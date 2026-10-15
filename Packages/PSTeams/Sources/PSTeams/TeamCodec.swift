import Foundation
import PSProtocol

/// The four team formats from sim/TEAMS.md: export (human), JSON (`PokemonSet[]`),
/// and packed (wire/save). See docs/PROTOCOL-NOTES.md for the packed grammar.
public enum TeamCodec {
    // MARK: JSON

    public static func importFromJSON(_ data: String) -> [PokemonSet]? {
        guard let sets = try? JSONDecoder().decode([PokemonSet].self, from: Data(data.utf8)) else {
            return nil
        }
        return sets
    }

    public static func exportToJSON(_ sets: [PokemonSet]) -> String? {
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.prettyPrinted, .withoutEscapingSlashes]
        guard let data = try? encoder.encode(sets) else { return nil }
        return String(decoding: data, as: UTF8.self)
    }
}

// MARK: - Export format ↔ PokemonSet

extension TeamCodec {
    /// Parse PS export format ("Pokémon Showdown team paste"). Lenient: unknown
    /// lines are ignored, trailing double-spaces and CRLF tolerated.
    public static func importTeam(_ text: String) -> [PokemonSet] {
        let normalized = text.replacingOccurrences(of: "\r\n", with: "\n")
        var sets: [PokemonSet] = []
        for block in normalized.components(separatedBy: "\n\n") {
            let lines = block
                .components(separatedBy: "\n")
                .map { $0.trimmingCharacters(in: .whitespaces) }
                .filter { !$0.isEmpty }
            guard let header = lines.first, !header.hasPrefix("-"), !header.hasPrefix("Ability") else { continue }
            sets.append(parseSet(header: header, lines: lines.dropFirst()))
        }
        return sets
    }

    private static func parseSet(header: String, lines: any Sequence<String>) -> PokemonSet {
        var set = PokemonSet()

        // Header: [Nick] [(Species|Gender)] [@ Item]
        var namePart = header
        if let atRange = namePart.range(of: " @ ") ?? namePart.range(of: "@ ") , atRange.lowerBound != namePart.startIndex {
            set.item = String(namePart[atRange.upperBound...]).trimmingCharacters(in: .whitespaces)
            namePart = String(namePart[..<atRange.lowerBound]).trimmingCharacters(in: .whitespaces)
        }
        var base = namePart
        if let paren = namePart.range(of: #"(\([^()]+\))\s*$"#, options: .regularExpression) {
            let inner = namePart[paren].trimmingCharacters(in: CharacterSet(charactersIn: "() ")).trimmingCharacters(in: .whitespaces)
            base = namePart[..<paren.lowerBound].trimmingCharacters(in: .whitespaces)
            // Inner is a gender, a species, or "Species Gender".
            var speciesPart = inner
            var genderToken = ""
            if let last = inner.split(separator: " ").last, ["M", "F", "N"].contains(String(last)) {
                genderToken = String(last)
                speciesPart = inner[..<inner.lastIndex(of: " ")!].trimmingCharacters(in: .whitespaces)
            }
            if !genderToken.isEmpty { set.gender = genderToken }
            if !speciesPart.isEmpty, !["M", "F", "N"].contains(speciesPart) {
                set.species = speciesPart
                if speciesPart != base { set.name = base }
            }
        }
        if set.species.isEmpty {
            set.species = base
        } else if set.name.isEmpty && set.species == base {
            set.name = ""
        }

        for line in lines {
            let lower = line.lowercased()
            if line.hasPrefix("- ") {
                let move = String(line.dropFirst(2)).trimmingCharacters(in: .whitespaces)
                if !move.isEmpty, !move.lowercased().hasPrefix("no move yet generated") {
                    set.moves.append(move)
                }
            } else if lower.hasPrefix("ability:") {
                set.ability = valueAfter(line, "ability:")
            } else if lower.hasPrefix("evs:") {
                set.evs = parseStats(valueAfter(line, "evs:"), defaultValue: 0)
            } else if lower.hasPrefix("ivs:") {
                set.ivs = parseStats(valueAfter(line, "ivs:"), defaultValue: 31)
            } else if lower.hasPrefix("nature:") {
                set.nature = firstWord(valueAfter(line, "nature:"))
            } else if line.hasSuffix("Nature") {
                set.nature = firstWord(line)
            } else if lower.hasPrefix("shiny:") {
                set.shiny = valueAfter(line, "shiny:").lowercased() == "yes"
            } else if lower.hasPrefix("level:") {
                set.level = Int(valueAfter(line, "level:"))
            } else if lower.hasPrefix("happiness:") {
                set.happiness = Int(valueAfter(line, "happiness:"))
            } else if lower.hasPrefix("hidden power:") {
                set.hiddenPower = valueAfter(line, "hidden power:")
            } else if lower.hasPrefix("tera type:") {
                set.teraType = valueAfter(line, "tera type:")
            } else if lower.hasPrefix("gigantamax:") {
                set.gigantamax = valueAfter(line, "gigantamax:").lowercased() == "yes"
            } else if lower.hasPrefix("dynamax level:") {
                set.dynamaxLevel = Int(valueAfter(line, "dynamax level:"))
            }
        }
        return set
    }

    private static func valueAfter(_ line: String, _ prefix: String) -> String {
        String(line.dropFirst(prefix.count)).trimmingCharacters(in: .whitespaces)
    }

    private static func firstWord(_ text: String) -> String {
        text.split(separator: " ").first.map(String.init) ?? text
    }

    /// "252 HP / 4 SpD" → StatsValue (absent stats = defaultValue).
    static func parseStats(_ text: String, defaultValue: Int) -> StatsValue {
        var values = [Int](repeating: defaultValue, count: 6)
        for chunk in text.components(separatedBy: "/") {
            let tokens = chunk.split(separator: " ", omittingEmptySubsequences: true)
            guard tokens.count >= 2, let value = Int(tokens[0]) else { continue }
            let stat = String(tokens[1]).lowercased()
            let index: Int?
            switch stat {
            case "hp": index = 0
            case "atk", "attack": index = 1
            case "def", "defense": index = 2
            case "spa", "spatk", "satk", "saten", "sp atk": index = 3
            case "spd", "spdef", "sdrf", "spdfe", "sp def": index = 4
            case "spe", "speed", "sspe", "ssee": index = 5
            default: index = nil
            }
            if let index { values[index] = value }
        }
        return StatsValue(ordered: values)
    }

    /// Render PS export format (trailing double-spaces included).
    public static func exportTeam(_ sets: [PokemonSet]) -> String {
        var blocks: [String] = []
        for set in sets {
            var lines: [String] = []
            var head = set.species
            let nicked = !set.name.isEmpty && set.name != set.species
            switch (nicked, set.gender.isEmpty) {
            case (true, false): head = "\(set.name) (\(set.species) \(set.gender))"
            case (true, true): head = "\(set.name) (\(set.species))"
            case (false, false): head = "\(set.species) (\(set.gender))"
            case (false, true): break
            }
            if !set.item.isEmpty { head += " @ \(set.item)" }
            lines.append(head)
            if !set.ability.isEmpty { lines.append("Ability: \(set.ability)") }
            if let happiness = set.happiness, happiness != 255 { lines.append("Happiness: \(happiness)") }
            if set.shiny { lines.append("Shiny: Yes") }
            if let level = set.level, level != 100 { lines.append("Level: \(level)") }
            if set.gigantamax { lines.append("Gigantamax: Yes") }
            if let dmax = set.dynamaxLevel, dmax != 10 { lines.append("Dynamax Level: \(dmax)") }
            if set.evs != .zeros { lines.append("EVs: " + renderStats(set.evs.ordered, omitIfZero: true)) }
            if !set.nature.isEmpty { lines.append("\(set.nature) Nature") }
            if set.ivs != .perfectIVs { lines.append("IVs: " + renderStats(set.ivs.ordered, omitIfZero: false)) }
            if !set.hiddenPower.isEmpty { lines.append("Hidden Power: \(set.hiddenPower)") }
            if !set.teraType.isEmpty { lines.append("Tera Type: \(set.teraType)") }
            for move in set.moves { lines.append("- \(move)") }
            blocks.append(lines.map { "\($0)  " }.joined(separator: "\n"))
        }
        return blocks.joined(separator: "\n\n") + "\n"
    }

    private static let statNames = ["HP", "Atk", "Def", "SpA", "SpD", "Spe"]

    private static func renderStats(_ values: [Int], omitIfZero: Bool) -> String {
        var chunks: [String] = []
        for (i, value) in values.enumerated() {
            let isDefault = omitIfZero ? value == 0 : value == 31
            if isDefault { continue }
            let name = omitIfZero ? statNames[i] : statNames[i]
            chunks.append("\(value) \(name)")
        }
        return chunks.joined(separator: " / ")
    }
}
