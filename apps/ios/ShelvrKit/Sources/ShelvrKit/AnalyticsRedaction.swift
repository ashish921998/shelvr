import Foundation

public enum AnalyticsRedaction {
  public static func properties(_ input: [String: Any], event: String) -> [String: Any] {
    var safe = input
    if event == "Application Opened" { safe.removeValue(forKey: "url") }
    guard event == "$exception" else { return safe }
    safe.removeValue(forKey: "$exception_message")
    if let chain = safe["$exception_list"] as? [[String: Any]] {
      safe["$exception_list"] = chain.map { item in
        var result = item
        let type = item["type"] as? String ?? "Error"
        let safeType = type.wholeMatch(of: /[A-Za-z][A-Za-z0-9]{0,60}/) == nil ? "Error" : type
        result["type"] = safeType
        result["value"] = safeType
        if var mechanism = result["mechanism"] as? [String: Any] {
          mechanism.removeValue(forKey: "meta")
          result["mechanism"] = mechanism
        }
        return result
      }
    }
    return safe
  }
}
