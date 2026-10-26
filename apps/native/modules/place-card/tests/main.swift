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
precondition(!accepts("Heritage Boot", "Heritage Bootleg"))
precondition(PlaceCardMatch.accepts(expected: "Café de Flore, Paris", actual: "Café de Flore", city: "Paris", lat: 48.85, lng: 2.33, foundLat: 48.85, foundLng: 2.33))
precondition(!PlaceCardMatch.accepts(expected: "Cafe, Paris", actual: "Cafe", city: "Porto", lat: 48.85, lng: 2.33, foundLat: 48.85, foundLng: 2.33))
let nearby = PlaceCardMatch.Candidate(name: "Jo's Coffee", lat: 30.25, lng: -97.75)
let far = PlaceCardMatch.Candidate(name: "Jo's Coffee", lat: 31.25, lng: -97.75)
precondition(PlaceCardMatch.uniqueIndex(expected: "Jos Coffee", lat: 30.25, lng: -97.75, candidates: [far, nearby]) == 1)
precondition(PlaceCardMatch.uniqueIndex(expected: "Jos Coffee", lat: 30.25, lng: -97.75, candidates: [nearby, nearby]) == nil)
precondition(PlaceCardMatch.uniqueIndex(expected: "Jos Coffee", lat: 30.25, lng: -97.75, candidates: [far]) == nil)
print("Place card matching checks passed")
