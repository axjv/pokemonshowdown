import SwiftUI
import SwiftData
import PSTeams

/// Teams tab: SwiftData-backed list, paste-import, export-to-clipboard.
struct TeamsView: View {
    @Environment(\.modelContext) private var context
    @Query(sort: \SavedTeam.modifiedAt, order: .reverse) private var teams: [SavedTeam]
    @State private var showingImport = false

    var body: some View {
        NavigationStack {
            Group {
                if teams.isEmpty {
                    ContentUnavailableView(
                        "No teams",
                        systemImage: "shield.lefthalf.filled",
                        description: Text("Paste a Showdown team export to get started."))
                } else {
                    List {
                        ForEach(teams) { team in
                            VStack(alignment: .leading, spacing: 2) {
                                Text(team.label).font(.headline)
                                Text(subtitle(for: team))
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                            }
                            .contextMenu {
                                Button("Copy Export") { copyExport(team) }
                                Button("Delete", role: .destructive) {
                                    context.delete(team)
                                }
                            }
                        }
                    }
                }
            }
            .navigationTitle("Teams")
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        showingImport = true
                    } label: {
                        Image(systemName: "square.and.arrow.down")
                    }
                }
            }
            .sheet(isPresented: $showingImport) {
                ImportTeamSheet { sets, label in
                    guard let json = TeamCodec.exportToJSON(sets) else { return }
                    context.insert(SavedTeam(label: label, setJSON: json))
                }
            }
        }
    }

    private func subtitle(for team: SavedTeam) -> String {
        let sets = TeamCodec.importFromJSON(team.setJSON) ?? []
        let format = team.format.isEmpty ? "" : "\(team.format) · "
        return "\(format)\(sets.count) Pokémon · \(team.modifiedAt.formatted(date: .abbreviated, time: .shortened))"
    }

    private func copyExport(_ team: SavedTeam) {
        guard let sets = TeamCodec.importFromJSON(team.setJSON) else { return }
        UIPasteboard.general.string = TeamCodec.exportTeam(sets)
    }
}

struct ImportTeamSheet: View {
    var onSave: (_ sets: [PokemonSet], _ label: String) -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var text = ""
    @State private var label = ""
    @State private var parseResult: String?

    var body: some View {
        NavigationStack {
            Form {
                Section("Team (export format)") {
                    TextEditor(text: $text)
                        .font(.system(.body, design: .monospaced))
                        .frame(minHeight: 220)
                        .autocorrectionDisabled()
                }
                Section("Name") {
                    TextField("e.g. Rain teams", text: $label)
                }
                if let parseResult {
                    Text(parseResult).foregroundStyle(.red).font(.callout)
                }
            }
            .navigationTitle("Import Team")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Import") { importTapped() }
                }
            }
        }
    }

    private func importTapped() {
        let sets = TeamCodec.importTeam(text)
        guard !sets.isEmpty else {
            parseResult = "No Pokémon found — paste the full export (Nick/species + moves)."
            return
        }
        if sets.count > 6 {
            parseResult = "Too many Pokémon (\(sets.count)); max is 6."
            return
        }
        let name = label.isEmpty ? "\(sets[0].species) team" : label
        onSave(sets, name)
        dismiss()
    }
}
