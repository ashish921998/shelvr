import ShelvrKit
import SwiftUI

struct AccountView: View {
  struct CurrentUser: Decodable {
    let _id: String
    let email: String?
  }
  private struct Plan: Decodable {
    let status: String
    let expiresAt: Double?
  }
  @Environment(Backend.self) private var backend
  @Environment(\.copy) private var copy
  @State private var user: CurrentUser?
  @State private var billing: BillingDestination?
  @State private var plan: Plan?
  @State private var planFailed = false
  @State private var retry = 0
  @State private var signingOut = false
  @State private var signOutFailed = false
  @AppStorage("swift.appearance") private var appearance = "system"

  var body: some View {
    List {
      Section {
        Label(user?.email ?? copy("account.signedIn"), systemImage: "person.crop.circle")
          .accessibilityIdentifier("signed-in-user")
        if let plan {
          let live = plan.status == "lifetime" || (["pro", "trialing"].contains(plan.status)
            && (plan.expiresAt ?? 0) > Date.now.timeIntervalSince1970 * 1000)
          Button { billing = live ? .manage : .paywall } label: {
            Label(copy(live ? plan.status == "trialing" ? "pro.trial" :
              plan.status == "lifetime" ? "pro.lifetime" : "pro.manage" : "pro.viewPlans"), systemImage: "sparkles")
          }
        } else if planFailed { Button(copy("common.retry")) { retry += 1 } }
        else { ProgressView(copy("pro.checking")) }
      }
      Section {
        Picker(copy("profile.appearance"), selection: $appearance) {
          ForEach(["system", "light", "warmDark", "neutralDark"], id: \.self) { mode in
            Text(copy("appearance.\(mode)")).tag(mode)
          }
        }
        NavigationLink(copy("feedback.open")) { FeedbackView() }
        NavigationLink(copy("profile.settings")) { AccountSettingsView() }
      }
      Section {
        Button(copy(signingOut ? "account.signingOut" : "account.signOut")) {
          guard !signingOut else { return }
          signingOut = true
          Task {
            defer { signingOut = false }
            do { try await backend.signOut() } catch { signOutFailed = true }
          }
        }.disabled(signingOut)
        if signOutFailed { Text(copy("account.signOutFailed")).foregroundStyle(.red) }
      }
    }
    .sheet(item: $billing) { BillingSheet(destination: $0) }
    .task {
      do {
        for try await user in backend.query("users:getCurrentUser", as: CurrentUser?.self) { self.user = user }
      } catch {}
    }
    .task(id: retry) {
      planFailed = false
      do {
        for try await plan in backend.query("subscriptions:getEntitlement", as: Plan.self) { self.plan = plan }
      } catch { if !Task.isCancelled { planFailed = true } }
    }
  }
}

private struct FeedbackView: View {
  @Environment(Backend.self) private var backend
  @Environment(\.copy) private var copy
  @State private var message = ""
  @State private var sending = false
  @State private var sent = false
  @State private var failed = false

  var body: some View {
    Form {
      if sent { Text(copy("feedback.thanks")) }
      else {
        Section {
          TextField(copy("feedback.placeholder"), text: $message, axis: .vertical)
            .lineLimit(4...10)
            .accessibilityLabel(copy("feedback.messageLabel"))
        } header: { Text(copy("feedback.prompt")) } footer: { Text(copy("feedback.replyNotice")) }
        Button(copy(sending ? "feedback.sending" : "feedback.send"), action: submit)
          .disabled(sending || message.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || message.utf16.count > 1000)
        if failed {
          Text(copy("feedback.sendFailedContact"))
          Link(copy("support.contact"), destination: Self.support)
        }
      }
    }.navigationTitle(copy("feedback.open"))
  }

  static let support = URL(string: "mailto:ashish921998@zohomail.in?subject=Shelvr%20Support")!

  private func submit() {
    guard !sending else { return }
    sending = true; failed = false
    let content = message.trimmingCharacters(in: .whitespacesAndNewlines)
    Task {
      defer { sending = false }
      do {
        struct Receipt: Decodable { let deliveryState: String }
        let _: Receipt = try await backend.client.mutation("feedback:submitFeedback", with: [
          "message": content, "platform": "ios", "surface": "profile",
          "buildVariant": backend.environment.variant.rawValue,
          "appVersion": Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String])
        sent = true; message = ""
      } catch { failed = true }
    }
  }
}
