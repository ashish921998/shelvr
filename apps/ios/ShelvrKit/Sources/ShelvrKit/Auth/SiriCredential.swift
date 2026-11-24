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

  static func activeForRevocation() -> SiriRevocationEligibility {
    let marker = SignOutMarker(url: URL.applicationSupportDirectory.appending(path: "pending-sign-out"))
    switch marker.state {
    case .pending: return .absent
    case .inaccessible: return .unavailable
    case .absent: break
    }
    do {
      guard let bytes = try Keychain.checkedData(query) else { return .absent }
      let record = try JSONDecoder().decode(Self.self, from: bytes)
      guard let auth = try KeychainTokenVault().checkedTokens() else { return .absent }
      guard let subject = JWT.claims(of: auth.token)?.sub else { return .unavailable }
      return subject == record.subject ? .active(record.token) : .absent
    } catch { return .unavailable }
  }

  static func stored() -> Self? {
    Keychain.read(query).flatMap { try? JSONDecoder().decode(Self.self, from: $0) }
  }

  public static func current() -> Self? {
    guard let subject = currentSubject, let record = stored(), record.subject == subject
    else { return nil }
    return record
  }

  func enqueueRevocation() throws {
    guard let url = URL(string: siteURL), url.scheme == "https" else { throw URLError(.badURL) }
    try SiriRevocations(site: url).remember(token)
  }

  static func store(_ value: Self) throws {
    if let old = stored(), old.token != value.token { try old.enqueueRevocation() }
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
    guard status == .signedIn, let subject = SiriCredential.currentSubject,
      subject.split(separator: "|", maxSplits: 1).first.map(String.init) == owner,
      SiriCredential.current()?.owner != owner else { return }
    if let preparingSiri, preparingSiri.subject == subject { return try await preparingSiri.task.value }
    let task = Task { try await issueSiri(subject: subject, owner: owner) }
    preparingSiri = (subject, task)
    defer { if preparingSiri?.subject == subject { preparingSiri = nil } }
    try await task.value
  }

  private func issueSiri(subject: String, owner: String) async throws {
    guard let authorization = KeychainTokenVault().read()?.token else { return }
    let token: String = try await client.action("appIntents:issueCaptureToken")
    guard !Task.isCancelled, status == .signedIn, SiriCredential.currentSubject == subject,
      let host = environment.convexURL.host(), host.hasSuffix(".convex.cloud") else {
      await revokeSiriToken(token, authorization: authorization)
      return
    }
    let site = "https://" + host.dropLast(".cloud".count) + ".site"
    try await Self.installSiri({
      try SiriCredential.store(SiriCredential(owner: owner, token: token, siteURL: site, subject: subject))
      retrySiriRevocations()
    }, revokeOnFailure: {
      await revokeSiriToken(token, authorization: authorization)
    })
  }
}

extension Backend {
  var siriRevocations: SiriRevocations? { SiriRevocations.site(for: environment.convexURL).map(SiriRevocations.init(site:)) }

  func rememberSiriRevocation(_ token: String) {
    guard let siriRevocations else { return }
    siriBacklog.remember(token, persist: siriRevocations.remember)
  }

  func revokeSiriToken(_ token: String, authorization: String) async {
    rememberSiriRevocation(token)
    do {
      try await ConvexHTTPAuthTransport(deployment: environment.convexURL).revokeSiri(token, authorization: authorization)
      siriBacklog.confirmed(token)
      if siriRevocations?.delivered(token) == false { retrySiriRevocations() }
    } catch { retrySiriRevocations() }
  }

  func retrySiriRevocations() {
    siriDrainRequested = true
    guard siriDrain == nil, let siriRevocations else { return }
    siriDrain = Task {
      let transport = ConvexHTTPAuthTransport(deployment: environment.convexURL)
      var delay = 5
      while !Task.isCancelled {
        siriDrainRequested = false
        for token in siriBacklog.unpersisted { rememberSiriRevocation(token) }
        let stored = try? siriRevocations.pending()
        let candidates = siriBacklog.candidates(stored: stored)
        let failed = await SiriRevocations.drain(pending: Array(candidates), active: SiriCredential.activeForRevocation,
          revoke: transport.revokePresentedSiri) { token in
          siriBacklog.confirmed(token)
          return siriRevocations.delivered(token)
        }
        let pending = failed || stored == nil
        if pending {
          do { try await Task.sleep(for: .seconds(delay)) } catch { break }
          delay = min(300, delay * 2)
        } else if !siriDrainRequested { break }
      }
      siriDrain = nil
    }
  }
}
