import CryptoKit
import Foundation

public struct AppleNonce: Sendable, Equatable {
  public let raw: String

  public init(raw: String = UUID().uuidString.lowercased()) {
    self.raw = raw
  }

  public var hashed: String {
    SHA256.hash(data: Data(raw.utf8)).map { String(format: "%02x", $0) }.joined()
  }
}
