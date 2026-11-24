import Foundation

extension ExpoDeviceState {
  public struct RegistrationInfo: Decodable {
    public let isEnabled: Bool?
    public let lastRegisteredDeviceToken: RegisteredToken?

    public struct RegisteredToken: Decodable {
      public let deviceToken: String
      public let appId: String?
      public let development: Bool
      public let type: String
      public let registeredAt: Double?
    }
  }

  public struct SharePayload: Decodable {
    public let type: Kind
    public let value: String
    public let mimeType: String
    public let metadata: Metadata?

    public enum Kind: String, Decodable { case text, url, audio, image, video, file }
    public struct Metadata: Decodable {
      public let originalName: String?
      public let size: Int?
    }
  }

  public struct Invocation: Decodable {
    public let id: String
    public let name: String
    public let createdAt: Double
    public let params: Parameters

    public struct Parameters: Decodable {
      public let query: String?
      public let id: String?
      public let text: String?
      public let url: String?
      public let spaceId: String?
      public let paths: [String]?
      public let operationId: String?
      public let operationIds: [String]?
    }
  }
}
