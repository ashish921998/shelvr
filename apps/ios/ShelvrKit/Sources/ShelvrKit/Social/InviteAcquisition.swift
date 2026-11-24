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

  public static func read() throws -> AcceptedInvite? {
    try Keychain.checkedData(key).map { try JSONDecoder().decode(AcceptedInvite.self, from: $0) }
  }

  public static func set(_ request: AcceptedInvite?) throws {
    let ok: Bool
    if let request {
      ok = Keychain.write(try JSONEncoder().encode(request), to: key,
        accessibility: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly)
    } else { ok = Keychain.delete(key) }
    if !ok { throw CocoaError(.fileWriteUnknown) }
  }
}

@MainActor @Observable
public final class InviteEntry {
  public var preview: PublicInvite?
  public private(set) var accepted: AcceptedInvite?
  public var expired: PublicInvite?
  public var failed = false
  public private(set) var loaded = false
  public private(set) var dispatching: UUID?
  private var queued: AppLink?
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
      if discardUnread { try write(nil); accepted = nil; discardUnread = false }
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
    if dispatching != nil { queued = link; return true }
    if !loaded || accepted != nil {
      discardUnread = true
      if !replace(with: nil) { accepted = nil; loaded = false }
    }
    expired = nil
    preview = PublicInvite(link)
    return preview != nil
  }

  public func cancel() {
    guard dispatching == nil, let current = accepted, replace(with: nil) else { return }
    preview = current.invite
  }

  public func beginDispatch(_ id: UUID) -> Bool {
    guard accepted?.id == id, dispatching == nil else { return false }
    dispatching = id
    return true
  }

  public func endDispatch(_ id: UUID) -> AppLink? {
    guard dispatching == id else { return nil }
    dispatching = nil
    defer { queued = nil }
    return queued
  }

  public func replace(with next: AcceptedInvite?) -> Bool {
    do { try write(next); accepted = next; discardUnread = false; loaded = true; failed = false; return true }
    catch { failed = true; return false }
  }
}
