import Foundation

/// Chat permission rank, from the first character of a PS user string.
public enum Rank: Character, Sendable, Equatable {
    case none = " "
    case voice = "+"
    case driver = "%"
    case mod = "@"
    case leader = "&"
    case host = "~"
    case admin = "#"
    case official = "!"
    case bot = "*"
}

/// A user as they appear in a chat room line (`@Bob`), the `|users|` list
/// (`@Bob@12` when they have a status), or join/leave events.
public struct RoomUser: Sendable, Equatable {
    public let rank: Rank
    public let name: String
    /// Away marker: userlist entries append `@!` (or a `@status` string).
    public let away: Bool

    public init(rawUser: String) {
        var text = rawUser
        var away = false
        // Userlist entries may append a status string: `@Bob@!` (away),
        // `@Bob@12` (busy/idle token). The separator `@` is never the first
        // char (that position is the rank prefix), so search after it.
        if text.count > 1 {
            let searchRange = text.index(after: text.startIndex)..<text.endIndex
            if let at = text.range(of: "@", range: searchRange) {
                away = text[at.lowerBound...] == "@!"
                text = String(text[..<at.lowerBound])
            }
        }
        if let first = text.first, let rank = Rank(rawValue: first) {
            self.rank = rank
            self.name = String(text.dropFirst())
        } else {
            self.rank = .none
            self.name = text
        }
        self.away = away
    }

    /// Name as displayed (rank character stripped).
    public var displayName: String { name }
}

/// A parsed `|c|`/`|c:|` chat message.
public struct ChatMessage: Sendable, Equatable {
    public let sender: RoomUser
    public let message: String
    /// Unix seconds, present only for `|c:` lines.
    public let timestamp: Int?

    public init(sender: RoomUser, message: String, timestamp: Int? = nil) {
        self.sender = sender
        self.message = message
        self.timestamp = timestamp
    }
}
