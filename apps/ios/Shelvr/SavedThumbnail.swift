import Foundation
import ImageIO
import UniformTypeIdentifiers

enum SavedThumbnail {
  enum Fetch: Sendable {
    case image(Data)
    case retry
    case unavailable
  }

  static func load(_ url: URL?, pixels: Int) async -> Data? {
    if case let .image(data) = await fetch(url, pixels: pixels, session: .shared) { return data }
    return nil
  }

  static func fetch(_ url: URL?, pixels: Int, session: URLSession) async -> Fetch {
    guard let url, url.scheme?.lowercased() == "https" else { return .unavailable }
    do {
      let (file, response) = try await session.download(for: URLRequest(url: url, timeoutInterval: 8))
      defer { try? FileManager.default.removeItem(at: file) }
      guard !Task.isCancelled, let response = response as? HTTPURLResponse else { return .unavailable }
      if response.statusCode == 429 || (500...599).contains(response.statusCode) { return .retry }
      guard (200..<300).contains(response.statusCode), let source = CGImageSourceCreateWithURL(file as CFURL, nil),
        let bitmap = CGImageSourceCreateThumbnailAtIndex(source, 0, [
          kCGImageSourceCreateThumbnailFromImageAlways: true, kCGImageSourceCreateThumbnailWithTransform: true,
          kCGImageSourceThumbnailMaxPixelSize: pixels
        ] as CFDictionary)
      else { return .unavailable }
      let buffer = NSMutableData()
      guard let output = CGImageDestinationCreateWithData(buffer, UTType.jpeg.identifier as CFString, 1, nil) else { return .unavailable }
      CGImageDestinationAddImage(output, bitmap, [kCGImageDestinationLossyCompressionQuality: 0.75] as CFDictionary)
      return CGImageDestinationFinalize(output) ? .image(buffer as Data) : .unavailable
    } catch { return Task.isCancelled ? .unavailable : .retry }
  }
}
