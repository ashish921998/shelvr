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

protocol PhotoMutationClient: Sendable {
  func mutation<T: Decodable>(_ name: String, with args: [String: ConvexEncodable?]?) async throws -> T
}

extension ConvexClient: PhotoMutationClient {}

extension ImportPhoto {
  @MainActor func save(using client: any PhotoMutationClient, operationID: String, source: SaveSource,
    analyticsSessionID: String? = nil, checkpoint: () throws -> Void, upload: (URLRequest, Data) async throws -> (Data, URLResponse)) async throws -> String {
    struct Begin: Decodable {
      let kind: String
      let itemId: String?
      let uploadUrl: URL?
    }
    struct Upload: Decodable { let storageId: String }
    struct Attachment: Decodable { let error: String? }
    try checkpoint()
    let begin: Begin = try await client.mutation("items:beginImageImport", with: ["operationId": operationID])
    try checkpoint()
    if begin.kind == "complete", let id = begin.itemId { return id }
    guard begin.kind == "upload", let url = begin.uploadUrl else { throw URLError(.badServerResponse) }
    var request = URLRequest(url: url)
    request.httpMethod = "POST"
    request.setValue(contentType, forHTTPHeaderField: "Content-Type")
    let (body, response) = try await upload(request, data)
    try PhotoUploadFailure.check(response, body: body)
    let uploaded = try JSONDecoder().decode(Upload.self, from: body)
    try checkpoint()
    let attached: Attachment = try await client.mutation("items:attachImageUpload", with: [
      "operationId": operationID, "storageId": uploaded.storageId
    ])
    guard attached.error == nil else { throw URLError(.badServerResponse) }
    try checkpoint()
    var args: [String: ConvexEncodable?] = [
      "operationId": operationID, "aspectRatio": aspectRatio,
      "saveSource": source.rawValue
    ]
    if let analyticsSessionID { args["analyticsSessionId"] = analyticsSessionID }
    return try await client.mutation("items:finalizeImageImport", with: args)
  }
}

extension Backend {
  public func savePhoto(_ photo: ImportPhoto, operationID: String, source: SaveSource = .photoImport,
    analyticsSessionID: String? = nil, checkpoint: () throws -> Void = { try Task.checkCancellation() }) async throws -> String {
    try await photo.save(using: client, operationID: operationID, source: source,
      analyticsSessionID: analyticsSessionID, checkpoint: checkpoint) { request, bytes in
      try await URLSession.shared.upload(for: request, from: bytes)
    }
  }
}
