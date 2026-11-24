import ConvexMobile
import Foundation
import ImageIO
import UniformTypeIdentifiers

public struct ImportPhoto: Sendable {
  public let data: Data
  public let contentType: String
  public let aspectRatio: Double

  public static func failureCopy(_ error: Error) -> String {
    switch saveErrorCode(error) {
    case "pro_required": "freePlan.photosNeedPro"
    case "photo_limit": "errors.photoLimit"
    case "image_too_large": "errors.photoTooLarge"
    case "image_empty": "errors.photoEmpty"
    default: "errors.savePhoto"
    }
  }

  public init(_ input: Data) throws {
    guard let source = CGImageSourceCreateWithData(input as CFData, nil),
      let image = CGImageSourceCreateThumbnailAtIndex(source, 0, [
        kCGImageSourceCreateThumbnailFromImageAlways: true,
        kCGImageSourceCreateThumbnailWithTransform: true,
        kCGImageSourceThumbnailMaxPixelSize: 1600
      ] as CFDictionary)
    else { throw CocoaError(.fileReadCorruptFile) }
    let png = (CGImageSourceGetType(source) as String?) == UTType.png.identifier
    let type = png ? UTType.png : .jpeg
    let buffer = NSMutableData()
    guard let output = CGImageDestinationCreateWithData(buffer, type.identifier as CFString, 1, nil)
    else { throw CocoaError(.fileWriteUnknown) }
    CGImageDestinationAddImage(output, image, [kCGImageDestinationLossyCompressionQuality: 0.8] as CFDictionary)
    guard CGImageDestinationFinalize(output) else { throw CocoaError(.fileWriteUnknown) }
    data = buffer as Data
    contentType = png ? "image/png" : "image/jpeg"
    aspectRatio = Double(image.width) / Double(image.height)
  }
}

extension Backend {
  public func savePhoto(_ photo: ImportPhoto, operationID: String, fromShare: Bool = false) async throws -> String {
    struct Begin: Decodable {
      let kind: String
      let itemId: String?
      let uploadUrl: URL?
    }
    struct Upload: Decodable { let storageId: String }
    struct Attachment: Decodable { let error: String? }
    try Task.checkCancellation()
    let begin: Begin = try await client.mutation("items:beginImageImport", with: ["operationId": operationID])
    try Task.checkCancellation()
    if begin.kind == "complete", let id = begin.itemId { return id }
    guard begin.kind == "upload", let url = begin.uploadUrl else { throw URLError(.badServerResponse) }
    var request = URLRequest(url: url)
    request.httpMethod = "POST"
    request.setValue(photo.contentType, forHTTPHeaderField: "Content-Type")
    let (body, response) = try await URLSession.shared.upload(for: request, from: photo.data)
    guard let response = response as? HTTPURLResponse, (200..<300).contains(response.statusCode)
    else { throw URLError(.badServerResponse) }
    let uploaded = try JSONDecoder().decode(Upload.self, from: body)
    try Task.checkCancellation()
    let attached: Attachment = try await client.mutation("items:attachImageUpload", with: [
      "operationId": operationID, "storageId": uploaded.storageId
    ])
    guard attached.error == nil else { throw URLError(.badServerResponse) }
    try Task.checkCancellation()
    return try await client.mutation("items:finalizeImageImport", with: [
      "operationId": operationID, "aspectRatio": photo.aspectRatio,
      "saveSource": fromShare ? "share_extension" : "photo_import"
    ])
  }
}
