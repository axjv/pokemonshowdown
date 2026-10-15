import Foundation
import PSProtocol

/// One of the six stat buckets (HP, Atk, Def, SpA, SpD, Spe order).
public struct StatsValue: Codable, Sendable, Equatable {
    public var hp, atk, def, spa, spd, spe: Int

    public init(hp: Int = 0, atk: Int = 0, def: Int = 0, spa: Int = 0, spd: Int = 0, spe: Int = 0) {
        self.hp = hp; self.atk = atk; self.def = def
        self.spa = spa; self.spd = spd; self.spe = spe
    }

    public static let zeros = StatsValue()
    public static let perfectIVs = StatsValue(hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31)

    /// Values in PS's canonical order, for comma-joined serialization.
    public var ordered: [Int] { [hp, atk, def, spa, spd, spe] }

    public init(ordered: [Int]) {
        precondition(ordered.count == 6, "expected six stats")
        self.init(hp: ordered[0], atk: ordered[1], def: ordered[2],
                  spa: ordered[3], spd: ordered[4], spe: ordered[5])
    }

    /// PS JSON may omit stat keys; treat them as zero (callers apply IV
    /// defaults on top when decoding `ivs`).
    private enum CodingKeys: String, CodingKey { case hp, atk, def, spa, spd, spe }

    public init(from decoder: Decoder) throws {
        try self.init(from: decoder, missingDefault: 0)
    }

    public init(from decoder: Decoder, missingDefault: Int) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        hp = try c.decodeIfPresent(Int.self, forKey: .hp) ?? missingDefault
        atk = try c.decodeIfPresent(Int.self, forKey: .atk) ?? missingDefault
        def = try c.decodeIfPresent(Int.self, forKey: .def) ?? missingDefault
        spa = try c.decodeIfPresent(Int.self, forKey: .spa) ?? missingDefault
        spd = try c.decodeIfPresent(Int.self, forKey: .spd) ?? missingDefault
        spe = try c.decodeIfPresent(Int.self, forKey: .spe) ?? missingDefault
    }
}

/// A Pokémon set — the JSON team format's unit (mirrors PS's `PokemonSet`).
/// Defaults match PS semantics: IVs default to 31, level to 100, happiness to
/// 255; empty string == "not specified" for item/ability/gender/nature.
public struct PokemonSet: Codable, Sendable, Equatable {
    /// Nickname; empty means "use species name".
    public var name = ""
    public var species = ""
    /// "M", "F", "N", or "" (unspecified).
    public var gender = ""
    public var item = ""
    public var ability = ""
    public var evs = StatsValue.zeros
    /// Nature display name, "" = none.
    public var nature = ""
    public var ivs = StatsValue.perfectIVs
    public var shiny = false
    /// nil = 100.
    public var level: Int?
    /// nil = 255.
    public var happiness: Int?
    public var pokeball = ""
    /// Hidden Power base type name ("" = none).
    public var hiddenPower = ""
    public var gigantamax = false
    /// nil = 10.
    public var dynamaxLevel: Int?
    public var teraType = ""
    /// Move display names.
    public var moves: [String] = []

    public init() {}

    private enum CodingKeys: String, CodingKey {
        case name, species, gender, item, ability, evs, nature, ivs, shiny, level
        case happiness, pokeball, hiddenPower, gigantamax, dynamaxLevel, teraType, moves
    }

    /// PS's JSON format omits defaulted fields (e.g. `ivs` when all 31); this
    /// init applies the same defaults for missing keys.
    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        name = try c.decodeIfPresent(String.self, forKey: .name) ?? ""
        species = try c.decodeIfPresent(String.self, forKey: .species) ?? ""
        gender = try c.decodeIfPresent(String.self, forKey: .gender) ?? ""
        item = try c.decodeIfPresent(String.self, forKey: .item) ?? ""
        ability = try c.decodeIfPresent(String.self, forKey: .ability) ?? ""
        evs = try c.decodeIfPresent(StatsValue.self, forKey: .evs) ?? .zeros
        nature = try c.decodeIfPresent(String.self, forKey: .nature) ?? ""
        // Missing IV keys default to 31, and a wholly-missing object too.
        ivs = c.contains(.ivs)
            ? (try StatsValue(from: c.superDecoder(forKey: .ivs), missingDefault: 31))
            : .perfectIVs
        shiny = try c.decodeIfPresent(Bool.self, forKey: .shiny) ?? false
        level = try c.decodeIfPresent(Int.self, forKey: .level)
        happiness = try c.decodeIfPresent(Int.self, forKey: .happiness)
        pokeball = try c.decodeIfPresent(String.self, forKey: .pokeball) ?? ""
        hiddenPower = try c.decodeIfPresent(String.self, forKey: .hiddenPower) ?? ""
        gigantamax = try c.decodeIfPresent(Bool.self, forKey: .gigantamax) ?? false
        dynamaxLevel = try c.decodeIfPresent(Int.self, forKey: .dynamaxLevel)
        teraType = try c.decodeIfPresent(String.self, forKey: .teraType) ?? ""
        moves = try c.decodeIfPresent([String].self, forKey: .moves) ?? []
    }
}
