import Foundation

/// Decoded `|request|JSON` — what the client needs to draw move/switch buttons.
/// Only the fields relevant to decision UI are modeled; unknown keys are
/// ignored. See SIM-PROTOCOL.md "Requests".
public struct BattleRequest: Codable, Sendable, Equatable {
    public struct MoveEntry: Codable, Sendable, Equatable {
        public var move: String
        public var id: String?
        public var pp: Int?
        public var maxpp: Int?
        public var target: String?
        public var disabled: Bool?
    }

    /// One active slot's available moves.
    public struct ActiveSlot: Codable, Sendable, Equatable {
        public var moves: [MoveEntry]
    }

    public struct SidePokemon: Codable, Sendable, Equatable {
        public var ident: String
        public var details: String
        public var condition: String?
        public var active: Bool
        public var canMegaEvo: Bool?
        public var canUltraBurst: Bool?
        public var canDynamax: Bool?
        public var canTerastallize: String?
        public var trapped: Bool?
        public var moves: [String]
    }

    public struct Side: Codable, Sendable, Equatable {
        public var name: String
        public var id: String
        public var pokemon: [SidePokemon]
    }

    public var active: [ActiveSlot]?
    public var side: Side?
    public var rqid: Int?
    public var wait: Bool?
    public var teamPreview: Bool?
    public var forceSwitch: [Bool?]?

    public init(active: [ActiveSlot]? = nil, side: Side? = nil, rqid: Int? = nil,
                wait: Bool? = nil, teamPreview: Bool? = nil, forceSwitch: [Bool?]? = nil) {
        self.active = active
        self.side = side
        self.rqid = rqid
        self.wait = wait
        self.teamPreview = teamPreview
        self.forceSwitch = forceSwitch
    }

    public static func decode(fromJSON json: String) -> BattleRequest? {
        guard let data = json.data(using: .utf8) else { return nil }
        return try? JSONDecoder().decode(BattleRequest.self, from: data)
    }
}
