import Foundation
import PSProtocol

/// Resilient Showdown WebSocket client: framing, keepalive pings, and
/// exponential-backoff reconnects, exposed as `AsyncStream`s.
public actor PSClient {
    public enum State: String, Sendable, Equatable {
        case disconnected, connecting, connected
    }

    public struct Options: Sendable, Equatable {
        public var server: ServerConfig
        public var autoReconnect: Bool
        /// Send `|/cmd ping` this often (PS servers time out idle sockets).
        public var keepAliveInterval: TimeInterval

        public init(server: ServerConfig = .official, autoReconnect: Bool = true,
                    keepAliveInterval: TimeInterval = 25) {
            self.server = server
            self.autoReconnect = autoReconnect
            self.keepAliveInterval = keepAliveInterval
        }
    }

    private var options: Options
    private var state: State = .disconnected
    private var socket: URLSessionWebSocketTask?
    private var keepAliveTask: Task<Void, Never>?
    private var reconnectTask: Task<Void, Never>?
    private var outbox: [String] = []
    private var generation = 0
    private var reconnectAttempt = 0
    private var frameStreams: [UUID: AsyncStream<ServerFrame>.Continuation] = [:]
    private var stateStreams: [UUID: AsyncStream<State>.Continuation] = [:]
    private let session: URLSession

    public init(options: Options = Options()) {
        self.options = options
        let config = URLSessionConfiguration.default
        config.waitsForConnectivity = false
        self.session = URLSession(configuration: config)
    }

    // MARK: - public API

    public func currentOptions() -> Options { options }
    public func currentState() -> State { state }

    /// Hot-swap server; reconnects if currently connected/connecting.
    public func setServer(_ server: ServerConfig) {
        guard server != options.server else { return }
        options.server = server
        reconnectTask?.cancel()
        socket?.cancel(with: .goingAway, reason: nil)
        socket = nil
        generation += 1
        if state != .disconnected {
            startConnection()
        }
    }

    public func connect() {
        reconnectAttempt = 0
        reconnectTask?.cancel()
        startConnection()
    }

    public func disconnect() {
        reconnectAttempt = 0
        reconnectTask?.cancel()
        keepAliveTask?.cancel()
        keepAliveTask = nil
        socket?.cancel(with: .goingAway, reason: nil)
        socket = nil
        generation += 1
        setState(.disconnected)
    }

    /// Queue a room-scoped message (`/choose 1` → `battle-1|/choose 1`).
    public func send(_ text: String, to roomID: String? = nil) {
        let frame = Wire.encodeClientMessage(text, roomID: roomID)
        if let socket {
            socket.send(.string(frame)) { _ in }
        } else {
            outbox.append(frame)
        }
    }

    public func frames() -> AsyncStream<ServerFrame> {
        let (stream, continuation) = AsyncStream<ServerFrame>.makeStream()
        let id = UUID()
        frameStreams[id] = continuation
        continuation.onTermination = { [weak self] _ in
            Task { await self?.frameStreams.removeValue(forKey: id) }
        }
        return stream
    }

    public func states() -> AsyncStream<State> {
        let (stream, continuation) = AsyncStream<State>.makeStream()
        let id = UUID()
        stateStreams[id] = continuation
        continuation.yield(state)
        continuation.onTermination = { [weak self] _ in
            Task { await self?.stateStreams.removeValue(forKey: id) }
        }
        return stream
    }

    // MARK: - connection lifecycle

    private func startConnection() {
        guard let url = options.server.wsURL else { setState(.disconnected); return }
        keepAliveTask?.cancel()
        socket?.cancel(with: .goingAway, reason: nil)

        generation += 1
        let gen = generation
        let task = session.webSocketTask(with: url)
        socket = task
        setState(.connecting)
        task.resume()

        for frame in outbox {
            task.send(.string(frame)) { _ in }
        }
        outbox.removeAll()

        startReceiveLoop(task: task, generation: gen)
        startKeepAlive(generation: gen)
    }

    private func startReceiveLoop(task: URLSessionWebSocketTask, generation gen: Int) {
        Task { [weak self] in
            while !Task.isCancelled {
                do {
                    let message = try await task.receive()
                    await self?.handleMessage(message, generation: gen)
                } catch {
                    await self?.handleDisconnect(task: task, generation: gen)
                    break
                }
            }
        }
    }

    private func startKeepAlive(generation gen: Int) {
        let interval = options.keepAliveInterval
        keepAliveTask = Task { [weak self] in
            while !Task.isCancelled {
                try? await Task.sleep(nanoseconds: UInt64(interval * 1_000_000_000))
                if Task.isCancelled { break }
                await self?.sendPing(generation: gen)
            }
        }
    }

    private func sendPing(generation gen: Int) {
        guard gen == generation, let socket, state == .connected else { return }
        socket.send(.string("|/cmd ping")) { _ in }
    }

    private func handleMessage(_ message: URLSessionWebSocketTask.Message, generation gen: Int) {
        guard gen == generation else { return }
        guard case let .string(text) = message else { return }
        if state != .connected {
            reconnectAttempt = 0
            setState(.connected)
        }
        let frame = Wire.decodeServerFrame(text)
        for continuation in frameStreams.values { continuation.yield(frame) }
    }

    private func handleDisconnect(task: URLSessionWebSocketTask, generation gen: Int) {
        guard gen == generation, state != .disconnected else { return }
        keepAliveTask?.cancel()
        keepAliveTask = nil
        socket = nil
        setState(.disconnected)
        guard options.autoReconnect else { return }
        let delay = min(30.0, 2.0 * pow(2.0, Double(reconnectAttempt)))
        reconnectAttempt += 1
        reconnectTask = Task { [weak self] in
            try? await Task.sleep(nanoseconds: UInt64(delay * 1_000_000_000))
            guard !Task.isCancelled else { return }
            await self?.startConnection()
        }
    }

    private func setState(_ newState: State) {
        guard state != newState else { return }
        state = newState
        for continuation in stateStreams.values { continuation.yield(newState) }
    }
}
