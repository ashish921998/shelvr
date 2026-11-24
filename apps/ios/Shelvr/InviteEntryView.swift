import ShelvrKit
import SwiftUI

struct InviteEntryView: View {
  let entry: InviteEntry
  @Binding var pendingLink: AppLink?
  @Environment(Backend.self) private var backend
  @Environment(\.copy) private var copy
  @Environment(MemberNamePrompts.self) private var names
  @State private var attempt = 0
  @State private var preparing = false
  @State private var naming: Naming?
  private struct Naming: Identifiable {
    let id = UUID()
    let invite: PublicInvite
    let account: String
    let session: UUID
  }

  var body: some View {
    @Bindable var entry = entry
    Group {
      if let request = entry.accepted, backend.status == .signedIn {
        VStack {
          if entry.failed { Button(copy("common.retry")) { attempt += 1 } } else { ProgressView() }
          Button(copy("common.cancel")) { entry.cancel() }.disabled(entry.dispatching != nil)
        }
        .task(id: Work(request: request.id, session: backend.sessionGeneration, attempt: attempt)) { await resolve(request) }
      } else if backend.status == .signedOut {
        SignInView().overlay(alignment: .topLeading) {
          if entry.accepted != nil { Button(copy("common.cancel")) { entry.cancel() }.padding() }
        }
      } else {
        OnboardingGate(pendingLink: $pendingLink).id(backend.sessionGeneration)
      }
    }
    .safeAreaInset(edge: .bottom) {
      if !entry.loaded, entry.failed { Button(copy("common.retry")) { entry.restore() } }
    }
    .sheet(item: $entry.preview) { invite in
      NavigationStack {
        Group {
          if entry.expired == invite {
            ContentUnavailableView(copy(invite.kind == .list ? "sharedLists.deadTitle" : "passportShare.deadTitle"),
              systemImage: "link", description: Text(copy(invite.kind == .list ? "sharedLists.deadBody" : "passportShare.deadBody")))
          } else if invite.kind == .list {
            JoinListView(token: invite.token, requestJoin: { choose(invite) }) { _ in }
          } else { FriendPassportView(token: invite.token, requestComparison: { choose(invite) }) }
        }
        .disabled(preparing)
        .sheet(item: $naming) { offer in
          MemberNamePrompt(creating: false) {
            guard backend.status == .signedIn, backend.sessionGeneration == offer.session else { return }
            entry.accept(offer.invite, account: offer.account)
          }
        }
        .safeAreaInset(edge: .bottom) { if entry.failed { Text(copy("errors.tryAgain")).foregroundStyle(.secondary) } }
        .toolbar { ToolbarItem(placement: .cancellationAction) { Button(copy("common.close")) { entry.preview = nil } } }
      }
    }
  }

  private func choose(_ invite: PublicInvite) {
    if backend.status == .signedOut { entry.accept(invite); return }
    guard backend.status == .signedIn, !preparing else { return }
    let session = backend.sessionGeneration
    preparing = true
    Task {
      defer { preparing = false }
      do {
        let account = try await currentAccount()
        var ask = false
        if invite.kind == .list {
          for try await first in backend.query("users:getMyFirstName", as: String?.self) {
            ask = first == nil
            break
          }
        }
        guard entry.preview == invite, backend.status == .signedIn, backend.sessionGeneration == session else { return }
        if ask && names.claim(for: session) { naming = Naming(invite: invite, account: account, session: session) }
        else { entry.accept(invite, account: account) }
      } catch { if entry.preview == invite { entry.failed = true } }
    }
  }

  private func currentAccount() async throws -> String {
    for try await user in backend.query("users:getCurrentUser", as: AccountView.CurrentUser?.self) {
      if let user { return user._id }
      break
    }
    throw CocoaError(.coderValueNotFound)
  }

  private func passportAvailable(_ token: String) async throws -> Bool {
    for try await passport in backend.socialQuery("passportShares:passportPreview", arguments: ["token": token],
      as: FriendPassport?.self) { return passport != nil }
    throw CocoaError(.coderValueNotFound)
  }

  private struct Work: Equatable { let request, session: UUID; let attempt: Int }

  private func resolve(_ request: AcceptedInvite) async {
    let session = backend.sessionGeneration
    func current() -> Bool {
      !Task.isCancelled && backend.status == .signedIn && backend.sessionGeneration == session && entry.accepted?.id == request.id
    }
    guard current() else { return }
    entry.failed = false
    do {
      let account = try await currentAccount()
      guard current() else { return }
      guard let bound = request.bound(to: account) else { entry.cancel(); return }
      if bound != request, !entry.replace(with: bound) { return }
      guard entry.beginDispatch(request.id) else { return }
      defer {
        if let next = entry.endDispatch(request.id) {
          if entry.route(next) { pendingLink = nil } else { pendingLink = next }
        }
      }
      let destination: AppLink?
      if request.invite.kind == .list {
        destination = request.invite.destination(listID: try await backend.joinList(token: request.invite.token))
      } else {
        destination = request.invite.destination(passportAvailable: try await passportAvailable(request.invite.token))
      }
      guard current(), entry.replace(with: nil) else { return }
      if let destination {
        let defaults = UserDefaults.standard
        let completed = "swift.onboarded." + account
        if !defaults.bool(forKey: completed) {
          defaults.removeObject(forKey: "swift.onboarding." + account)
          defaults.removeObject(forKey: OnboardingHandoff.key(account))
          defaults.set(true, forKey: completed)
        }
        pendingLink = destination
      } else {
        entry.expired = request.invite
        entry.preview = request.invite
      }
    } catch { if current() { entry.failed = true } }
  }
}
