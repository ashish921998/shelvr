package app.shelvr.recentsaves

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class RecentSavesLayoutTest {
  @Test
  fun `budget is 80 percent of the platform limit, split between copies`() {
    // 1080 x 2400 x 4 bytes x 1.5 = 15,552,000; 80% of that is 12,441,600.
    assertEquals(12_441_600L, RecentSavesLayout.bitmapBudget(1080, 2400, 1))
    assertEquals(6_220_800L, RecentSavesLayout.bitmapBudget(1080, 2400, 2))
  }

  @Test
  fun `thumbnails that fit are left alone`() {
    assertEquals(1.0, RecentSavesLayout.budgetScale(1_000L, 1_000L), 0.0)
    assertEquals(1.0, RecentSavesLayout.budgetScale(0L, 0L), 0.0)
  }

  @Test
  fun `five full thumbnails on a small screen shrink together to fit`() {
    // 480 x 800 on Android 12+: 921,600 bytes per layout.
    val budget = RecentSavesLayout.bitmapBudget(480, 800, 2)
    val side = RecentSavesLayout.MAX_THUMBNAIL_PX
    val total = 5L * side * side * 4
    val scale = RecentSavesLayout.budgetScale(total, budget)
    assertTrue(scale < 1.0)
    val scaledSide = RecentSavesLayout.scaled(side, scale).toLong()
    assertTrue(5 * scaledSide * scaledSide * 4 <= budget)
  }

  @Test
  fun `a scaled side never reaches zero`() {
    assertEquals(1, RecentSavesLayout.scaled(3, 0.01))
  }

  @Test
  fun `decode sample keeps the longest side at or above the thumbnail size`() {
    assertEquals(1, RecentSavesLayout.sampleSize(512, 512))
    assertEquals(1, RecentSavesLayout.sampleSize(767, 300))
    assertEquals(2, RecentSavesLayout.sampleSize(768, 300))
    assertEquals(8, RecentSavesLayout.sampleSize(1000, 4000))
    assertTrue(4000 / RecentSavesLayout.sampleSize(1000, 4000) >= RecentSavesLayout.MAX_THUMBNAIL_PX)
  }

  @Test
  fun `shapes within bounds are not cropped`() {
    assertNull(RecentSavesLayout.ratioCrop(384, 384))
    assertNull(RecentSavesLayout.ratioCrop(192, 384))
    assertNull(RecentSavesLayout.ratioCrop(384, 192))
  }

  @Test
  fun `a tall strip is center cropped to one by two`() {
    assertEquals(RecentSavesLayout.Crop(0, 142, 100, 200), RecentSavesLayout.ratioCrop(100, 484))
  }

  @Test
  fun `a wide panorama is center cropped to two by one`() {
    assertEquals(RecentSavesLayout.Crop(150, 0, 200, 100), RecentSavesLayout.ratioCrop(500, 100))
  }

  @Test
  fun `one or two saves take the full width`() {
    assertEquals(listOf(listOf(1, 2), emptyList<Int>()), RecentSavesLayout.gridColumns(listOf(1, 2)))
    assertEquals(listOf(listOf(1), emptyList<Int>()), RecentSavesLayout.gridColumns(listOf(1)))
  }

  @Test
  fun `more saves alternate between the columns newest first`() {
    assertEquals(
      listOf(listOf(1, 3, 5), listOf(2, 4)),
      RecentSavesLayout.gridColumns(listOf(1, 2, 3, 4, 5)),
    )
  }
}
