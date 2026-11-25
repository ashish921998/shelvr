import AppIntents
import CoreSpotlight
import CoreTransferable
import Foundation
import ShelvrKit
import UniformTypeIdentifiers

struct ItemEntity: AppEntity, IndexedEntity {
  static let typeDisplayRepresentation: TypeDisplayRepresentation = "Shelvr Save"
  static let defaultQuery = ItemQuery()

  let id: String
  let thumbnail: Data?
  @Property(title: "Title") var title: String
  @Property(title: "Summary") var summary: String?
  @Property(title: "Kind") var kind: String
  @Property(title: "Link") var url: URL?
  @Property(title: "Note") var text: String?
  @Property(title: "Tags") var tags: [String]
  @Property(title: "Saved") var savedAt: Date?

  @MainActor init(_ row: SearchableSave) {
    let backend = AppEnvironment.sharedBackend
    self.init(row, thumbnail: ShelvrSpotlight.publication.thumbnail(for: row, account: backend.userID, session: backend.sessionGeneration))
  }

  init(_ row: SearchableSave, thumbnail: Data?) {
    self.thumbnail = thumbnail
    id = row._id
    title = row.displayTitle(copy: Copy())
    summary = row.summary
    kind = row.type
    url = row.url.flatMap(URL.init(string:))
    text = row.excerpt
    tags = row.keywords
    savedAt = Date(timeIntervalSince1970: row._creationTime / 1000)
  }

  var displayRepresentation: DisplayRepresentation {
    let symbol = kind == "link" ? "link" : kind == "image" ? "photo" : "note.text"
    return DisplayRepresentation(title: "\(title)", subtitle: "\(summary ?? kind.capitalized)", image: thumbnail.map { .init(data: $0) } ?? .init(systemName: symbol))
  }

  var attributeSet: CSSearchableItemAttributeSet {
    let result = defaultAttributeSet
    result.thumbnailData = thumbnail
    result.title = title
    result.displayName = title
    result.contentDescription = summary ?? text
    result.textContent = [summary, text, url?.host].compactMap { $0 }.joined(separator: "\n")
    result.keywords = tags + [kind.capitalized, "Shelvr"]
    result.contentURL = url
    result.addedDate = savedAt
    return result
  }

  fileprivate func authorizedSave() async throws -> SearchableSave {
    guard let row = await ShelvrCatalog.searchSaves(matching: [id]).first else { throw CocoaError(.fileNoSuchFile) }
    return row
  }
}

struct ItemQuery: EntityStringQuery, EnumerableEntityQuery {
  @MainActor func entities(for identifiers: [String]) async throws -> [ItemEntity] {
    await ShelvrCatalog.searchSaves(matching: identifiers).map { ItemEntity($0) }
  }

  @MainActor func suggestedEntities() async throws -> [ItemEntity] {
    await ShelvrCatalog.searchSaves().prefix(20).map { ItemEntity($0) }
  }

  @MainActor func entities(matching string: String) async throws -> [ItemEntity] {
    let copy = Copy()
    return await ShelvrCatalog.searchSaves().filter { $0.matches(string, copy: copy) }.prefix(30).map { ItemEntity($0) }
  }

  @MainActor func allEntities() async throws -> [ItemEntity] {
    await ShelvrCatalog.searchSaves().map { ItemEntity($0) }
  }
}

extension ItemEntity: Transferable {
  static var transferRepresentation: some TransferRepresentation {
    DataRepresentation(exportedContentType: .url) { (item: ItemEntity) in
      let row = try await item.authorizedSave()
      guard let url = row.url.flatMap(URL.init(string:)) else { throw CocoaError(.fileNoSuchFile) }
      return url.dataRepresentation
    }.exportingCondition { $0.url != nil }
    DataRepresentation(exportedContentType: .image) { (item: ItemEntity) in
      let row = try await item.authorizedSave()
      guard row.type == "image", let source = (row.imageUrl ?? row.heroImageUrl).flatMap(URL.init(string:)),
        source.scheme?.lowercased() == "https" else { throw CocoaError(.fileNoSuchFile) }
      let (temporary, response) = try await URLSession.shared.download(from: source)
      defer { try? FileManager.default.removeItem(at: temporary) }
      guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode),
        let mime = response.mimeType, let type = UTType(mimeType: mime), type.conforms(to: .image) else { throw CocoaError(.fileReadCorruptFile) }
      _ = try await item.authorizedSave()
      return try Data(contentsOf: temporary, options: .alwaysMapped)
    }.exportingCondition { $0.kind == "image" }
    DataRepresentation(exportedContentType: .utf8PlainText) { (item: ItemEntity) in
      let row = try await item.authorizedSave()
      return Data(row.exportText(copy: Copy()).utf8)
    }
  }
}

struct OpenItemIntent: OpenIntent {
  static let title: LocalizedStringResource = "Open Save"
  static let openAppWhenRun = true
  @Parameter(title: "Save") var target: ItemEntity
  func perform() async throws -> some IntentResult {
    try await target.open()
    return .result()
  }
}

private extension ItemEntity {
  @MainActor func open() async throws {
    let backend = AppEnvironment.sharedBackend
    await backend.start()
    guard let owner = backend.userID else { throw CocoaError(.fileNoSuchFile) }
    let session = backend.sessionGeneration
    let row = try await authorizedSave()
    guard backend.userID == owner, backend.sessionGeneration == session else { throw CocoaError(.fileNoSuchFile) }
    SiriNavigation.shared.requestSave(id: row._id, owner: owner, session: session)
  }
}
