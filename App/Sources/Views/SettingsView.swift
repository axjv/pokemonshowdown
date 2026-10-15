import SwiftUI
import PSNet

struct SettingsView: View {
    @Environment(AppState.self) private var appState

    var body: some View {
        @Bindable var appState = appState
        NavigationStack {
            Form {
                Section("Server") {
                    TextField("Sim host", text: $appState.server.host)
                        .autocorrectionDisabled()
                    TextField("Port", value: $appState.server.port, format: .number)
                    Toggle("Use TLS (wss)", isOn: $appState.server.secure)
                    TextField("Websocket path", text: $appState.server.socketPath)
                        .autocorrectionDisabled()
                    TextField("Login host", text: $appState.server.loginHost)
                        .autocorrectionDisabled()
                }
                Section {
                    Button("Apply & Reconnect") {
                        appState.reconnectWithCurrentServer()
                    }
                    Button("Reset to Official Showdown") {
                        appState.server = .official
                    }
                } footer: {
                    Text("Official: sim3.psim.us:443, path /showdown/websocket, login at play.pokemonshowdown.com. Private servers usually use port 8000 with TLS off.")
                }
                Section("Account") {
                    Text("Sign-in arrives with milestone M2 (username + password stored in the Keychain).")
                        .font(.callout)
                        .foregroundStyle(.secondary)
                }
            }
            .navigationTitle("Settings")
        }
    }
}

struct ChatView: View {
    var body: some View {
        ContentUnavailableView(
            "Chat & PMs",
            systemImage: "bubble.left.and.bubble.right",
            description: Text("Lobby chat, PMs, and room list arrive with milestone M2."))
    }
}

struct ReplaysView: View {
    var body: some View {
        ContentUnavailableView(
            "Replays",
            systemImage: "play.circle",
            description: Text("Replay browsing and playback arrive with milestone M6."))
    }
}
