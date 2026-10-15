import Foundation

/// One protocol line: either `|TYPE|PART|PART…` (a protocol line) or a raw
/// display line with no leading pipe (the server occasionally sends those).
///
/// Message text can itself contain `|`, so use `parts.joined(separator: "|")`
/// (or suffix helpers) rather than assuming fixed column counts.
public struct PSLine: Sendable, Equatable {
    /// Whether the original line started with `|`.
    public let isProtocolLine: Bool
    /// Chunk after the leading `|` (`c`, `join`, `move`, …) — or the whole
    /// raw text for non-protocol lines.
    public let type: String
    /// Remaining chunks, raw (not re-joined).
    public let parts: [String]

    public init(parsing line: String) {
        isProtocolLine = line.hasPrefix("|")
        var chunks = line.components(separatedBy: "|")
        if isProtocolLine { chunks.removeFirst() }
        let first = chunks.first ?? ""
        if isProtocolLine && first.hasPrefix("c:") {
            // Timestamped chat (`|c:TS|USER|…`) carries the timestamp inside
            // the chunk; split it out so `type == "c:"` and parts[0] is the TS,
            // matching how the official client handles `c:` lines.
            type = "c:"
            parts = [String(first.dropFirst(2))] + Array(chunks.dropFirst())
        } else {
            type = first
            parts = Array(chunks.dropFirst())
        }
    }

    /// All parts joined back with `|` (restores message text).
    public func joinedParts(from index: Int = 0) -> String {
        guard index < parts.count else { return "" }
        return parts[index...].joined(separator: "|")
    }
}
