import Combine
import ShelvrKit
import SwiftUI

struct InviteEntryView: View {
  let entry: InviteEntry
  @Binding var pendingLink: AppLink?
  @Environment(Backend.self) private var backend
  @Environment(\.copy) private var copy
  @Environment(MemberNamePrompts.self) private var names
  @State private var welcomePurpose: WelcomeHandoff.Purpose?
  @AppStorage(WelcomeHandoff.finishedKey) private var finishedWelcome = false
  @State private var attempt = 0
  @State private var preparing = false
  @State private var naming: Naming?
  @State private var approvedName: Naming?
  private struct Naming: Identifiable {
    let id = UUID()
    let invite: PublicInvite
    let account: String
    let session, revision: UUID
  }

  var body: some View {
    @Bindable var entry = entry
    Group {
      if let request = entry.accepted, backend.status == .signedIn, activeDestination == nil {
        VStack {
          if entry.failed { Button(copy("common.retry")) { attempt += 1 } } else { ProgressView() }
          Button(copy("common.cancel")) { cancel() }.disabled(entry.dispatching != nil)
        }
        .task(id: Work(request: request.id, session: backend.sessionGeneration, attempt: attempt,
          waiting: entry.waitsForDispatch(from: backend.sessionGeneration))) {
          guard !entry.waitsForDispatch(from: backend.sessionGeneration) else { return }
          await resolve(request)
        }
      } else if backend.status == .signedOut {
        if entry.accepted != nil {
          SignInView(back: cancel)
        } else if welcomePurpose != nil || finishedWelcome {
          SignInView(back: finishedWelcome ? nil : { welcomePurpose = nil }, welcome: welcomePurpose)
        } else {
          OnboardingForm(account: nil, onSignIn: { welcomePurpose = $0 })
        }
      } else {
        OnboardingGate(pendingLink: $pendingLink).id(backend.sessionGeneration)
      }
    }
    .onChange(of: backend.userID, initial: true) { _, account in
      if account != nil { welcomePurpose = nil }
    }
    .safeAreaInset(edge: .bottom) {
      if !entry.loaded, entry.failed { Button(copy("common.retry")) { entry.restore() } }
      else if entry.failed, let link = activeDestination {
        Button(copy("common.retry")) {
          forward(entry.didNavigate(to: link, account: backend.userID, session: backend.sessionGeneration))
        }
      }
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
        .sheet(item: $naming, onDismiss: {
          guard let offer = approvedName else { return }
          approvedName = nil
          guard backend.status == .signedIn, backend.sessionGeneration == offer.session,
            entry.previewRevision == offer.revision else { return }
          entry.accept(offer.invite, account: offer.account)
        }) { offer in
          MemberNamePrompt(creating: false) { approvedName = offer }
        }
        .safeAreaInset(edge: .bottom) { if entry.failed { Text(copy("errors.tryAgain")).foregroundStyle(.secondary) } }
        .toolbar { ToolbarItem(placement: .cancellationAction) { Button(copy("common.close")) { entry.preview = nil } } }
      }
    }
  }

  private var activeDestination: AppLink? {
    entry.destination(account: backend.userID, session: backend.sessionGeneration)
  }

  private func cancel() {
    forward(entry.cancel())
  }

  private func forward(_ link: AppLink?) {
    if let link, !entry.route(link) { pendingLink = link }
  }

  private func choose(_ invite: PublicInvite) {
    if backend.status == .signedOut { welcomePurpose = nil; entry.accept(invite); return }
    guard backend.status == .signedIn, !preparing else { return }
    let session = backend.sessionGeneration
    let revision = entry.previewRevision
    preparing = true
    Task {
      defer { preparing = false }
      do {
        let account = try await currentAccount()
        let ask = invite.kind == .list ? await askForMissingName() : false
        guard entry.previewRevision == revision, entry.preview == invite, backend.status == .signedIn,
          backend.sessionGeneration == session else { return }
        if ask && names.claim(for: session) {
          naming = Naming(invite: invite, account: account, session: session, revision: revision)
        }
        else { entry.accept(invite, account: account) }
      } catch { if entry.preview == invite { entry.failed = true } }
    }
  }

  private func askForMissingName() async -> Bool {
    let timeout = Just(false).delay(for: .seconds(3), scheduler: DispatchQueue.main)
    let lookup = backend.client.subscribe(to: "users:getMyFirstName", yielding: String?.self)
      .map { $0 == nil }.replaceError(with: false)
    for await ask in lookup.merge(with: timeout).prefix(1).values { return ask }
    return false
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

  private struct Work: Equatable {
    let request, session: UUID
    let attempt: Int
    let waiting: Bool
  }

  private func resolve(_ request: AcceptedInvite) async {
    let session = backend.sessionGeneration
    func current() -> Bool {
      !Task.isCancelled && backend.status == .signedIn && backend.sessionGeneration == session && entry.accepted?.id == request.id
    }
    guard current() else { return }
    entry.failed = false
    do {
      let account = try await currentAccount()
      guard current(), backend.userID == account else { return }
      guard let bound = request.bound(to: account) else {
        forward(entry.cancel(keepPreview: false))
        return
      }
      if bound != request, !entry.replace(with: bound) { return }
      guard entry.beginDispatch(request.id, session: session) else { return }
      var handoff: InviteNavigation?
      defer {
        forward(entry.endDispatch(request.id, navigation: handoff))
      }
      var resolved = bound
      if bound.resolution == nil {
        let result: AcceptedInvite.Resolution?
        if request.invite.kind == .list {
          result = try await backend.joinList(token: request.invite.token).map(AcceptedInvite.Resolution.joinedList)
        } else {
          result = try await passportAvailable(request.invite.token) ? .passportComparison : nil
        }
        guard current() else { return }
        guard let result else {
          if entry.replace(with: nil) {
            entry.expired = request.invite
            entry.preview = request.invite
          }
          return
        }
        resolved = bound.resolved(as: result)
        guard entry.replace(with: resolved) else { return }
      }
      guard let destination = resolved.destination else { entry.failed = true; return }
      let defaults = UserDefaults.standard
      let completed = "swift.onboarded." + account
      if !defaults.bool(forKey: completed) {
        defaults.removeObject(forKey: "swift.onboarding." + account)
        defaults.removeObject(forKey: OnboardingHandoff.key(account))
        defaults.set(true, forKey: completed)
        defaults.set(true, forKey: WelcomeHandoff.finishedKey)
      }
      handoff = InviteNavigation(destination: destination, account: account, session: session)
    } catch { if current() { entry.failed = true } }
  }
}
