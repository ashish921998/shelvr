import Foundation
import Security

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

  public func destination(listID: String? = nil) -> AppLink? {
    if kind == .list {
      return listID.flatMap { AppLink("/shared-list/" + $0 + "?joined=1") }
    }
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
