import CoreGraphics
import Foundation
import ImageIO
import Testing
import UniformTypeIdentifiers
@testable import ShelvrKit

@Test func normalizesLargePNGWithoutCopyingSourceMetadata() throws {
  let context = try #require(CGContext(data: nil, width: 2400, height: 1200, bitsPerComponent: 8,
    bytesPerRow: 0, space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue))
  let image = try #require(context.makeImage())
  let bytes = NSMutableData()
  let destination = try #require(CGImageDestinationCreateWithData(bytes, UTType.png.identifier as CFString, 1, nil))
  CGImageDestinationAddImage(destination, image, [kCGImagePropertyPNGDictionary:
    [kCGImagePropertyPNGDescription: "private fixture"]] as CFDictionary)
  #expect(CGImageDestinationFinalize(destination))

  let photo = try ImportPhoto(bytes as Data)
  #expect(photo.contentType == "image/png")
  #expect(photo.aspectRatio == 2)
  let source = try #require(CGImageSourceCreateWithData(photo.data as CFData, nil))
  let properties = try #require(CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? [String: Any])
  #expect(properties[kCGImagePropertyPixelWidth as String] as? Int == 1600)
  let png = properties[kCGImagePropertyPNGDictionary as String] as? [String: Any]
  #expect(png?[kCGImagePropertyPNGDescription as String] == nil)
}

@Test func corruptPhotoFailsBeforeUpload() {
  #expect(throws: CocoaError.self) { try ImportPhoto(Data([1, 2])) }
}

@MainActor @Test func cancelledPickerCannotSubmitToTheCurrentBackendAccount() async throws {
  let context = try #require(CGContext(data: nil, width: 2, height: 2, bitsPerComponent: 8, bytesPerRow: 0,
    space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue))
  let image = try #require(context.makeImage())
  let data = NSMutableData()
  let output = try #require(CGImageDestinationCreateWithData(data, UTType.png.identifier as CFString, 1, nil))
  CGImageDestinationAddImage(output, image, nil)
  #expect(CGImageDestinationFinalize(output))
  let photo = try ImportPhoto(data as Data)
  let backend = Backend(environment: try AppEnvironment(variant: .development, convexURL: URL(string: "http://127.0.0.1:1")!))
  let submission = Task { try await backend.savePhoto(photo, operationID: "image:cancelled") }
  submission.cancel()
  await #expect(throws: CancellationError.self) { try await submission.value }
}
