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
      public let paths: [String?]?
      public let operationId: String?
      public let operationIds: [String?]?

      private enum CodingKeys: String, CodingKey {
        case query, id, text, url, spaceId, paths, operationId, operationIds
      }

      public init(from decoder: any Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        func nonEmpty(_ text: String) -> String? { text.isEmpty ? nil : text }
        func string(_ key: CodingKeys) -> String? {
          (try? c.decodeIfPresent(String.self, forKey: key)).flatMap(nonEmpty)
        }
        func strings(_ key: CodingKeys) -> [String?]? {
          (try? c.decodeIfPresent([Skippable<String>].self, forKey: key))?.map { $0.value.flatMap(nonEmpty) }
        }
        query = string(.query)
        id = string(.id)
        text = string(.text)
        url = string(.url)
        spaceId = string(.spaceId)
        paths = strings(.paths)
        operationId = string(.operationId)
        operationIds = strings(.operationIds)
      }
    }
  }

  struct Skippable<Value: Decodable>: Decodable {
    let value: Value?

    init(from decoder: any Decoder) throws {
      value = try? Value(from: decoder)
    }
  }
}
