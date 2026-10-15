import Foundation
import Security

/// Saves notes, links, and images straight to the Convex backend, so Siri can capture without
/// launching the JavaScript app. The signed-in app hands over a per-device capture token (see
/// `convex/appIntents.ts`); it lives in the keychain, readable after first unlock so a locked
/// phone can still capture. The server applies the same Pro gate, rate limit, and photo quota as
/// a save made in the app, and every call carries an operation id so a retry never saves twice.
enum ShelvrCapture {
  struct Credentials: Codable {
    let siteUrl: String
    let token: String
  }

  enum Failure: Error, CustomStringConvertible {
    /// No capture token on this device, or the server no longer knows it.
    case signedOut
    /// The account has no active trial or subscription.
    case proRequired
    /// A refusal the user can act on in the app (`photo_limit`, `image_too_large`, ...).
    case refused(String)
    /// Anything else the server answered with (rate limit, server error, bad request).
    case rejected(Int, String)
    case badResponse

    var description: String {
      switch self {
      case .signedOut: return "No capture token. Open Shelvr and sign in."
      case .proRequired: return "Shelvr Pro is required."
      case .refused(let code): return "Shelvr refused the save: \(code)"
      case .rejected(let status, let code): return "Shelvr rejected the save (\(status)): \(code)"
      case .badResponse: return "Shelvr returned an unreadable response."
      }
    }

    /// Whether the app should retry the capture the next time it opens. A missing Pro
    /// entitlement or a refused save would only fail again there, so those are not queued.
    var isRetryableInApp: Bool {
      switch self {
      case .proRequired, .refused: return false
      case .rejected(let status, _): return status == 429 || status >= 500
      case .signedOut, .badResponse: return true
      }
    }
  }

  private static let service = "shelvr.app-intents.capture"
  private static let account = "credentials"

  private static func isAllowedOrigin(_ value: String, bundleIdentifier: String? = Bundle.main.bundleIdentifier) -> Bool {
    guard let url = URLComponents(string: value),
      url.scheme == "https", url.user == nil, url.password == nil,
      url.port == nil, url.query == nil, url.fragment == nil,
      url.path.isEmpty || url.path == "/"
    else { return false }
    if bundleIdentifier == "app.shelvr.save" {
      return url.host == "amiable-setter-120.convex.site"
    }
    guard bundleIdentifier == "app.shelvr.save.dev" || bundleIdentifier == "app.shelvr.save.preview" else { return false }
    return url.host == "amicable-antelope-639.convex.site"
  }

  static func store(_ credentials: Credentials) throws {
    guard isAllowedOrigin(credentials.siteUrl) else { throw Failure.signedOut }
    let data = try JSONEncoder().encode(credentials)
    var query = baseQuery()
    SecItemDelete(query as CFDictionary)
    query[kSecValueData as String] = data
    query[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
    let status = SecItemAdd(query as CFDictionary, nil)
    guard status == errSecSuccess else {
      throw NSError(domain: NSOSStatusErrorDomain, code: Int(status))
    }
  }

  static func clear() {
    SecItemDelete(baseQuery() as CFDictionary)
  }

  static func load() -> Credentials? {
    var query = baseQuery()
    query[kSecReturnData as String] = true
    query[kSecMatchLimit as String] = kSecMatchLimitOne
    var result: CFTypeRef?
    guard SecItemCopyMatching(query as CFDictionary, &result) == errSecSuccess,
      let data = result as? Data
    else {
      return nil
    }
    return try? JSONDecoder().decode(Credentials.self, from: data)
  }

  /// Saves a link or a note and returns the new item id.
  /// Pass the same `operationId` to the app when queuing a failed save, so a save the server
  /// committed before its reply was lost is recognized instead of saved again.
  static func save(
    kind: String, text: String? = nil, url: String? = nil, spaceId: String? = nil, operationId: String
  ) async throws -> String {
    var body: [String: Any] = ["kind": kind, "operationId": operationId]
    body["text"] = text
    body["url"] = url
    body["spaceId"] = spaceId
    let json = try await post(path: "/app-intents/capture", body: body)
    guard let itemId = json["itemId"] as? String else {
      throw Failure.badResponse
    }
    return itemId
  }

  /// Uploads one image and saves it as an image item. `context` is what Siri knew beyond the
  /// pixels (the user's words, text read on the device); it steers the classifier only.
  static func saveImage(
    _ data: Data, contentType: String, aspectRatio: Double?, isSticker: Bool = false,
    spaceId: String? = nil, context: String? = nil, operationId: String
  ) async throws -> String {
    let begin = try await post(path: "/app-intents/image/begin", body: ["operationId": operationId])
    if let itemId = begin["itemId"] as? String {
      return itemId
    }
    guard let uploadUrl = (begin["uploadUrl"] as? String).flatMap(URL.init(string:)) else {
      throw Failure.badResponse
    }

    var request = URLRequest(url: uploadUrl, timeoutInterval: 30)
    request.httpMethod = "POST"
    request.setValue(contentType, forHTTPHeaderField: "Content-Type")
    let (responseData, response) = try await URLSession.shared.upload(for: request, from: data)
    let status = (response as? HTTPURLResponse)?.statusCode ?? 0
    guard status == 200 else {
      throw Failure.rejected(status, "upload_failed")
    }
    let uploaded = (try? JSONSerialization.jsonObject(with: responseData)) as? [String: Any]
    guard let storageId = uploaded?["storageId"] as? String else {
      throw Failure.badResponse
    }

    var body: [String: Any] = ["operationId": operationId, "storageId": storageId]
    body["aspectRatio"] = aspectRatio
    body["isSticker"] = isSticker ? true : nil
    body["spaceId"] = spaceId
    body["context"] = context?.isEmpty == false ? context : nil
    let finish = try await post(path: "/app-intents/image/finish", body: body)
    guard let itemId = finish["itemId"] as? String else {
      throw Failure.badResponse
    }
    return itemId
  }

  /// POSTs JSON to a capture endpoint with the device's token and returns the JSON reply.
  private static func post(path: String, body: [String: Any]) async throws -> [String: Any] {
    guard let credentials = load(), isAllowedOrigin(credentials.siteUrl),
      let endpoint = URL(string: credentials.siteUrl.trimmingCharacters(in: CharacterSet(charactersIn: "/")) + path) else {
      throw Failure.signedOut
    }

    var request = URLRequest(url: endpoint, timeoutInterval: 15)
    request.httpMethod = "POST"
    request.setValue("application/json", forHTTPHeaderField: "Content-Type")
    request.setValue("Bearer \(credentials.token)", forHTTPHeaderField: "Authorization")
    request.httpBody = try JSONSerialization.data(withJSONObject: body)

    let (data, response) = try await URLSession.shared.data(for: request)
    let status = (response as? HTTPURLResponse)?.statusCode ?? 0
    let json = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any]
    let code = json?["error"] as? String ?? ""
    switch status {
    case 200:
      guard let json else { throw Failure.badResponse }
      return json
    case 401:
      // The token was revoked (sign-out, account deletion) or never existed server-side.
      clear()
      throw Failure.signedOut
    case 402:
      throw Failure.proRequired
    case 422:
      throw Failure.refused(code)
    default:
      throw Failure.rejected(status, code)
    }
  }

  static func newOperationId() -> String {
    return "siri:\(UUID().uuidString.lowercased())"
  }

  private static func baseQuery() -> [String: Any] {
    return [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrService as String: service,
      kSecAttrAccount as String: account,
    ]
  }
}
