import ConvexMobile
import Foundation

public enum SaveFailure: Equatable, Sendable {
  case proRequired, photoLimit, photoTooLarge, photoEmpty, other

  public init(_ error: any Error) {
    switch (error as? PhotoUploadFailure)?.rawValue ?? saveErrorCode(error) {
    case "pro_required": self = .proRequired
    case "photo_limit": self = .photoLimit
    case "image_too_large": self = .photoTooLarge
    case "image_empty": self = .photoEmpty
    default: self = .other
    }
  }

  public var photoCopyKey: String {
    switch self {
    case .proRequired: "freePlan.photosNeedPro"
    case .photoLimit: "errors.photoLimit"
    case .photoTooLarge: "errors.photoTooLarge"
    case .photoEmpty: "errors.photoEmpty"
    case .other: "errors.savePhoto"
    }
  }
}

func saveErrorCode(_ error: any Error) -> String? {
  struct Failure: Decodable { let code: String }
  guard case let ClientError.ConvexError(data) = error else { return nil }
  return (try? JSONDecoder().decode(Failure.self, from: Data(data.utf8)))?.code
}
