import Foundation

/// Pokémon Showdown's canonical identifier transform (`toID` in PS's code):
/// lower-case alphanumeric only — `toID("Mr. Mime") == "mrmime"`.
/// Species/items/moves/abilities in the JSON and packed team formats, room
/// IDs, and user IDs all go through this.
public func toID(_ text: some StringProtocol) -> String {
    var out = ""
    out.reserveCapacity(text.count)
    for char in text.lowercased() where char.isASCII {
        if (char >= "a" && char <= "z") || (char >= "0" && char <= "9") {
            out.append(char)
        }
    }
    return out
}
