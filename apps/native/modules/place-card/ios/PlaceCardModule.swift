import ExpoModulesCore
import Foundation

public class PlaceCardModule: Module {
  public func definition() -> ModuleDefinition {
    Name("PlaceCard")

    Constant("configured") {
      !(Bundle.main.object(forInfoDictionaryKey: "ShelvrGooglePlacesApiKey") as? String ?? "").isEmpty
    }

    View(PlaceCardView.self) {
      Events("onStatus", "onHeight")
      Prop("placeName") { (view: PlaceCardView, name: String) in view.placeName = name }
      Prop("latitude") { (view: PlaceCardView, value: Double) in view.latitude = value }
      Prop("longitude") { (view: PlaceCardView, value: Double) in view.longitude = value }
      OnViewDidUpdateProps { (view: PlaceCardView) in view.loadPlace() }
    }
  }
}
