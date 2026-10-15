import XCTest
@testable import PSProtocol

final class RoomUserTests: XCTestCase {
    func testRankPrefix() {
        let user = RoomUser(rawUser: "@Bob")
        XCTAssertEqual(user.rank, .mod)
        XCTAssertEqual(user.name, "Bob")
        XCTAssertFalse(user.away)
    }

    func testUnrankedKeepsLeadingSpace() {
        let user = RoomUser(rawUser: " Alice")
        XCTAssertEqual(user.rank, .none)
        XCTAssertEqual(user.name, "Alice")
    }

    func testAwaySuffix() {
        let user = RoomUser(rawUser: "+Carol@!")
        XCTAssertEqual(user.rank, .voice)
        XCTAssertEqual(user.name, "Carol")
        XCTAssertTrue(user.away)
    }

    func testModAwaySuffix() {
        let user = RoomUser(rawUser: "@Bob@!")
        XCTAssertEqual(user.rank, .mod)
        XCTAssertEqual(user.name, "Bob")
        XCTAssertTrue(user.away)
    }

    func testBot() {
        let user = RoomUser(rawUser: "*Carnivine Bot")
        XCTAssertEqual(user.rank, .bot)
        XCTAssertEqual(user.name, "Carnivine Bot")
    }
}

final class RoomEventTests: XCTestCase {
    func testUsersList() {
        let line = PSLine(parsing: "|users|3,+Alice,Bob,*Carnivine Bot")
        guard case let .users(count, users) = RoomEventParser.parse(line) else {
            return XCTFail("expected users event")
        }
        XCTAssertEqual(count, 3)
        XCTAssertEqual(users.map { $0.name }, ["Alice", "Bob", "Carnivine Bot"])
        XCTAssertEqual(users.map { $0.rank }, [.voice, .none, .bot])
    }

    func testChatWithTimestamp() {
        let line = PSLine(parsing: "|c:1718294030|@Bob|hello world")
        guard case let .chat(msg) = RoomEventParser.parse(line) else {
            return XCTFail("expected chat event")
        }
        XCTAssertEqual(msg.timestamp, 1718294030)
        XCTAssertEqual(msg.sender.name, "Bob")
        XCTAssertEqual(msg.message, "hello world")
    }

    func testChatWithPipesInMessage() {
        let line = PSLine(parsing: "|c| Alice|a|b|c")
        guard case let .chat(msg) = RoomEventParser.parse(line) else {
            return XCTFail("expected chat event")
        }
        XCTAssertEqual(msg.message, "a|b|c")
    }

    func testJoinLeaveRename() {
        XCTAssertEqual(
            RoomEventParser.parse(PSLine(parsing: "|join|+Alice")),
            .join(RoomUser(rawUser: "+Alice")))
        XCTAssertEqual(
            RoomEventParser.parse(PSLine(parsing: "|leave| Bob")),
            .leave(RoomUser(rawUser: " Bob")))
        let rename = RoomEventParser.parse(PSLine(parsing: "|name|Bob|oldid"))
        guard case let .rename(newUser, oldID) = rename else { return XCTFail("expected rename") }
        XCTAssertEqual(newUser.name, "Bob")
        XCTAssertEqual(oldID, "oldid")
    }

    func testUnknownFallsThrough() {
        let event = RoomEventParser.parse(PSLine(parsing: "|chatmsg|something"))
        XCTAssertEqual(event, .other(type: "chatmsg", parts: ["something"]))
    }
}
