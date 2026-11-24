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
    func active(at date: Date) -> Bool {
      status == "lifetime" || (["pro", "trialing"].contains(status) && (expiresAt ?? 0) > date.timeIntervalSince1970 * 1000)
    }
    func title(at date: Date, copy: Copy) -> String {
      if active(at: date) {
        switch status {
        case "trialing": return copy("pro.trial")
        case "lifetime": return copy("pro.lifetime")
        default: return "Pro"
        }
      }
      return copy(status == "none" ? "pro.viewPlans" : "pro.lapsed")
    }
  }
  @Environment(Backend.self) private var backend
  @Environment(\.copy) private var copy
  @State private var user: CurrentUser?
  @State private var userLoaded = false
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
          TimelineView(.periodic(from: .now, by: 60)) { context in
            Button { billing = plan.active(at: .now) ? .manage : .paywall } label: {
              Label(plan.title(at: context.date, copy: copy), systemImage: "sparkles")
            }
          }
        } else if planFailed { Button(copy("common.retry")) { retry += 1 } }
        else { ProgressView(copy("pro.checking")) }
      }
      .listRowBackground(rowSurface)
      Section {
        Picker(copy("profile.appearance"), selection: $appearance) {
          ForEach(["system", "light", "warmDark", "neutralDark"], id: \.self) { mode in
            Text(copy("appearance.\(mode)")).tag(mode)
          }
        }
        if user != nil {
          NavigationLink(copy("feedback.open")) { FeedbackView() }
        } else if userLoaded {
          Link(copy("support.contact"), destination: FeedbackView.support)
        }
        NavigationLink(copy("profile.settings")) { AccountSettingsView() }
        SaveReminderPreference()
      }
      .listRowBackground(rowSurface)
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
      }.listRowBackground(rowSurface)
    }
    .scrollContentBackground(appearance.hasSuffix("Dark") ? .hidden : .visible)
    .background(appearance == "neutralDark" ? Color(red: 17/255, green: 20/255, blue: 23/255) : Color(.background))
    .sheet(item: $billing) { BillingSheet(destination: $0) }
    .task {
      do {
        for try await user in backend.query("users:getCurrentUser", as: CurrentUser?.self) { self.user = user; userLoaded = true }
      } catch { if !Task.isCancelled { userLoaded = true } }
    }
    .task(id: retry) {
      planFailed = false
      do {
        for try await plan in backend.query("subscriptions:getEntitlement", as: Plan.self) { self.plan = plan }
      } catch { if !Task.isCancelled { planFailed = true; plan = nil } }
    }
  }
  private var rowSurface: Color? {
    switch appearance {
    case "warmDark": Color(red: 35/255, green: 30/255, blue: 22/255)
    case "neutralDark": Color(red: 27/255, green: 31/255, blue: 36/255)
    default: nil
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
            .disabled(sending)
            .accessibilityLabel(copy("feedback.messageLabel"))
        } header: { Text(copy("feedback.prompt")) } footer: { Text(copy("feedback.replyNotice")) }
        Button(copy(sending ? "feedback.sending" : "feedback.send"), action: submit)
          .disabled(sending || message.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || message.utf16.count > 1000)
        Text("\(message.utf16.count) / 1000").font(.caption).foregroundStyle(.secondary)
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
