// swift-tools-version:5.9
import PackageDescription

let package = Package(
    name: "PSNet",
    platforms: [.iOS(.v17), .macOS(.v13)],
    products: [
        .library(name: "PSNet", targets: ["PSNet"])
    ],
    dependencies: [
        .package(path: "../PSProtocol")
    ],
    targets: [
        .target(name: "PSNet", dependencies: ["PSProtocol"]),
        .testTarget(name: "PSNetTests", dependencies: ["PSNet"])
    ]
)
