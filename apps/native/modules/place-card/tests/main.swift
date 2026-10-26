// Run: swiftc modules/place-card/ios/PlaceCardMatch.swift modules/place-card/tests/main.swift -o /tmp/place-card-match && /tmp/place-card-match
import Foundation

func accepts(_ expected: String, _ actual: String, _ lat: Double = 30.25, _ lng: Double = -97.75) -> Bool {
  PlaceCardMatch.accepts(expected: expected, actual: actual, lat: 30.25, lng: -97.75, foundLat: lat, foundLng: lng)
}

precondition(accepts("Jos Coffee", "Jo's Coffee"))
precondition(accepts("Heritage Boot", "Heritage Boot Co."))
precondition(accepts("Café", "Cafe"))
precondition(!accepts("Jos Coffee", "Other Coffee"))
precondition(!accepts("Jos Coffee", "Jo's Coffee", 31.25))
precondition(!accepts("", ""))
precondition(!accepts("AB", "ABC"))
precondition(!accepts("Jos Coffee", "Jo's Coffee", .nan))
print("Place card matching checks passed")
