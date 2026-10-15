import Foundation

/// A decoded frame received from the server: which room it targets, and the
/// payload lines (which still need `PSLine` parsing).
public struct ServerFrame: Sendable, Equatable {
    /// Room this frame targets; `nil` means global/lobby (no `>` header).
    public let roomID: String?
    /// Payload lines; blank lines already removed.
    public let lines: [String]

    public init(roomID: String?, lines: [String]) {
        self.roomID = roomID
        self.lines = lines
    }
}

/// WebSocket text-frame codec. Verified against the live server and the
/// official client's `receive()` handling — see docs/PROTOCOL-NOTES.md.
public enum Wire {
    /// Decode one raw WebSocket text frame from the server.
    ///
    /// Room-scoped frames look like:
    ///
    ///     >ROOMID
    ///     MESSAGE
    ///     MESSAGE
    ///
    /// The `>ROOMID` header is omitted for lobby/global frames. A MESSAGE can
    /// never start with `>`, so the check for a leading `>` is unambiguous.
    public static func decodeServerFrame(_ raw: String) -> ServerFrame {
        var text = raw
        if text.hasSuffix("\n") { text = String(text.dropLast()) }
        var roomID: String?
        if text.hasPrefix(">") {
            if let nl = text.firstIndex(of: "\n") {
                let room = text[text.index(after: text.startIndex)..<nl]
                if !room.isEmpty { roomID = String(room) }
                text = String(text[text.index(after: nl)...])
            } else {
                // Header with no payload: the target room is still named.
                if text.count > 1 { roomID = String(text.dropFirst()) }
                text = ""
            }
        }
        let lines = text.components(separatedBy: "\n").filter { !$0.isEmpty }
        return ServerFrame(roomID: roomID, lines: lines)
    }

    /// Encode a client message as `ROOMID|TEXT` (`|TEXT` when room is nil/empty).
    public static func encodeClientMessage(_ text: String, roomID: String? = nil) -> String {
        "\(roomID ?? "")|\(text)"
    }
}
