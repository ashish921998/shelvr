import MapKit
import UIKit

/// Request numbers live here, not in JS, so they survive a JS reload. `begin` and `cancel` are synchronous
/// calls from the JS thread, so a cancel covers every request begun before it whichever async call runs first.
final class PlaceCardRequests: @unchecked Sendable {
  static let shared = PlaceCardRequests()
  private let lock = NSLock()
  private var latest = 0
  private var cancelledThrough = 0
  private var shown: (request: Int, close: @MainActor () -> Void)?

  func begin() -> Int {
    lock.lock()
    defer { lock.unlock() }
    latest += 1
    return latest
  }

  /// The screen that asked went away. Lookups in flight are left to finish, because once
  /// MKMapItemRequest.cancel() runs its async mapItem never returns; they just never present.
  /// The screen's blur can arrive after a fast lookup has already shown its card, so that card closes.
  func cancel() {
    lock.lock()
    cancelledThrough = latest
    let close = shown.flatMap { $0.request <= cancelledThrough ? $0.close : nil }
    lock.unlock()
    if let close {
      DispatchQueue.main.async { MainActor.assumeIsolated { close() } }
    }
  }

  func didShow(_ request: Int, close: @escaping @MainActor () -> Void) {
    lock.lock()
    defer { lock.unlock() }
    shown = (request, close)
  }

  func didFinish(_ request: Int) {
    lock.lock()
    defer { lock.unlock() }
    if shown?.request == request { shown = nil }
  }

  func isCancelled(_ request: Int) -> Bool {
    lock.lock()
    defer { lock.unlock() }
    return request <= cancelledThrough
  }
}

@available(iOS 18.0, *)
enum ApplePlaceCardPresenter {
  @MainActor
  static func present(appleId: String, request: Int, from host: UIViewController) async -> String {
    guard let identifier = MKMapItem.Identifier(rawValue: appleId) else { return "unavailable" }
    let mapItem = try? await MKMapItemRequest(mapItemIdentifier: identifier).mapItem
    guard !PlaceCardRequests.shared.isCancelled(request) else { return "cancelled" }
    guard let mapItem else { return "unavailable" }

    // The lookup is asynchronous, so find the top presenter only now that it has finished.
    var top = host
    while let presented = top.presentedViewController {
      top = presented
    }
    guard top.view.window != nil, !top.isBeingDismissed, !top.isBeingPresented else {
      return "unavailable"
    }

    return await withCheckedContinuation { continuation in
      // Apple's card renders only when presented itself, never embedded in another controller.
      let card = MKMapItemDetailViewController(mapItem: mapItem, displaysMap: false)
      card.modalPresentationStyle = .pageSheet
      if let sheet = card.sheetPresentationController {
        sheet.detents = [.medium(), .large()]
        sheet.prefersGrabberVisible = true
      }
      let coordinator = PlaceCardCoordinator(card: card, request: request, continuation: continuation)
      card.delegate = coordinator
      card.presentationController?.delegate = coordinator
      top.present(card, animated: true)
      // UIKit drops a refused presentation with only a log line, which would leave this await pending forever.
      if card.presentingViewController == nil {
        coordinator.finish("unavailable")
      } else {
        PlaceCardRequests.shared.didShow(request) { coordinator.close() }
      }
    }
  }
}

@available(iOS 18.0, *)
@MainActor
private final class PlaceCardCoordinator: NSObject, MKMapItemDetailViewControllerDelegate,
  UIAdaptivePresentationControllerDelegate
{
  private var continuation: CheckedContinuation<String, Never>?
  private weak var card: UIViewController?
  private let request: Int
  // Both delegate slots are weak, so the coordinator keeps itself alive until it has answered.
  private var keepAlive: PlaceCardCoordinator?

  init(card: UIViewController, request: Int, continuation: CheckedContinuation<String, Never>) {
    self.card = card
    self.request = request
    self.continuation = continuation
    super.init()
    keepAlive = self
  }

  func finish(_ result: String) {
    PlaceCardRequests.shared.didFinish(request)
    continuation?.resume(returning: result)
    continuation = nil
    keepAlive = nil
  }

  func close() {
    // UIKit can take the card down with its presenter and tell no delegate, so answer here or JS waits forever.
    guard let card, card.presentingViewController != nil else { return finish("cancelled") }
    guard !card.isBeingDismissed else { return }
    card.dismiss(animated: true) { [self] in finish("cancelled") }
  }

  nonisolated func mapItemDetailViewControllerDidFinish(
    _ detailViewController: MKMapItemDetailViewController
  ) {
    MainActor.assumeIsolated {
      guard let card, card.presentingViewController != nil, !card.isBeingDismissed else {
        finish("dismissed")
        return
      }
      card.dismiss(animated: true) { [self] in finish("dismissed") }
    }
  }

  nonisolated func presentationControllerDidDismiss(_ presentationController: UIPresentationController) {
    MainActor.assumeIsolated { finish("dismissed") }
  }
}
