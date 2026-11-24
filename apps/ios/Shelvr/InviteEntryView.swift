import ShelvrKit
import SwiftUI

@MainActor @Observable
final class InviteEntry {
  var preview: PublicInvite?
  private(set) var accepted: AcceptedInvite?
  var expired: PublicInvite?
  var failed = false
  var loaded = false

  func restore() {
    do { accepted = try PendingInviteStore.read(); loaded = true; failed = false }
    catch { failed = true }
  }

  func accept(_ invite: PublicInvite) {
    guard preview == invite, replace(with: AcceptedInvite(invite)) else { return }
    preview = nil
  }

  func route(_ link: AppLink) -> Bool {
    if !loaded { restore() }
    let next = PublicInvite(link)
    if accepted != nil, !replace(with: nil) { return true }
    expired = nil
    preview = next
    return next != nil
  }

  func cancel() {
    guard let current = accepted, replace(with: nil) else { return }
    preview = current.invite
  }

  func replace(with next: AcceptedInvite?) -> Bool {
    do { try PendingInviteStore.set(next); accepted = next; failed = false; return true }
    catch { failed = true; return false }
  }
}

struct InviteEntryView: View {
  let entry: InviteEntry
  @Binding var pendingLink: AppLink?
  @Environment(Backend.self) private var backend
  @Environment(\.copy) private var copy
  @State private var attempt = 0

  var body: some View {
    @Bindable var entry = entry
    Group {
      if !entry.loaded {
        if entry.failed { Button(copy("common.retry")) { entry.restore() } } else { ProgressView() }
      } else if let request = entry.accepted, backend.status == .signedIn {
        VStack {
          if entry.failed { Button(copy("common.retry")) { attempt += 1 } } else { ProgressView() }
          Button(copy("common.cancel")) { entry.cancel() }
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
    .task { if !entry.loaded { entry.restore() } }
    .sheet(item: $entry.preview) { invite in
      NavigationStack {
        Group {
          if entry.expired == invite {
            ContentUnavailableView(copy(invite.kind == .list ? "sharedLists.deadTitle" : "passportShare.deadTitle"),
              systemImage: "link", description: Text(copy(invite.kind == .list ? "sharedLists.deadBody" : "passportShare.deadBody")))
          } else if invite.kind == .list {
            JoinListView(token: invite.token, requestJoin: { entry.accept(invite) }) { _ in }
          } else { FriendPassportView(token: invite.token, requestComparison: { entry.accept(invite) }) }
        }
        .safeAreaInset(edge: .bottom) { if entry.failed { Text(copy("errors.tryAgain")).foregroundStyle(.secondary) } }
        .toolbar { ToolbarItem(placement: .cancellationAction) { Button(copy("common.close")) { entry.preview = nil } } }
      }
    }
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
      var users = backend.query("users:getCurrentUser", as: AccountView.CurrentUser?.self).makeAsyncIterator()
      guard let user = try await users.next() ?? nil else { throw CocoaError(.coderValueNotFound) }
      guard current() else { return }
      guard let bound = request.bound(to: user._id) else { entry.cancel(); return }
      if bound != request, !entry.replace(with: bound) { return }
      let destination: AppLink?
      if request.invite.kind == .list {
        destination = request.invite.destination(listID: try await backend.joinList(token: request.invite.token))
      } else {
        var rows = backend.socialQuery("passportShares:passportPreview", arguments: ["token": request.invite.token],
          as: FriendPassport?.self).makeAsyncIterator()
        guard let row = try await rows.next() else { throw CocoaError(.coderValueNotFound) }
        destination = row == nil ? nil : request.invite.destination()
      }
      guard current(), entry.replace(with: nil) else { return }
      if let destination {
        let defaults = UserDefaults.standard
        let completed = "swift.onboarded." + user._id
        if !defaults.bool(forKey: completed) {
          defaults.removeObject(forKey: "swift.onboarding." + user._id)
          defaults.removeObject(forKey: OnboardingHandoff.key(user._id))
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
