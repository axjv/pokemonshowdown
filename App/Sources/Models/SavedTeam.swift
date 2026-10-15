import Foundation
import SwiftData

/// A saved team. Sets are stored as the PS JSON team format (`PokemonSet[]`),
/// so exports/imports round-trip exactly; packed form is derived on demand.
@Model
public final class SavedTeam {
    @Attribute(.unique) public var id: UUID
    public var label: String
    /// Format ID the team was built for ("" = unknown).
    public var format: String
    public var setJSON: String
    public var modifiedAt: Date

    public init(id: UUID = UUID(), label: String, format: String = "",
                setJSON: String, modifiedAt: Date = .init()) {
        self.id = id
        self.label = label
        self.format = format
        self.setJSON = setJSON
        self.modifiedAt = modifiedAt
    }
}
