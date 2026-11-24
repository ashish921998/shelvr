import Foundation

extension MapPlace {
  private static let categories = [
    "Restaurant": "🍽️",
    "FoodMarket": "🛒",
    "Cafe": "☕",
    "Bakery": "🥐",
    "Nightlife": "🍸",
    "Brewery": "🍺",
    "Winery": "🍷",
    "Distillery": "🥃",
    "Museum": "🏛️",
    "Landmark": "📸",
    "NationalMonument": "🏛️",
    "Castle": "🏰",
    "Fortress": "🏰",
    "Park": "🌳",
    "NationalPark": "🏞️",
    "Hiking": "🥾",
    "Beach": "🏖️",
    "Theater": "🎭",
    "MovieTheater": "🎬",
    "MusicVenue": "🎵",
    "Stadium": "🏟️",
    "Zoo": "🦁",
    "Aquarium": "🐠",
    "Planetarium": "🔭",
    "Spa": "💆",
    "FitnessCenter": "🏋️",
    "AmusementPark": "🎢",
    "Bowling": "🎳",
    "GoKart": "🏎️",
    "MiniGolf": "⛳",
    "RockClimbing": "🧗",
    "Skating": "⛸️",
    "Store": "🛍️",
    "Hotel": "🛏️",
  ]

  private static let kindEmoji: [PlaceKind: String] = [
    .food: "🍽️",
    .coffee: "☕",
    .dessert: "🍰",
    .drinks: "🍸",
    .dateNight: "💕",
    .activities: "🎟️",
    .shopping: "🛍️",
    .stay: "🛏️",
  ]

  private static let cuisines = [
    "burger": "🍔",
    "pizza": "🍕",
    "tacos": "🌮",
    "sushi": "🍣",
    "noodles": "🍜",
    "dumplings": "🥟",
    "bbq": "🍖",
    "steak": "🥩",
    "seafood": "🦞",
    "curry": "🍛",
    "pasta": "🍝",
    "donuts": "🍩",
    "ice cream": "🍨",
    "bakery": "🥐",
    "bagels": "🥯",
    "dessert": "🍰",
    "coffee": "☕",
    "tea": "🍵",
    "beer": "🍺",
    "wine": "🍷",
    "cocktails": "🍸",
    "brunch": "🥞",
    "sandwiches": "🥪",
    "salad": "🥗",
    "chicken": "🍗",
  ]

  private static let names: [([String], String)] = [
    (["burger", "burgers", "smash"], "burger"),
    (["pizza", "pizzas", "pizzeria"], "pizza"),
    (["taco", "tacos", "taqueria", "cantina"], "tacos"),
    (["sushi", "omakase", "izakaya"], "sushi"),
    (["ramen", "noodle", "noodles", "pho", "udon"], "noodles"),
    (["dumpling", "dumplings", "dim sum", "bao"], "dumplings"),
    (["bbq", "barbecue", "smokehouse"], "bbq"),
    (["steakhouse", "steak"], "steak"),
    (["seafood", "oyster", "oysters", "crab", "lobster"], "seafood"),
    (["curry", "tandoori", "masala"], "curry"),
    (["pasta", "trattoria", "osteria"], "pasta"),
    (["donut", "donuts", "doughnut", "doughnuts"], "donuts"),
    (["ice cream", "ice creams", "gelato", "gelateria", "creamery"], "ice cream"),
    (["bakery", "boulangerie", "patisserie", "croissant"], "bakery"),
    (["bagel", "bagels"], "bagels"),
    (["cake", "cakes", "dessert", "desserts", "sweets"], "dessert"),
    (["coffee", "espresso", "cafe", "roaster", "roasters"], "coffee"),
    (["tea", "matcha", "boba"], "tea"),
    (["brewery", "brewing", "taproom", "beer", "pub"], "beer"),
    (["wine", "vino", "enoteca"], "wine"),
    (["cocktail", "cocktails", "speakeasy"], "cocktails"),
    (["brunch", "breakfast", "diner", "pancake", "pancakes"], "brunch"),
    (["sandwich", "sandwiches", "deli"], "sandwiches"),
    (["salad", "poke"], "salad"),
    (["chicken", "wings"], "chicken"),
  ]

  public var emoji: String? {
    let categoryEmoji = category.flatMap { Self.categories[$0] }
    if category == nil || ["Restaurant", "Cafe", "Bakery", "Nightlife"].contains(category ?? "") {
      if let cuisine, let emoji = Self.cuisines[cuisine] { return emoji }
      let padded = " " + Self.words(name).joined(separator: " ") + " "
      var first: (String.Index, String)?
      for (words, cuisine) in Self.names {
        for word in words {
          if let at = padded.range(of: " " + word + " ")?.lowerBound,
            first.map({ at < $0.0 }) ?? true {
            first = (at, cuisine)
          }
        }
      }
      if let first { return Self.cuisines[first.1] }
    }
    if let categoryEmoji { return categoryEmoji }
    let order: [PlaceKind] = [.coffee, .dessert, .drinks, .food, .stay, .shopping, .activities]
    return order.first(where: kinds.contains).flatMap { Self.kindEmoji[$0] }
  }
}
