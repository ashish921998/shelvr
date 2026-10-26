import MapKit
import UIKit

@available(iOS 18.0, *)
enum ApplePlaceCardPresenter {
  @MainActor
  static func present(
    appleId: String,
    saveTitle: String,
    fromYourSave: String,
    openSave: String,
    from host: UIViewController
  ) async -> String {
    guard let identifier = MKMapItem.Identifier(rawValue: appleId),
      let mapItem = try? await MKMapItemRequest(mapItemIdentifier: identifier).mapItem
    else { return "unavailable" }

    return await withCheckedContinuation { continuation in
      let card = PlaceCardViewController(
        mapItem: mapItem,
        saveTitle: saveTitle,
        fromYourSave: fromYourSave,
        openSave: openSave
      )
      var finished = false
      card.onResult = { [weak card] result in
        guard !finished else { return }
        finished = true
        if result == "openSave" {
          card?.dismiss(animated: true) { continuation.resume(returning: result) }
        } else {
          continuation.resume(returning: result)
        }
      }
      card.modalPresentationStyle = .pageSheet
      if let sheet = card.sheetPresentationController {
        sheet.detents = [.medium(), .large()]
        sheet.prefersGrabberVisible = true
      }
      card.presentationController?.delegate = card
      host.present(card, animated: true)
    }
  }
}

@available(iOS 18.0, *)
final class PlaceCardViewController: UIViewController, MKMapItemDetailViewControllerDelegate,
  UIAdaptivePresentationControllerDelegate
{
  var onResult: ((String) -> Void)?

  private let mapItem: MKMapItem
  private let saveTitle: String
  private let fromYourSave: String
  private let openSave: String

  init(mapItem: MKMapItem, saveTitle: String, fromYourSave: String, openSave: String) {
    self.mapItem = mapItem
    self.saveTitle = saveTitle
    self.fromYourSave = fromYourSave
    self.openSave = openSave
    super.init(nibName: nil, bundle: nil)
  }

  @available(*, unavailable)
  required init?(coder: NSCoder) { fatalError("init(coder:) is not used") }

  override func viewDidLoad() {
    super.viewDidLoad()
    view.backgroundColor = .systemGroupedBackground

    // Apple keeps the detail view's hierarchy private, so the strip sits beside it, never inside.
    let detail = MKMapItemDetailViewController(mapItem: mapItem, displaysMap: false)
    detail.delegate = self
    addChild(detail)
    detail.view.translatesAutoresizingMaskIntoConstraints = false
    view.addSubview(detail.view)
    detail.didMove(toParent: self)

    let strip = makeStrip()
    view.addSubview(strip)

    NSLayoutConstraint.activate([
      detail.view.topAnchor.constraint(equalTo: view.topAnchor),
      detail.view.leadingAnchor.constraint(equalTo: view.leadingAnchor),
      detail.view.trailingAnchor.constraint(equalTo: view.trailingAnchor),
      detail.view.bottomAnchor.constraint(equalTo: strip.topAnchor),
      strip.leadingAnchor.constraint(equalTo: view.leadingAnchor),
      strip.trailingAnchor.constraint(equalTo: view.trailingAnchor),
      strip.bottomAnchor.constraint(equalTo: view.bottomAnchor),
    ])
  }

  private func makeStrip() -> UIView {
    let strip = UIView()
    strip.translatesAutoresizingMaskIntoConstraints = false
    strip.backgroundColor = .secondarySystemGroupedBackground

    let divider = UIView()
    divider.backgroundColor = .separator
    divider.translatesAutoresizingMaskIntoConstraints = false

    let caption = UILabel()
    caption.text = fromYourSave
    caption.font = .preferredFont(forTextStyle: .caption1)
    caption.adjustsFontForContentSizeCategory = true
    caption.textColor = .secondaryLabel

    let title = UILabel()
    title.text = saveTitle
    title.font = .systemFont(
      ofSize: UIFont.preferredFont(forTextStyle: .subheadline).pointSize, weight: .semibold)
    title.adjustsFontForContentSizeCategory = true
    title.textColor = .label
    title.numberOfLines = 1

    let labels = UIStackView(arrangedSubviews: [caption, title])
    labels.axis = .vertical
    labels.spacing = 2

    var configuration = UIButton.Configuration.filled()
    configuration.title = openSave
    configuration.cornerStyle = .capsule
    configuration.baseBackgroundColor = .label
    configuration.baseForegroundColor = .systemBackground
    let button = UIButton(configuration: configuration)
    button.setContentCompressionResistancePriority(.required, for: .horizontal)
    button.addAction(
      UIAction { [weak self] _ in self?.onResult?("openSave") },
      for: .touchUpInside
    )

    let row = UIStackView(arrangedSubviews: [labels, button])
    row.axis = .horizontal
    row.alignment = .center
    row.spacing = 12
    row.translatesAutoresizingMaskIntoConstraints = false

    strip.addSubview(divider)
    strip.addSubview(row)
    NSLayoutConstraint.activate([
      divider.topAnchor.constraint(equalTo: strip.topAnchor),
      divider.leadingAnchor.constraint(equalTo: strip.leadingAnchor),
      divider.trailingAnchor.constraint(equalTo: strip.trailingAnchor),
      divider.heightAnchor.constraint(equalToConstant: 1 / UIScreen.main.scale),
      row.topAnchor.constraint(equalTo: strip.topAnchor, constant: 12),
      row.leadingAnchor.constraint(equalTo: strip.leadingAnchor, constant: 16),
      row.trailingAnchor.constraint(equalTo: strip.trailingAnchor, constant: -16),
      row.bottomAnchor.constraint(equalTo: strip.safeAreaLayoutGuide.bottomAnchor, constant: -12),
    ])
    return strip
  }

  func mapItemDetailViewControllerDidFinish(_ detailViewController: MKMapItemDetailViewController) {
    dismiss(animated: true) { [onResult] in onResult?("dismissed") }
  }

  func presentationControllerDidDismiss(_ presentationController: UIPresentationController) {
    onResult?("dismissed")
  }
}
