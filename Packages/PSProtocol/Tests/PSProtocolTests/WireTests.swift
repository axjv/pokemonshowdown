import XCTest
@testable import PSProtocol

final class WireTests: XCTestCase {
    func testLobbyFrameWithoutHeader() {
        let frame = Wire.decodeServerFrame("|updateuser| Guest 1234|0|1|{}")
        XCTAssertNil(frame.roomID)
        XCTAssertEqual(frame.lines, ["|updateuser| Guest 1234|0|1|{}"])
    }

    func testRoomScopedFrame() {
        let raw = ">battle-abc\n|init|battle\n|title|Alice vs. Bob"
        let frame = Wire.decodeServerFrame(raw)
        XCTAssertEqual(frame.roomID, "battle-abc")
        XCTAssertEqual(frame.lines, ["|init|battle", "|title|Alice vs. Bob"])
    }

    func testHeaderOnlyFrameIsEmpty() {
        let frame = Wire.decodeServerFrame(">lobby")
        XCTAssertEqual(frame.roomID, "lobby")
        XCTAssertEqual(frame.lines, [])
    }

    func testTrailingNewlinesAndBlanksIgnored() {
        let frame = Wire.decodeServerFrame("|a\n\n|b\n")
        XCTAssertEqual(frame.lines, ["|a", "|b"])
    }

    func testEncodeClientMessage() {
        XCTAssertEqual(Wire.encodeClientMessage("/join lobby"), "|/join lobby")
        XCTAssertEqual(Wire.encodeClientMessage("/choose 1", roomID: "battle-abc"),
                       "battle-abc|/choose 1")
    }

    func testFixtureFrames() throws {
        // fixtures/replays/connect.frames.txt — blank-line-separated raw frames.
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent() // …/PSProtocolTests
            .deletingLastPathComponent() // …/Tests
            .deletingLastPathComponent() // …/PSProtocol
            .deletingLastPathComponent() // …/Packages
            .deletingLastPathComponent() // repo root
            .appendingPathComponent("fixtures/replays/connect.frames.txt")
        let text = try String(contentsOf: url, encoding: .utf8)
        let frames = text.components(separatedBy: "\n\n")
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }
        XCTAssertEqual(frames.count, 5)

        let decoded = frames.map(Wire.decodeServerFrame)
        XCTAssertNil(decoded[0].roomID)
        XCTAssertTrue(decoded[0].lines[0].hasPrefix("|updateuser|"))
        XCTAssertTrue(decoded[2].lines[0].hasPrefix("|challstr|"))
        XCTAssertEqual(decoded[3].roomID, "lobby")
        XCTAssertEqual(decoded[3].lines.count, 3)
        XCTAssertEqual(decoded[4].roomID, "battle-gen9ou-1234")
    }
}

final class PSLineTests: XCTestCase {
    func testChatLineWithPipesInMessage() {
        let line = PSLine(parsing: "|c|@Bob|a|b|c")
        XCTAssertTrue(line.isProtocolLine)
        XCTAssertEqual(line.type, "c")
        XCTAssertEqual(line.joinedParts(from: 1), "a|b|c")
    }

    func testRawLine() {
        let line = PSLine(parsing: "Some announcement")
        XCTAssertFalse(line.isProtocolLine)
        XCTAssertEqual(line.type, "Some announcement")
    }

    func testToID() {
        XCTAssertEqual(toID("Mr. Mime"), "mrmime")
        XCTAssertEqual(toID("Cinderace-Gmax"), "cinderacegmax")
        XCTAssertEqual(toID("Tapu Koko"), "tapukoko")
    }
}
