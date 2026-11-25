import Foundation
import ImageIO
import UniformTypeIdentifiers

enum SavedThumbnail {
  static func load(_ url: URL?, pixels: Int, session: URLSession = .shared) async -> Data? {
    guard let url, url.scheme == "https" else { return nil }
    do {
      let (file, response) = try await session.download(for: URLRequest(url: url, timeoutInterval: 8))
      defer { try? FileManager.default.removeItem(at: file) }
      guard !Task.isCancelled, let response = response as? HTTPURLResponse, (200..<300).contains(response.statusCode),
        let source = CGImageSourceCreateWithURL(file as CFURL, nil),
        let bitmap = CGImageSourceCreateThumbnailAtIndex(source, 0, [
          kCGImageSourceCreateThumbnailFromImageAlways: true, kCGImageSourceCreateThumbnailWithTransform: true,
          kCGImageSourceThumbnailMaxPixelSize: pixels
        ] as CFDictionary)
      else { return nil }
      let buffer = NSMutableData()
      guard let output = CGImageDestinationCreateWithData(buffer, UTType.jpeg.identifier as CFString, 1, nil) else { return nil }
      CGImageDestinationAddImage(output, bitmap, [kCGImageDestinationLossyCompressionQuality: 0.75] as CFDictionary)
      return CGImageDestinationFinalize(output) ? buffer as Data : nil
    } catch { return nil }
  }
}
