import SwiftUI
import PSNet

/// M1: proves the wire works — connect to the configured server and watch
/// decoded frames. Laddering UI lands in M3.
struct LadderView: View {
    @Environment(AppState.self) private var appState

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                HStack(spacing: 12) {
                    statusPill
                    Text(appState.server.host)
                        .font(.callout.monospaced())
                    Spacer()
                    Button {
                        switch appState.connection {
                        case .disconnected: appState.connect()
                        default: appState.disconnect()
                        }
                    } label: {
                        Text(appState.connection == .disconnected ? "Connect" : "Disconnect")
                            .buttonStyle(.borderedProminent)
                    }
                    .disabled(appState.connection == .connecting)
                }
                .padding()

                List(appState.recentFrames, id: \.self) { frame in
                    Text(frame)
                        .font(.system(.caption, design: .monospaced))
                        .lineLimit(2)
                }
                .overlay {
                    if appState.recentFrames.isEmpty {
                        ContentUnavailableView(
                            "No data yet",
                            systemImage: "antenna.radiowaves.left.and.right",
                            description: Text("Press Connect to talk to \(appState.server.host)."))
                    }
                }
            }
            .navigationTitle("Ladder")
        }
    }

    private var statusPill: some View {
        let (text, color): (String, Color) = switch appState.connection {
        case .disconnected: ("Offline", .secondary)
        case .connecting: ("Connecting…", .orange)
        case .connected: ("Online", .green)
        }
        return HStack(spacing: 4) {
            Circle().fill(color).frame(width: 8, height: 8)
            Text(text).font(.callout)
        }
    }
}
