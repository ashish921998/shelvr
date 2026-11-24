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

private func twoColorFixture(type: UTType, orientation: Int, transparentRight: Bool) throws -> Data {
  let context = try #require(CGContext(data: nil, width: 40, height: 20, bitsPerComponent: 8,
    bytesPerRow: 160, space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue))
  context.setFillColor(red: 1, green: 0, blue: 0, alpha: 1)
  context.fill(CGRect(x: 0, y: 0, width: 20, height: 20))
  if !transparentRight {
    context.setFillColor(red: 0, green: 0, blue: 1, alpha: 1)
    context.fill(CGRect(x: 20, y: 0, width: 20, height: 20))
  }
  let bytes = NSMutableData()
  let dest = try #require(CGImageDestinationCreateWithData(bytes, type.identifier as CFString, 1, nil))
  CGImageDestinationAddImage(dest, try #require(context.makeImage()), [kCGImagePropertyOrientation: orientation] as CFDictionary)
  #expect(CGImageDestinationFinalize(dest))
  return bytes as Data
}

private func outputPixel(_ photo: ImportPhoto, x: Int, y: Int) throws -> [UInt8] {
  let source = try #require(CGImageSourceCreateWithData(photo.data as CFData, nil))
  let image = try #require(CGImageSourceCreateImageAtIndex(source, 0, nil))
  let context = try #require(CGContext(data: nil, width: image.width, height: image.height, bitsPerComponent: 8,
    bytesPerRow: image.width * 4, space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue))
  context.draw(image, in: CGRect(x: 0, y: 0, width: image.width, height: image.height))
  let pixels = try #require(context.data).assumingMemoryBound(to: UInt8.self)
  return Array(UnsafeBufferPointer(start: pixels.advanced(by: (y * image.width + x) * 4), count: 4))
}

@Test func pngPixelsKeepTheirTransparency() throws {
  let photo = try ImportPhoto(twoColorFixture(type: .png, orientation: 1, transparentRight: true))
  #expect(try outputPixel(photo, x: 10, y: 10) == [255, 0, 0, 255])
  #expect(try outputPixel(photo, x: 30, y: 10)[3] == 0)
}

@Test func rotatesJpegPixelsIntoTheirDisplayedOrientation() throws {
  let photo = try ImportPhoto(twoColorFixture(type: .jpeg, orientation: 6, transparentRight: false))
  #expect(photo.aspectRatio == 0.5)
  #expect(try outputPixel(photo, x: 10, y: 10)[0] > 220)
  #expect(try outputPixel(photo, x: 10, y: 30)[2] > 220)
}

@Test func uploadRefusalsKeepTheirActionableCopy() throws {
  let response = try #require(HTTPURLResponse(url: URL(string: "https://example.com")!, statusCode: 413, httpVersion: nil, headerFields: nil))
  #expect(throws: PhotoUploadFailure.tooLarge) {
    try PhotoUploadFailure.check(response, body: Data(#"{"error":"image_too_large"}"#.utf8))
  }
  #expect(ImportPhoto.failureCopy(PhotoUploadFailure.tooLarge) == "errors.photoTooLarge")
  #expect(ImportPhoto.failureCopy(PhotoUploadFailure.empty) == "errors.photoEmpty")
}
