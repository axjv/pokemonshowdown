import Foundation

/// A chat-room protocol line decoded into something UI-consumable.
public enum RoomEvent: Sendable, Equatable {
    case initRoom(type: String)
    case title(String)
    /// `|users|COUNT,USER,USER,…` — the whole list arrives in one chunk.
    case users(count: Int, users: [RoomUser])
    case join(RoomUser)
    case leave(RoomUser)
    /// `|name|NEW_USER|OLD_ID`
    case rename(newUser: RoomUser, oldUserID: String)
    case chat(ChatMessage)
    /// Server-sent plain text with no leading pipe.
    case rawMessage(String)
    /// `|pm|SENDER|TARGET|MESSAGE` (PM rooms / `|/pm` echoes).
    case pm(sender: RoomUser, target: RoomUser, message: String)
    /// Anything else the app layer may want to handle itself.
    case other(type: String, parts: [String])
}

public enum RoomEventParser {
    public static func parse(_ line: PSLine) -> RoomEvent {
        guard line.isProtocolLine else {
            return .rawMessage(line.type)
        }
        switch line.type {
        case "init":
            return .initRoom(type: line.parts.first ?? "chat")
        case "title":
            return .title(line.joinedParts(from: 0))
        case "users":
            // USERLIST is a single chunk (names contain no pipes).
            let list = line.parts.first ?? ""
            var iterator = list.split(separator: ",", omittingEmptySubsequences: false).makeIterator()
            let count = Int(iterator.next().flatMap { $0.trimmingCharacters(in: .whitespaces) } ?? "") ?? 0
            let users = iterator.map { RoomUser(rawUser: String($0)) }
            return .users(count: count, users: users)
        case "join", "j", "J":
            return .join(RoomUser(rawUser: line.parts.first ?? " "))
        case "leave", "l", "L":
            return .leave(RoomUser(rawUser: line.parts.first ?? " "))
        case "name", "n", "N":
            return .rename(
                newUser: RoomUser(rawUser: line.parts.first ?? " "),
                oldUserID: line.parts.count > 1 ? line.parts[1] : "")
        case "c":
            guard let userChunk = line.parts.first else { break }
            return .chat(ChatMessage(
                sender: RoomUser(rawUser: userChunk),
                message: line.joinedParts(from: 1)))
        case "c:":
            guard line.parts.count >= 2 else { break }
            return .chat(ChatMessage(
                sender: RoomUser(rawUser: line.parts[1]),
                message: line.joinedParts(from: 2),
                timestamp: Int(line.parts[0])))
        case "pm":
            guard line.parts.count >= 2 else { break }
            return .pm(
                sender: RoomUser(rawUser: line.parts[0]),
                target: RoomUser(rawUser: line.parts[1]),
                message: line.joinedParts(from: 2))
        default:
            break
        }
        return .other(type: line.type, parts: line.parts)
    }
}
