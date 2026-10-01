package app.shelvr.recentsaves

import kotlin.math.sqrt

// The widget's sizing rules as plain numbers, kept free of Android types so
// JUnit covers them without a device (RecentSavesLayoutTest).
internal object RecentSavesLayout {
  // The app writes thumbnails up to 512px. Launchers cap the bitmap memory
  // one widget update may carry, so each is drawn at most this size.
  const val MAX_THUMBNAIL_PX = 384
  // Leaves headroom in the update's bitmap budget for anything else it carries.
  private const val BUDGET_SHARE_PERCENT = 80L
  // Extreme shapes are trimmed to these bounds, the same as the feed.
  const val MIN_RATIO = 0.5f
  const val MAX_RATIO = 2f
  // Tall and square photos fill the featured card; wider ones sit above the caption.
  private const val COVER_MAX_RATIO = 1.5f

  /**
   * Bytes of bitmap each layout of one update may carry. Android rejects an
   * update whose bitmaps exceed 1.5 x the screen's pixels x 4 bytes, and on
   * Android 12+ the grid and the list travel in the same update, so `copies`
   * splits the budget between them.
   */
  fun bitmapBudget(screenWidthPx: Int, screenHeightPx: Int, copies: Int): Long =
    screenWidthPx.toLong() * screenHeightPx * 4 * 3 / 2 * BUDGET_SHARE_PERCENT / 100 / copies

  /**
   * The factor every thumbnail's sides shrink by so their bytes fit the
   * budget together, or 1 when they already do. Bytes scale with area, so
   * the sides take the square root.
   */
  fun budgetScale(totalBytes: Long, budgetBytes: Long): Double =
    if (totalBytes <= budgetBytes || totalBytes == 0L) 1.0 else sqrt(budgetBytes.toDouble() / totalBytes)

  /** A side after scaling, never below one pixel. */
  fun scaled(side: Int, scale: Double): Int = maxOf(1, (side * scale).toInt())

  /** The power-of-two decode sample that keeps the longest side at or above the thumbnail size. */
  fun sampleSize(width: Int, height: Int): Int {
    var sample = 1
    while (maxOf(width, height) / (sample * 2) >= MAX_THUMBNAIL_PX) sample *= 2
    return sample
  }

  /** The center crop that trims an extreme shape into bounds, or null when it already fits. */
  fun ratioCrop(width: Int, height: Int): Crop? {
    val ratio = width.toFloat() / height
    return when {
      ratio < MIN_RATIO -> {
        val cropped = (width / MIN_RATIO).toInt()
        Crop(0, (height - cropped) / 2, width, cropped)
      }
      ratio > MAX_RATIO -> {
        val cropped = (height * MAX_RATIO).toInt()
        Crop((width - cropped) / 2, 0, cropped, height)
      }
      else -> null
    }
  }

  fun isCover(width: Int, height: Int): Boolean = width.toFloat() / height < COVER_MAX_RATIO

  /**
   * Splits saves into the grid's two columns, alternating so the newest sit
   * on top. One or two saves take the full width instead of a half-empty grid.
   */
  fun <T> gridColumns(items: List<T>): List<List<T>> =
    if (items.size <= 2) {
      listOf(items, emptyList())
    } else {
      listOf(items.filterIndexed { i, _ -> i % 2 == 0 }, items.filterIndexed { i, _ -> i % 2 == 1 })
    }

  data class Crop(val x: Int, val y: Int, val width: Int, val height: Int)
}
