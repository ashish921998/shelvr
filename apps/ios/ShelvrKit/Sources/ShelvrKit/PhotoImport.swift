import ConvexMobile
import Foundation
import ImageIO
import UniformTypeIdentifiers

enum PhotoUploadFailure: String, Error, Decodable {
  case tooLarge = "image_too_large"
  case empty = "image_empty"

  static func check(_ response: URLResponse, body: Data) throws {
    struct Refusal: Decodable { let error: PhotoUploadFailure }
    guard let http = response as? HTTPURLResponse else { throw URLError(.badServerResponse) }
    if !(200..<300).contains(http.statusCode) {
      if let refusal = try? JSONDecoder().decode(Refusal.self, from: body) { throw refusal.error }
      throw URLError(.badServerResponse)
    }
  }
}

public struct ImportPhoto: Sendable {
  public let data: Data
  public let contentType: String
  public let aspectRatio: Double

  public static func failureStage(_ error: Error, captureCode: String? = nil) -> String {
    let code = captureCode ?? (error as? PhotoUploadFailure)?.rawValue ?? saveErrorCode(error)
    switch code {
    case "pro_required", "photo_limit", "image_too_large", "image_empty": return code ?? "other"
    default: return "other"
    }
  }

  public static func failureCopy(_ error: Error) -> String {
    switch failureStage(error) {
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

public enum PhotoSource: String { case picker = "photo_import", share = "share_extension", siri }

extension Backend {
  public func savePhoto(_ photo: ImportPhoto, operationID: String, source: PhotoSource = .picker, spaceID: String? = nil, analyticsSessionID: String? = nil, owner: String? = nil) async throws -> String {
    struct Begin: Decodable {
      let kind: String
      let itemId: String?
      let uploadUrl: URL?
    }
    struct Upload: Decodable { let storageId: String }
    struct Attachment: Decodable { let error: String? }
    try Task.checkCancellation()
    if let owner { try requireShareOwner(owner) }
    let begin: Begin = try await client.mutation("items:beginImageImport", with: ["operationId": operationID])
    try Task.checkCancellation()
    if let owner { try requireShareOwner(owner) }
    if begin.kind == "complete", let id = begin.itemId { return id }
    guard begin.kind == "upload", let url = begin.uploadUrl else { throw URLError(.badServerResponse) }
    var request = URLRequest(url: url)
    request.httpMethod = "POST"
    request.setValue(photo.contentType, forHTTPHeaderField: "Content-Type")
    let (body, response) = try await URLSession.shared.upload(for: request, from: photo.data)
    try PhotoUploadFailure.check(response, body: body)
    let uploaded = try JSONDecoder().decode(Upload.self, from: body)
    try Task.checkCancellation()
    if let owner { try requireShareOwner(owner) }
    let attached: Attachment = try await client.mutation("items:attachImageUpload", with: [
      "operationId": operationID, "storageId": uploaded.storageId
    ])
    guard attached.error == nil else { throw URLError(.badServerResponse) }
    try Task.checkCancellation()
    if let owner { try requireShareOwner(owner) }
    var arguments: [String: ConvexEncodable?] = [
      "operationId": operationID, "aspectRatio": photo.aspectRatio,
      "saveSource": source.rawValue
    ]
    if let spaceID { arguments["spaceId"] = spaceID }
    if let analyticsSessionID { arguments["analyticsSessionId"] = analyticsSessionID }
    return try await client.mutation("items:finalizeImageImport", with: arguments)
  }
}
