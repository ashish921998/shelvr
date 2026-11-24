import RevenueCat
import ShelvrKit
import SwiftUI

struct CancelSurveyCard: ViewModifier {
  let home: Bool
  private struct Status: Decodable { let asked: Bool }
  private struct Result: Decodable { let accepted: Bool }
  private struct Episode: Equatable { let home: Bool; let active: Bool; let user: String? }
  @Environment(Backend.self) private var backend
  @Environment(\.copy) private var copy
  @Environment(\.scenePhase) private var phase
  @State private var userID: String?
  @State private var visible = false
  @State private var checked = false
  @State private var claimed = false
  @State private var delivering = false
  @State private var error = false

  func body(content: Content) -> some View {
    content
      .safeAreaInset(edge: .top) {
        if visible && checked && home && phase == .active {
          VStack(alignment: .leading, spacing: 6) {
            Text(copy("cancelSurvey.title")).font(.headline)
            Text(copy("cancelSurvey.body")).font(.caption)
            ForEach(CancelSurveyResponse.allCases, id: \.self) { reason in
              Button(label(reason)) { answer(reason) }.disabled(!claimed)
            }
            if error { Text(copy("errors.retrySoon")).font(.footnote) }
          }
          .frame(maxWidth: .infinity, alignment: .leading).padding()
          .background(.regularMaterial)
          .task { await claim() }
        }
      }
      .task {
        do {
          for try await user in backend.query("users:getCurrentUser", as: AccountView.CurrentUser?.self) { userID = user?._id }
        } catch { if !Task.isCancelled { Analytics.failure("cancel_survey_user_load_failed") } }
      }
      .onChange(of: phase) { _, next in if next != .active { checked = false } }
      .task(id: Episode(home: home, active: phase == .active, user: userID)) {
        guard phase == .active, let id = userID, Analytics.available else { return }
        await deliver(id)
        guard home, !checked, !Task.isCancelled else { return }
        await consider(id)
      }
  }

  private func label(_ answer: CancelSurveyResponse) -> String {
    switch answer {
    case .tooExpensive: copy("cancelSurvey.tooExpensive")
    case .notUsefulEnough: copy("cancelSurvey.notUseful")
    case .missingFeature: copy("cancelSurvey.missingFeature")
    case .other: copy("cancelSurvey.other")
    case .skipped: copy("cancelSurvey.skip")
    }
  }

  private func consider(_ id: String) async {
    let session = backend.sessionGeneration
    do {
      for try await status in backend.query("cancelSurvey:getStatus", as: Status.self) {
        guard !Task.isCancelled, backend.sessionGeneration == session else { return }
        if status.asked && !claimed { visible = false; checked = true; return }
        try await BillingIdentity.select(id, environment: backend.environment)
        guard !Task.isCancelled, Purchases.shared.appUserID == id, backend.sessionGeneration == session else { return }
        let info = try await Purchases.shared.customerInfo(fetchPolicy: .fetchCurrent)
        guard !Task.isCancelled, Purchases.shared.appUserID == id, backend.sessionGeneration == session, Analytics.available else { return }
        visible = info.entitlements.active.values.contains(where: { $0.periodType == .trial && !$0.willRenew })
        checked = true
        return
      }
    } catch { if !Task.isCancelled { checked = false; Analytics.failure("cancel_survey_eligibility_check_failed") } }
  }

  private func claim() async {
    guard !claimed, userID != nil, Analytics.available else { return }
    let session = backend.sessionGeneration
    do {
      let result: Result = try await backend.client.mutation("cancelSurvey:markShown")
      guard backend.sessionGeneration == session else { return }
      if result.accepted { claimed = true; Analytics.capture("cancel_survey_shown") }
      else { visible = false }
    } catch { visible = false; Analytics.failure("cancel_survey_claim_failed") }
  }

  private func answer(_ response: CancelSurveyResponse) {
    guard let id = userID, claimed else { return }
    guard response.save(for: id) else { error = true; return }
    visible = false
    claimed = false
    Task { await deliver(id) }
  }

  private func deliver(_ id: String) async {
    guard !delivering, userID == id, let response = CancelSurveyResponse.pending(for: id),
      backend.status == .signedIn, Analytics.available else { return }
    let session = backend.sessionGeneration
    delivering = true
    defer { delivering = false }
    do {
      var args = ["outcome": response.outcome]
      if response != .skipped { args["reason"] = response.rawValue }
      let result: Result = try await backend.client.mutation("cancelSurvey:respond", with: args)
      guard backend.sessionGeneration == session, userID == id else { return }
      CancelSurveyResponse.clear(for: id)
      guard result.accepted else { return }
      if response == .skipped { Analytics.capture("cancel_survey_dismissed") }
      else { Analytics.capture("cancel_survey_submitted", ["reason": response.rawValue, "survey_source": "next_visit_card"]) }
    } catch { if !Task.isCancelled { Analytics.failure("cancel_survey_response_failed") } }
  }
}
