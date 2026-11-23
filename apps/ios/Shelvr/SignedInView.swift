import ShelvrKit
import SwiftUI

struct SignedInView: View {
  struct CurrentUser: Decodable {
    let _id: String
    let email: String?
  }

  @Environment(Backend.self) private var backend
  @Environment(\.copy) private var copy
  @State private var user: CurrentUser?

  var body: some View {
    VStack(spacing: 12) {
      Image(systemName: "checkmark.seal.fill")
        .font(.system(size: 44))
        .foregroundStyle(Color.accentColor)
      Text(user?.email ?? user?._id ?? " ")
        .font(.headline)
        .accessibilityIdentifier("signed-in-user")
      Button(copy("account.signOut")) {
        Task { await backend.signOut() }
      }
      .buttonStyle(.signIn)
      .padding(.top, 24)
    }
    .padding(24)
    .task {
      do {
        for try await user in backend.query("users:getCurrentUser", as: CurrentUser?.self) {
          self.user = user
        }
      } catch {}
    }
  }
}
