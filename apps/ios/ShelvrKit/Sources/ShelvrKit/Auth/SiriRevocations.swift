import CryptoKit
import Foundation
import Security

struct SiriRevocationBacklog: Sendable {
  private(set) var unpersisted = Set<String>()

  mutating func remember(_ token: String, persist: (String) throws -> Void) {
    do {
      try persist(token)
      unpersisted.remove(token)
    } catch { unpersisted.insert(token) }
  }

  mutating func confirmed(_ token: String) { unpersisted.remove(token) }

  func candidates(stored: [String]?) -> Set<String> { unpersisted.union(stored ?? []) }
}

struct SiriRevocations: Sendable {
  let site: URL

  init(site: URL) { self.site = site }

  static func site(for deployment: URL) -> URL? {
    guard let host = deployment.host(), host.hasSuffix(".convex.cloud") else { return nil }
    return URL(string: "https://" + host.dropLast(".cloud".count) + ".site")
  }

  private var base: [String: Any] {
    [kSecClass as String: kSecClassGenericPassword,
      kSecAttrService as String: "app.shelvr.swift.siri.revocations." + (site.host() ?? "")]
  }

  private func item(_ token: String) -> [String: Any] {
    base.merging([kSecAttrAccount as String: Data(SHA256.hash(data: Data(token.utf8))).base64EncodedString()]) { $1 }
  }

  func remember(_ token: String) throws {
    guard Keychain.write(Data(token.utf8), to: item(token), accessibility: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly)
    else { throw AuthSessionError.sessionStorageUnavailable }
  }

  @discardableResult
  func delivered(_ token: String) -> Bool { Keychain.delete(item(token)) }

  private func matches(_ query: [String: Any]) throws -> CFTypeRef? {
    var result: CFTypeRef?
    let status = SecItemCopyMatching(query as CFDictionary, &result)
    if status == errSecItemNotFound { return nil }
    guard status == errSecSuccess else { throw NSError(domain: NSOSStatusErrorDomain, code: Int(status)) }
    return result
  }

  func pending() throws -> [String] {
    var query = base
    query[kSecReturnAttributes as String] = true
    query[kSecMatchLimit as String] = kSecMatchLimitAll
    guard let records = try matches(query) else { return [] }
    guard let rows = records as? [[String: Any]] else { throw CocoaError(.coderReadCorrupt) }
    return try rows.compactMap { row in
      guard let account = row[kSecAttrAccount as String] as? String else { throw CocoaError(.coderReadCorrupt) }
      var read = base
      read[kSecAttrAccount as String] = account
      read[kSecReturnData as String] = true
      guard let value = try matches(read) else { return nil }
      guard let data = value as? Data, let token = String(data: data, encoding: .utf8) else { throw CocoaError(.coderReadCorrupt) }
      return token
    }
  }

  @MainActor static func drain(
    pending: [String], active: () -> String?, revoke: (String) async throws -> Void, delivered: (String) -> Bool
  ) async -> Bool {
    var needsRetry = false
    for token in pending where token != active() {
      do {
        try await revoke(token)
        if !delivered(token) { needsRetry = true }
      } catch { needsRetry = true }
    }
    return needsRetry
  }
}
