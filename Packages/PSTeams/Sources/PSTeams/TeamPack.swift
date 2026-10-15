import Foundation
import PSProtocol

extension TeamCodec {
    /// Serialize to the packed format (sets joined by `]`), per sim/TEAMS.md:
    ///
    ///     NICK|SPECIES|ITEM|ABILITY|MOVES|NATURE|EVS|GENDER|IVS|SHINY|LEVEL|HAPPINESS,POKEBALL,HPTYPE,GIGANTAMAX,DYNAMAXLEVEL,TERATYPE
    ///
    /// Blanks mean defaults: IVs 31, EVs 0, level 100, happiness 255,
    /// dmax level 10; SPECIES blank when it equals NICK.
    public static func pack(_ sets: [PokemonSet]) -> String {
        sets.map(packSet).joined(separator: "]")
    }

    private static func packSet(_ set: PokemonSet) -> String {
        let nick = set.name.isEmpty ? set.species : set.name
        let species = (set.name.isEmpty || set.name == set.species) ? "" : toID(set.species)

        let evJoined = joinStats(set.evs.ordered, default: 0)
        let ivJoined = joinStats(set.ivs.ordered, default: 31)

        var details2: [String] = []
        details2.append(set.happiness.flatMap { $0 == 255 ? "" : String($0) } ?? "")
        details2.append(set.pokeball)
        details2.append(set.hiddenPower)
        details2.append(set.gigantamax ? "G" : "")
        details2.append(set.dynamaxLevel.flatMap { $0 == 10 ? "" : String($0) } ?? "")
        details2.append(set.teraType)
        let details2Joined = details2.allSatisfy(\.isEmpty) ? "" : details2.joined(separator: ",")

        return [
            nick,
            species,
            toID(set.item),
            toID(set.ability),
            set.moves.map { toID($0) }.joined(separator: ","),
            set.nature,
            evJoined,
            set.gender,
            ivJoined,
            set.shiny ? "S" : "",
            set.level.flatMap { $0 == 100 ? "" : String($0) } ?? "",
            details2Joined,
        ].joined(separator: "|")
    }

    private static func joinStats(_ values: [Int], default defaultValue: Int) -> String {
        if values.allSatisfy({ $0 == defaultValue }) { return "" }
        return values.map { $0 == defaultValue ? "" : String($0) }.joined(separator: ",")
    }

    /// Inverse of `pack`. Species/item/ability/moves stay as the packed IDs —
    /// display-name resolution needs the dex (`ps-data` / `PSData`, milestone M3).
    public static func unpack(_ packed: String) -> [PokemonSet] {
        packed
            .components(separatedBy: "]")
            .filter { !$0.isEmpty }
            .map { unpackSet($0) }
    }

    private static func unpackSet(_ text: String) -> PokemonSet {
        var fields = text.components(separatedBy: "|")
        while fields.count < 12 { fields.append("") }
        var set = PokemonSet()

        let nick = fields[0]
        let species = fields[1]
        if species.isEmpty {
            set.species = nick
            set.name = ""
        } else {
            set.species = species
            set.name = nick
        }
        set.item = fields[2]
        set.ability = fields[3]
        set.moves = fields[4].isEmpty ? [] : fields[4].components(separatedBy: ",")
        set.nature = fields[5]
        set.evs = StatsValue(ordered: splitStats(fields[6], default: 0))
        set.gender = fields[7]
        set.ivs = StatsValue(ordered: splitStats(fields[8], default: 31))
        set.shiny = fields[9] == "S"
        set.level = fields[10].isEmpty ? nil : Int(fields[10])

        if !fields[11].isEmpty {
            var details = fields[11].components(separatedBy: ",")
            while details.count < 6 { details.append("") }
            set.happiness = details[0].isEmpty ? nil : Int(details[0])
            set.pokeball = details[1]
            set.hiddenPower = details[2]
            set.gigantamax = details[3] == "G"
            set.dynamaxLevel = details[4].isEmpty ? nil : Int(details[4])
            set.teraType = details[5]
        }
        return set
    }

    private static func splitStats(_ text: String, default defaultValue: Int) -> [Int] {
        if text.isEmpty { return [Int](repeating: defaultValue, count: 6) }
        let parts = text.components(separatedBy: ",")
        return (0..<6).map { i in
            let raw = i < parts.count ? parts[i] : ""
            return raw.isEmpty ? defaultValue : Int(raw) ?? defaultValue
        }
    }
}
