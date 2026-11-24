import ShelvrKit
import SwiftUI

struct SocialQuery<Row: Decodable, Content: View>: View {
  let query: String
  var arguments: [String: String] = [:]
  let type: Row.Type
  @ViewBuilder let content: (Row) -> Content
  @Environment(Backend.self) private var backend
  @Environment(\.copy) private var copy
  @State private var status: Status = .loading
  @State private var retry = 0

  private enum Status { case loading, loaded(Row), failed }
  private struct Request: Equatable {
    let name: String
    let arguments: [String: String]
    let retry: Int
  }

  var body: some View {
    Group {
      switch status {
      case .loading: ProgressView()
      case .failed: Button(copy("common.retry")) { retry += 1 }
      case let .loaded(row): content(row)
      }
    }
    .task(id: Request(name: query, arguments: arguments, retry: retry)) {
      status = .loading
      do {
        for try await row in backend.socialQuery(query, arguments: arguments, as: type) {
          try Task.checkCancellation()
          status = .loaded(row)
        }
      } catch { if !Task.isCancelled { status = .failed } }
    }
  }
}
