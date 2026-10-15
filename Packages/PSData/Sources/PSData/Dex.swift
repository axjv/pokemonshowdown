import Foundation
import PSProtocol

/// Read-only Pokémon dex loaded from the `ps-client-dex/1` JSON produced by
/// `Tools/dexextract`. Keys are `toID` strings; entries carry display names.
public struct Dex: Sendable, Decodable {
    public struct TypeEffectiveness: Sendable, Decodable {
        public let efficacy: [String: Double]
    }

    public struct Species: Sendable, Decodable {
        public let num: Int?
        public let name: String
        public let types: [String]
        public let baseStats: [String: Int]?
    }

    public struct Move: Sendable, Decodable {
        public let name: String
        public let type: String?
        public let basePower: Double?
        public let category: String?
        public let pp: Int?
        public let priority: Double?
    }

    public struct Named: Sendable, Decodable {
        public let name: String
    }

    public let format: String
    public let fetched: String?
    public let types: [String]
    public let typechart: [String: TypeEffectiveness]
    public let pokemon: [String: Species]
    public let moves: [String: Move]
    public let abilities: [String: Named]
    public let items: [String: Named]
    public let natures: [String]

    public init(json data: Data) throws {
        self = try JSONDecoder().decode(Dex.self, from: data)
    }

    /// The dex bundled with the app (subset in development, full set in
    /// release builds — same path both times).
    public static func loadDefault() throws -> Dex {
        guard let url = Bundle.module.url(forResource: "dex", withExtension: "json",
                                          subdirectory: "dex"),
              let data = try? Data(contentsOf: url) else {
            struct MissingDex: Error {}
            throw MissingDex()
        }
        return try Dex(json: data)
    }

    // MARK: - lookups (accept display names or IDs)

    public func species(_ key: String) -> Species? { pokemon[toID(key)] }
    public func move(_ key: String) -> Move? { moves[toID(key)] }
    public func ability(_ key: String) -> Named? { abilities[toID(key)] }
    public func item(_ key: String) -> Named? { items[toID(key)] }

    /// Damage multiplier of `attack` against `defense` (multi-type aware).
    public func effectiveness(attack: String, against defense: [String]) -> Double {
        defense.reduce(1) { total, defender in
            total * (typechart[attack]?.efficacy[defender] ?? 1)
        }
    }
}
