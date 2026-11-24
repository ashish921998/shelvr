import CryptoKit
import Foundation
import Security

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

  func delivered(_ token: String) { _ = Keychain.delete(item(token)) }

  private func pending() -> [String] {
    var query = base
    query[kSecReturnData as String] = true
    query[kSecMatchLimit as String] = kSecMatchLimitAll
    var result: CFTypeRef?
    guard SecItemCopyMatching(query as CFDictionary, &result) == errSecSuccess else { return [] }
    return (result as? [Data] ?? []).compactMap { String(data: $0, encoding: .utf8) }
  }

  func drain(revoke: (String) async throws -> Void) async -> Bool {
    await Self.drain(pending: pending(), active: { SiriCredential.current()?.token }, revoke: revoke, delivered: delivered)
    let active = SiriCredential.current()?.token
    return pending().contains { $0 != active }
  }

  static func drain(pending: [String], active: () -> String?, revoke: (String) async throws -> Void, delivered: (String) -> Void) async {
    for token in pending where token != active() {
      do {
        try await revoke(token)
        delivered(token)
      } catch {}
    }
  }
}
