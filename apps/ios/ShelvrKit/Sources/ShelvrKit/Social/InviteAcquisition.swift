import Foundation
import Security
import Observation

public struct PublicInvite: Codable, Equatable, Identifiable, Sendable {
  public enum Kind: String, Codable, Sendable { case list, passport }
  public let kind: Kind
  public let token: String
  public var id: String { kind.rawValue + "/" + token }

  public init?(_ link: AppLink) {
    guard link.path.count == 2, !link.path[1].isEmpty else { return nil }
    switch link.path[0] {
    case "list-invite": kind = .list
    case "passport-invite": kind = .passport
    default: return nil
    }
    token = link.path[1]
  }

  public func destination(listID: String? = nil, passportAvailable: Bool = true) -> AppLink? {
    if kind == .list {
      return listID.flatMap { AppLink("/shared-list/" + $0 + "?joined=1") }
    }
    guard passportAvailable else { return nil }
    var components = URLComponents()
    var allowed = CharacterSet.urlPathAllowed
    allowed.remove(charactersIn: "/?#%")
    guard let encoded = token.addingPercentEncoding(withAllowedCharacters: allowed) else { return nil }
    components.percentEncodedPath = "/passport-invite/" + encoded
    components.queryItems = [.init(name: "compare", value: "1")]
    return components.string.flatMap { AppLink($0) }
  }
}

public struct AcceptedInvite: Codable, Equatable, Sendable {
  public let id: UUID
  public let invite: PublicInvite
  public private(set) var account: String?
  public init(_ invite: PublicInvite) { self.invite = invite; id = UUID() }

  public func bound(to user: String) -> Self? {
    guard account == nil || account == user else { return nil }
    var next = self
    next.account = user
    return next
  }
}

public enum PendingInviteStore {
  private static var key: [String: Any] {
    [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: "app.shelvr.invite",
      kSecAttrAccount as String: "accepted"]
  }

  private static var storage: InviteStorage {
    InviteStorage(marker: SignOutMarker(url: URL.applicationSupportDirectory.appending(path: "discarded-invite")),
      readKey: { try Keychain.checkedData(key) },
      writeKey: { Keychain.write($0, to: key, accessibility: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly) },
      deleteKey: { Keychain.delete(key) })
  }
  public static func read() throws -> AcceptedInvite? { try storage.read() }
  public static func set(_ request: AcceptedInvite?) throws { try storage.set(request) }
}

struct InviteStorage {
  let marker: SignOutMarker
  let readKey: () throws -> Data?
  let writeKey: (Data) -> Bool
  let deleteKey: () -> Bool

  func read() throws -> AcceptedInvite? {
    switch marker.state {
    case .inaccessible: throw CocoaError(.fileReadNoPermission)
    case .pending:
      if deleteKey() { try marker.clear() }
      return nil
    case .absent:
      return try readKey().map { try JSONDecoder().decode(AcceptedInvite.self, from: $0) }
    }
  }

  func set(_ request: AcceptedInvite?) throws {
    if let request {
      guard writeKey(try JSONEncoder().encode(request)) else { throw CocoaError(.fileWriteUnknown) }
      try marker.clear()
    } else {
      try marker.record()
      if deleteKey() { try marker.clear() }
    }
  }
}

public struct InviteNavigation: Sendable {
  public let destination: AppLink
  public let account: String
  public let session: UUID

  public init(destination: AppLink, account: String, session: UUID) {
    self.destination = destination
    self.account = account
    self.session = session
  }
}

@MainActor @Observable
public final class InviteEntry {
  public private(set) var previewRevision = UUID()
  public var preview: PublicInvite? {
    didSet { if oldValue != preview { previewRevision = UUID() } }
  }
  public private(set) var accepted: AcceptedInvite?
  public var expired: PublicInvite?
  public var failed = false
  public private(set) var loaded = false
  public private(set) var dispatching: UUID?
  private var dispatchSession: UUID?
  private var queued: AppLink?
  private var awaitingNavigation: InviteNavigation?
  private var discardUnread = false
  private let read: () throws -> AcceptedInvite?
  private let write: (AcceptedInvite?) throws -> Void

  public init(read: @escaping () throws -> AcceptedInvite? = PendingInviteStore.read,
    write: @escaping (AcceptedInvite?) throws -> Void = PendingInviteStore.set) {
    self.read = read
    self.write = write
    restore()
  }

  public func restore() {
    do {
      if discardUnread {
        try write(nil)
        accepted = nil
        discardUnread = false
        if let queued { preview = PublicInvite(queued); self.queued = nil }
      }
      else { accepted = try read() }
      loaded = true
      failed = false
    } catch { failed = true }
  }

  public func accept(_ invite: PublicInvite, account: String? = nil) {
    guard preview == invite, dispatching == nil else { return }
    let consent = AcceptedInvite(invite)
    guard replace(with: account.flatMap { consent.bound(to: $0) } ?? consent) else { return }
    preview = nil
  }

  public func route(_ link: AppLink) -> Bool {
    if dispatching != nil || awaitingNavigation != nil { queued = link; return true }
    guard let incoming = PublicInvite(link) else {
      if accepted != nil { queued = link; return true }
      preview = nil
      expired = nil
      return false
    }
    queued = nil
    if !loaded || accepted != nil {
      discardUnread = true
      if !replace(with: nil) { accepted = nil; loaded = false; queued = link; preview = nil; return true }
    }
    expired = nil
    preview = incoming
    return true
  }

  @discardableResult public func cancel(keepPreview: Bool = true) -> AppLink? {
    guard dispatching == nil, let current = accepted, replace(with: nil) else { return nil }
    preview = keepPreview && queued == nil ? current.invite : nil
    defer { queued = nil }
    return queued
  }

  public func waitsForDispatch(from session: UUID) -> Bool {
    guard let dispatchSession else { return false }
    return dispatchSession != session
  }

  public func beginDispatch(_ id: UUID, session: UUID) -> Bool {
    guard accepted?.id == id, dispatching == nil else { return false }
    dispatching = id
    dispatchSession = session
    return true
  }

  public func endDispatch(_ id: UUID, navigation: InviteNavigation? = nil) -> AppLink? {
    guard dispatching == id else { return nil }
    dispatching = nil
    dispatchSession = nil
    if let navigation { awaitingNavigation = navigation; return nil }
    return takeQueuedLink()
  }

  public func destination(account: String?, session: UUID) -> AppLink? {
    guard let navigation = awaitingNavigation, navigation.account == account, navigation.session == session else { return nil }
    return navigation.destination
  }

  public func didNavigate(to link: AppLink, account: String?, session: UUID) -> AppLink? {
    guard destination(account: account, session: session) == link else { return nil }
    awaitingNavigation = nil
    return takeQueuedLink()
  }

  public func discardNavigation(unless session: UUID) -> AppLink? {
    guard let navigation = awaitingNavigation, navigation.session != session else { return nil }
    awaitingNavigation = nil
    return takeQueuedLink()
  }

  private func takeQueuedLink() -> AppLink? {
    defer { queued = nil }
    return queued
  }

  public func replace(with next: AcceptedInvite?) -> Bool {
    do { try write(next); accepted = next; discardUnread = false; loaded = true; failed = false; return true }
    catch { failed = true; return false }
  }
}
