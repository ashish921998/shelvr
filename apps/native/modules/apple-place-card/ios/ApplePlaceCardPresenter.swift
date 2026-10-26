import MapKit
import UIKit

@available(iOS 18.0, *)
enum ApplePlaceCardPresenter {
  @MainActor
  static func present(appleId: String, from host: UIViewController) async -> String {
    guard let identifier = MKMapItem.Identifier(rawValue: appleId),
      let mapItem = try? await MKMapItemRequest(mapItemIdentifier: identifier).mapItem
    else { return "unavailable" }

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
      let coordinator = PlaceCardCoordinator(card: card, continuation: continuation)
      card.delegate = coordinator
      card.presentationController?.delegate = coordinator
      top.present(card, animated: true)
      // UIKit drops a refused presentation with only a log line, which would leave this await pending forever.
      if card.presentingViewController == nil {
        coordinator.finish("unavailable")
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
  // Both delegate slots are weak, so the coordinator keeps itself alive until it has answered.
  private var keepAlive: PlaceCardCoordinator?

  init(card: UIViewController, continuation: CheckedContinuation<String, Never>) {
    self.card = card
    self.continuation = continuation
    super.init()
    keepAlive = self
  }

  func finish(_ result: String) {
    continuation?.resume(returning: result)
    continuation = nil
    keepAlive = nil
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
