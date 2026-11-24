public enum SaveSource: String, Sendable {
  case manualLink = "manual_link"
  case photoImport = "photo_import"
  case shareExtension = "share_extension"
}

extension Backend {
  public func saveLink(_ url: String, operationID: String, source: SaveSource, analyticsSessionID: String? = nil,
    checkpoint: () throws -> Void = { try Task.checkCancellation() }) async throws {
    try checkpoint()
    var args = ["url": url, "operationId": operationID, "saveSource": source.rawValue]
    args["analyticsSessionId"] = analyticsSessionID
    let _: String = try await client.mutation("items:createLinkItem", with: args)
  }
}
