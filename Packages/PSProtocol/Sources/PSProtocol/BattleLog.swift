import Foundation

/// Parsed `HP STATUS` chunk: `144/262`, `100/100 slp`, `0 fnt`.
public struct HPStatus: Sendable, Equatable {
    public let numerator: Int?
    public let denominator: Int?
    /// e.g. `slp`, `par`, `brn` — nil for healthy and for `fnt`.
    public let status: String?
    public let fainted: Bool

    public init?(parsing text: String) {
        var hpPart = Substring(text)
        var status = ""
        if let space = text.firstIndex(of: " ") {
            hpPart = text[..<space]
            status = String(text[text.index(after: space)...])
        }
        let comps = hpPart.split(separator: "/")
        guard let num = Int(comps.first ?? "") else { return nil }
        numerator = num
        denominator = comps.count > 1 ? Int(comps[1]) : nil
        fainted = num == 0 || status == "fnt"
        self.status = (status.isEmpty || status == "fnt") ? nil : status
    }
}

/// One Pokémon tracked by `BattleLog`, keyed by position (`p1a`…).
public struct BattlePokemon: Sendable, Equatable {
    /// Full ident from the protocol, e.g. `p1a: Sparky`.
    public var ident: String
    /// `Species, L50, F, shiny` details string.
    public var details: String
    public var hpNumerator: Int?
    public var hpDenominator: Int?
    public var status: String?
    public var fainted: Bool = false
    public var volatiles: Set<String> = []
    public var boosts: [String: Int] = [:]

    public init(ident: String, details: String, hp: HPStatus?) {
        self.ident = ident
        self.details = details
        hpNumerator = hp?.numerator
        hpDenominator = hp?.denominator
        status = hp?.status
        fainted = hp?.fainted ?? false
    }

    /// Display name (`Sparky` from `p1a: Sparky`).
    public var name: String {
        guard let colon = ident.firstIndex(of: ":") else { return ident }
        return String(ident[ident.index(after: colon)...]).trimmingCharacters(in: .whitespaces)
    }
}

/// A rendered battle-log line (the UI layer maps these to text/styles).
public enum BattleEntry: Sendable, Equatable {
    case spacer
    case turn(Int)
    case start
    case teamPreview
    case message(String)
    case small(String)
    case move(user: String, move: String)
    case switchIn(user: String, details: String)
    case faint(user: String)
    case info(String)
    case error(String)
    case win(String)
    case tie
    case request(json: String)
}

/// Fixture-testable battle state machine. Replays protocol chunks and tracks
/// teams, HP/status/boosts, weather, field and side conditions, and the log.
/// Decision support (`|request|` round-tripping) is consumed but not applied
/// here — see `BattleRequest` and milestone M5.
public final class BattleLog {
    public struct Player: Sendable, Equatable {
        public var name: String
        public var avatar: String
        public var rating: Int?
    }

    public private(set) var players: [String: Player] = [:]
    public private(set) var teamSizes: [String: Int] = [:]
    public private(set) var gameType = ""
    public private(set) var gen = 9
    public private(set) var tier = ""
    public private(set) var rules: [String] = []
    public private(set) var turn = 0
    public private(set) var weather: String?
    public private(set) var fieldConditions: [String] = []
    /// Side conditions per side, index 0 = p1, 1 = p2.
    public private(set) var sideConditions: [[String]] = [[], []]
    /// Pokémon by position (`p1a`, `p2b`, …).
    public private(set) var activeByPosition: [String: BattlePokemon] = [:]
    /// Team-preview roster: (side, details, itemID-or-nil), in arrival order.
    public private(set) var previewPokemon: [(side: String, details: String, item: String?)] = []
    public private(set) var entries: [BattleEntry] = []
    public private(set) var isStarted = false
    public private(set) var isOver = false
    public private(set) var winner: String?
    public private(set) var teamPreview = false

    public init() {}

    public func apply(_ rawLine: String) {
        apply(PSLine(parsing: rawLine))
    }

    public func apply(_ line: PSLine) {
        if line.type.isEmpty && line.parts.isEmpty {
            // Bare `|` spacer line.
            entries.append(.spacer)
            return
        }
        switch line.type {
        case "player":
            players[line.parts.first ?? ""] = Player(
                name: line.parts.count > 1 ? line.parts[1] : "",
                avatar: line.parts.count > 2 ? line.parts[2] : "",
                rating: line.parts.count > 3 ? Int(line.parts[3]) : nil)
        case "teamsize":
            guard line.parts.count >= 2, let size = Int(line.parts[1]) else { break }
            teamSizes[line.parts[0]] = size
        case "gametype":
            gameType = line.parts.first ?? ""
        case "gen":
            gen = Int(line.parts.first ?? "") ?? gen
        case "tier":
            tier = line.joinedParts()
        case "rule":
            rules.append(line.joinedParts())
        case "clearpoke":
            previewPokemon.removeAll()
        case "poke":
            guard line.parts.count >= 2 else { break }
            previewPokemon.append((
                side: Self.positionID(line.parts[0]),
                details: line.parts[1],
                item: line.parts.count > 2 && !line.parts[2].isEmpty ? line.parts[2] : nil))
        case "teampreview":
            teamPreview = true
            entries.append(.teamPreview)
        case "start":
            isStarted = true
            teamPreview = false
            entries.append(.start)
        case "turn":
            turn = Int(line.parts.first ?? "") ?? turn
            entries.append(.turn(turn))
        case "request":
            let json = line.joinedParts()
            entries.append(.request(json: json))
        case "win":
            winner = line.parts.first
            isOver = true
            entries.append(.win(line.parts.first ?? ""))
        case "tie":
            isOver = true
            entries.append(.tie)
        case "switch", "drag":
            guard line.parts.count >= 2 else { break }
            let position = Self.positionID(line.parts[0])
            activeByPosition[position] = BattlePokemon(
                ident: line.parts[0],
                details: line.parts[1],
                hp: line.parts.count > 2 ? HPStatus(parsing: line.parts[2]) : nil)
            entries.append(.switchIn(user: line.parts[0], details: line.parts[1]))
        case "detailschange":
            guard line.parts.count >= 2, let position = line.parts.first.map(Self.positionID),
                  var mon = activeByPosition[position] else { break }
            mon.details = line.parts[1]
            if line.parts.count > 2, let hp = HPStatus(parsing: line.parts[2]) { Self.apply(hp, to: &mon) }
            activeByPosition[position] = mon
        case "replace":
            guard line.parts.count >= 3, let position = line.parts.first.map(Self.positionID),
                  var mon = activeByPosition[position],
                  let hp = HPStatus(parsing: line.parts[2]) else { break }
            mon.ident = line.parts[0]
            Self.apply(hp, to: &mon)
            activeByPosition[position] = mon
        case "swap":
            // `|swap|POKEMON1|POSITION1|POKEMON2|POSITION2` — the two Pokémon
            // trade battle positions (doubles only).
            guard line.parts.count >= 4,
                  var first = activeByPosition[Self.positionID(line.parts[0])],
                  var second = activeByPosition[Self.positionID(line.parts[2])] else { break }
            let posA = Self.positionID(line.parts[0])
            let posB = Self.positionID(line.parts[2])
            let (nameA, nameB) = (first.name, second.name)
            first.ident = "\(posB): \(nameA)"
            second.ident = "\(posA): \(nameB)"
            activeByPosition[posA] = second
            activeByPosition[posB] = first
        case "faint":
            guard let ident = line.parts.first else { break }
            let position = Self.positionID(ident)
            if var mon = activeByPosition[position] {
                mon.fainted = true
                mon.hpNumerator = 0
                mon.status = nil
                activeByPosition[position] = mon
            }
            entries.append(.faint(user: ident))
        case "move":
            guard line.parts.count >= 3 else { break }
            entries.append(.move(user: line.parts[0], move: line.parts[2]))
        case "cant":
            guard line.parts.count >= 2 else { break }
            entries.append(.small("\(line.parts[0]) couldn't move!"))
        case "inactive", "inactiveoff":
            entries.append(.info(line.joinedParts()))
        case "t:":
            break // timestamp marker
        case "error":
            entries.append(.error(line.joinedParts()))
        default:
            if line.type.hasPrefix("-") {
                applyMinor(line)
            } else {
                entries.append(.message(line.joinedParts()))
            }
        }
    }

    // MARK: - minor (`-`) actions
    // Minor lines are `|-ACTION|POKEMON|ARG…` — the Pokémon is parts[0].

    private func applyMinor(_ line: PSLine) {
        let action = String(line.type.dropFirst())
        let target = line.parts.first.map(Self.positionID) ?? ""
        func mon() -> BattlePokemon? { activeByPosition[target] }
        func set(_ transform: (inout BattlePokemon) -> Void) {
            guard var m = activeByPosition[target] else { return }
            transform(&m)
            activeByPosition[target] = m
        }
        switch action {
        case "damage", "heal", "sethp":
            guard var m = mon(), line.parts.count > 1, let hp = HPStatus(parsing: line.parts[1]) else { break }
            Self.apply(hp, to: &m)
            activeByPosition[target] = m
            entries.append(.small("\(m.name) \(hp.numerator ?? 0)/\(hp.denominator ?? 0)"))
        case "status":
            guard line.parts.count > 1 else { break }
            set { $0.status = line.parts[1] }
        case "curestatus":
            set { $0.status = nil }
        case "boost", "unboost":
            guard line.parts.count > 1 else { break }
            let stat = line.parts[1]
            let amount = line.parts.count > 2 ? (Int(line.parts[2]) ?? 1) : 1
            set { $0.boosts[stat, default: 0] += (action == "boost" ? amount : -amount) }
        case "setboost":
            guard line.parts.count > 1, let value = Int(line.parts[1]) else { break }
            set { $0.boosts = ["offset": value] }
        case "clearboost":
            set { $0.boosts = [:] }
        case "clearallboost":
            for (position, var m) in activeByPosition {
                m.boosts = [:]
                activeByPosition[position] = m
            }
        case "start":
            guard line.parts.count > 1 else { break }
            set { $0.volatiles.insert(line.parts[1]) }
        case "end":
            guard line.parts.count > 1 else { break }
            set { $0.volatiles.remove(line.parts[1]) }
        case "weather":
            weather = line.parts.first.map { $0.isEmpty ? nil : $0 } ?? nil
        case "fieldstart":
            if line.parts.first.map({ !$0.isEmpty }) == true { fieldConditions.append(line.parts[0]) }
        case "fieldend":
            if line.parts.first.map({ !$0.isEmpty }) == true,
               let idx = fieldConditions.firstIndex(of: line.parts[0]) {
                fieldConditions.remove(at: idx)
            }
        case "sidestart", "sideend":
            guard line.parts.count > 1, !line.parts[1].isEmpty else { break }
            let sideIndex = Self.positionID(line.parts[0]).hasPrefix("p2") ? 1 : 0
            if action == "sidestart" { sideConditions[sideIndex].append(line.parts[1]) }
            else if let idx = sideConditions[sideIndex].firstIndex(of: line.parts[1]) {
                sideConditions[sideIndex].remove(at: idx)
            }
        default:
            // Display-only actions (activate, fail, miss, mega, item, …).
            entries.append(.small(line.joinedParts()))
        }
    }

    // MARK: - helpers

    static func apply(_ hp: HPStatus, to mon: inout BattlePokemon) {
        if hp.numerator != nil { mon.hpNumerator = hp.numerator }
        if hp.denominator != nil { mon.hpDenominator = hp.denominator }
        if hp.status != nil || mon.status != nil && hp.fainted { mon.status = hp.status }
        if hp.fainted { mon.fainted = true }
    }

    /// `p1a: Sparky` → `p1a`; `p1: Bob` → `p1`; no colon → whole string.
    static func positionID(_ ident: String) -> String {
        if let colon = ident.firstIndex(of: ":") { return String(ident[ident.startIndex..<colon]) }
        return ident
    }
}
