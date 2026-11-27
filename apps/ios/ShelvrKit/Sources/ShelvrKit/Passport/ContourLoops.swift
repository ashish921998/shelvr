import Foundation

public struct ContourPoint: Equatable, Sendable {
  public let x, y: Double
}

public enum ContourLoops {
  public static let loopCount = 7
  public static let pointCount = 48

  public static func loops(seed: UInt32) -> [[ContourPoint]] {
    var state = seed
    func next() -> Double {
      state = ((state ^ (state >> 15)) &* 2246822507) &+ 374761393
      return Double(state) / 4294967296
    }
    let waves = [2.0, 3, 5].map { frequency -> (frequency: Double, amplitude: Double, phase: Double) in
      let amplitude = 0.04 + next() * 0.05
      return (frequency, amplitude, next() * 2 * .pi)
    }
    return (0..<loopCount).map { ring in
      let base = Double(8 + ring * 9)
      let drift = Double(ring) * 0.35
      var points = (0..<pointCount).map { step -> ContourPoint in
        let angle = Double(step) / Double(pointCount) * 2 * .pi
        let wobble = waves.reduce(1.0) { $0 + $1.amplitude * sin($1.frequency * angle + $1.phase + drift) }
        return ContourPoint(x: 50 + cos(angle) * base * 1.6 * wobble, y: 50 + sin(angle) * base * wobble)
      }
      points.append(points[0])
      return points
    }
  }
}
