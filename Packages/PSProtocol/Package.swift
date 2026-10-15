// swift-tools-version:5.9
import PackageDescription

let package = Package(
    name: "PSProtocol",
    platforms: [.iOS(.v17), .macOS(.v13)],
    products: [
        .library(name: "PSProtocol", targets: ["PSProtocol"])
    ],
    targets: [
        .target(name: "PSProtocol"),
        .testTarget(name: "PSProtocolTests", dependencies: ["PSProtocol"])
    ]
)
