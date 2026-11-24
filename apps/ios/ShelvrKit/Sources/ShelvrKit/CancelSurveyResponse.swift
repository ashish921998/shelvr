import Foundation
import Security

public enum CancelSurveyResponse: String, Codable, CaseIterable, Sendable {
  case tooExpensive = "too_expensive"
  case notUsefulEnough = "not_useful_enough"
  case missingFeature = "missing_feature"
  case other
  case skipped

  public var outcome: String { self == .skipped ? "dismissed" : "submitted" }

  public func save(for id: String) -> Bool { Keychain.write(Data(rawValue.utf8), to: Self.query(id)) }

  public static func pending(for id: String) -> Self? {
    Keychain.read(query(id)).flatMap { String(data: $0, encoding: .utf8) }.flatMap(Self.init(rawValue:))
  }

  public static func clear(for id: String) { _ = Keychain.delete(query(id)) }

  private static func query(_ id: String) -> [String: Any] {
    [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: "app.shelvr.cancel-survey", kSecAttrAccount as String: id]
  }
}

public enum CancelSurveyEligibility: Equatable, Sendable {
  case unchecked, ineligible, cancelled

  public func forVisit(home: Bool, active: Bool) -> Self {
    home && active ? self : .unchecked
  }
}
