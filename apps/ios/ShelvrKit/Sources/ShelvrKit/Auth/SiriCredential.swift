import Foundation
import Security

public struct SiriCredential: Codable, Sendable {
  public let owner: String
  public let token: String
  public let siteURL: String
  let subject: String

  private static var query: [String: Any] {
    [kSecClass as String: kSecClassGenericPassword,
      kSecAttrService as String: "app.shelvr.swift.siri", kSecAttrAccount as String: "capture"]
  }

  static var currentSubject: String? {
    guard SignOutMarker(url: URL.applicationSupportDirectory.appending(path: "pending-sign-out")).state == .absent,
      let tokens = KeychainTokenVault().read()
    else { return nil }
    return JWT.claims(of: tokens.token)?.sub
  }

  public static func current() -> Self? {
    guard let subject = currentSubject, let bytes = Keychain.read(query),
      let record = try? JSONDecoder().decode(Self.self, from: bytes), record.subject == subject
    else { return nil }
    return record
  }

  static func store(_ value: Self) throws {
    guard Keychain.write(try JSONEncoder().encode(value), to: query, accessibility: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly) else { throw AuthSessionError.sessionStorageUnavailable }
  }

  @MainActor public func removeIfCurrent() {
    if let bytes = Keychain.read(Self.query),
      (try? JSONDecoder().decode(Self.self, from: bytes))?.token == token {
      _ = Keychain.delete(Self.query)
    }
  }
}

extension Backend {
  @MainActor static func installSiri(_ install: () throws -> Void, revokeOnFailure: () async -> Void) async throws {
    do { try install() }
    catch {
      await revokeOnFailure()
      throw error
    }
  }

  public func prepareSiri(owner: String) async throws {
    guard userID == owner, let subject = SiriCredential.currentSubject,
      subject.split(separator: "|", maxSplits: 1).first.map(String.init) == owner,
      SiriCredential.current()?.owner != owner else { return }
    if let preparingSiri, preparingSiri.subject == subject { return try await preparingSiri.task.value }
    let task = Task { try await issueSiri(subject: subject, owner: owner) }
    preparingSiri = (subject, task)
    defer { if preparingSiri?.subject == subject { preparingSiri = nil } }
    try await task.value
  }

  private func issueSiri(subject: String, owner: String) async throws {
    guard userID == owner, let authorization = KeychainTokenVault().read()?.token else { return }
    let token: String = try await client.action("appIntents:issueCaptureToken")
    guard !Task.isCancelled, userID == owner, SiriCredential.currentSubject == subject,
      let host = environment.convexURL.host(), host.hasSuffix(".convex.cloud") else {
      try? await ConvexHTTPAuthTransport(deployment: environment.convexURL).revokeSiri(token, authorization: authorization)
      return
    }
    let site = "https://" + host.dropLast(".cloud".count) + ".site"
    try await Self.installSiri({
      try SiriCredential.store(SiriCredential(owner: owner, token: token, siteURL: site, subject: subject))
    }, revokeOnFailure: {
      try? await ConvexHTTPAuthTransport(deployment: environment.convexURL).revokeSiri(token, authorization: authorization)
    })
  }
}
