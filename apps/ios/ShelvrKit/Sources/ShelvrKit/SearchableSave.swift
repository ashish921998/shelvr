import Foundation

public struct SearchableSave: Decodable, Sendable {
  public let _id: String
  public let _creationTime: Double
  public let note, title, url, siteName, description, imageUrl, heroImageUrl: String?
  public let tags: [String]?
  public let type, status: String

  public func displayTitle(copy: Copy) -> String {
    if let title = trimmed(title) { return title }
    if type == "note", let line = trimmed(note)?.split(separator: "\n").first { return String(line.prefix(80)) }
    if type == "link", let url = trimmed(url) {
      let candidate = url.contains("://") ? url : "https://" + url
      if let host = URL(string: candidate)?.host { return host.hasPrefix("www.") ? String(host.dropFirst(4)) : host }
    }
    return copy(type == "link" ? "item.link" : type == "image" ? "item.photo" : "item.note")
  }

  public var summary: String? { trimmed(description) ?? siteName }
  public var excerpt: String? { note.map { String($0.prefix(600)) } }
  public var keywords: [String] {
    var seen = Set<String>()
    return Array((tags ?? []).compactMap(trimmed).filter { seen.insert($0).inserted }.prefix(12))
  }

  public func matches(_ query: String, copy: Copy) -> Bool {
    let text = searchableText(copy: copy)
    return Self.words(query).allSatisfy { text.contains($0) }
  }

  public func visualScore(labels: [String], copy: Copy) -> Int {
    let text = searchableText(copy: copy)
    return labels.flatMap(Self.words).filter { $0.count > 2 && text.contains($0) }.count
  }

  private func searchableText(copy: Copy) -> String {
    let fields = [displayTitle(copy: copy), summary, excerpt, siteName, url].compactMap { $0 } + keywords
    return Self.words(fields.joined(separator: " ")).joined(separator: " ")
  }

  private static func words(_ value: String) -> [String] {
    value.folding(options: [.diacriticInsensitive, .caseInsensitive], locale: .current)
      .components(separatedBy: CharacterSet.alphanumerics.inverted).filter { !$0.isEmpty }
  }

  private func trimmed(_ value: String?) -> String? {
    guard let result = value?.trimmingCharacters(in: .whitespacesAndNewlines), !result.isEmpty else { return nil }
    return result
  }
}

public struct SearchableSavePage: Decodable, Sendable {
  public let page: [SearchableSave]
  public let continueCursor: String
  public let isDone: Bool

  public static func latestReady(fetch: (String?) async -> Self?) async -> [SearchableSave]? {
    var saves: [SearchableSave] = []
    var cursor: String?
    var visited = Set<String>()
    while !Task.isCancelled {
      guard let batch = await fetch(cursor), !Task.isCancelled else { return nil }
      saves += batch.page.lazy.filter { $0.status == "ready" }.prefix(300 - saves.count)
      if batch.isDone || saves.count == 300 { return saves }
      guard visited.insert(batch.continueCursor).inserted else { return nil }
      cursor = batch.continueCursor
    }
    return nil
  }
}
