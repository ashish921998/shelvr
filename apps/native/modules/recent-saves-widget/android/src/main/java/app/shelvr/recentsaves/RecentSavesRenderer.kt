package app.shelvr.recentsaves

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.util.SizeF
import android.view.View
import android.widget.RemoteViews

// Draws the Recent Saves widget from a snapshot. The look follows the iOS
// widget (src/widgets/recent-saves-widget.tsx) and the layout rules follow
// Amber's Android widget: a two-column masonry grid at two cells wide, the
// latest save featured beside four rows when wider, and photos kept close to
// their own shape instead of center-cropped.
internal class RecentSavesRenderer(
  private val context: Context,
  private val snapshot: RecentSavesSnapshot,
  private val now: Long,
  // False draws every save as its text tile, the fallback when a launcher
  // still rejects an update for its bitmap size.
  withImages: Boolean = true,
) {
  private val locked = snapshot.isLocked(now)
  // A locked widget never shows saved content, even if items came through.
  private val items = if (locked) emptyList() else snapshot.items
  private val thumbnails: Map<String, Bitmap?> =
    if (withImages) fitBudget(items.associate { item -> item.id to item.imagePath?.let { loadThumbnail(it) } })
    else emptyMap()

  // The budget covers the whole update, not each image, so on a small screen
  // five full thumbnails can pass it. Shrink them all together until they fit.
  private fun fitBudget(bitmaps: Map<String, Bitmap?>): Map<String, Bitmap?> {
    val metrics = context.resources.displayMetrics
    val copies = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) 2 else 1
    val budget = RecentSavesLayout.bitmapBudget(metrics.widthPixels, metrics.heightPixels, copies)
    val total = bitmaps.values.filterNotNull().sumOf { it.allocationByteCount.toLong() }
    val scale = RecentSavesLayout.budgetScale(total, budget)
    if (scale >= 1.0) return bitmaps
    return bitmaps.mapValues { (_, bitmap) ->
      bitmap?.let { oom { scaled(it, scale) } }
    }
  }

  fun views(options: Bundle): RemoteViews {
    if (items.isEmpty()) return empty()
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      return RemoteViews(
        mapOf(
          SizeF(110f, 110f) to grid(),
          SizeF(LIST_MIN_WIDTH_DP, 110f) to list(),
        )
      )
    }
    val width = options.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH, LIST_MIN_WIDTH_DP.toInt())
    return if (width < LIST_MIN_WIDTH_DP) grid() else list()
  }

  private fun empty(): RemoteViews {
    val views = RemoteViews(context.packageName, R.layout.recent_saves_widget_empty)
    views.setImageViewResource(
      R.id.recent_saves_empty_icon,
      if (locked) R.drawable.recent_saves_widget_lock else R.drawable.recent_saves_widget_inbox,
    )
    val hint = snapshot.hint(now)
    views.setTextViewText(R.id.recent_saves_empty_title, snapshot.title(now))
    views.setTextViewText(R.id.recent_saves_empty_hint, hint)
    views.setViewVisibility(R.id.recent_saves_empty_hint, if (hint.isEmpty()) View.GONE else View.VISIBLE)
    views.setOnClickPendingIntent(
      R.id.recent_saves_root,
      open(if (locked) "shelvr:///paywall" else "shelvr:///add"),
    )
    return views
  }

  private fun grid(): RemoteViews {
    val views = RemoteViews(context.packageName, R.layout.recent_saves_widget_grid)
    views.setOnClickPendingIntent(R.id.recent_saves_root, open("shelvr:///"))
    val columns = RecentSavesLayout.gridColumns(items)
    views.setViewVisibility(R.id.grid_c1, if (columns[1].isEmpty()) View.GONE else View.VISIBLE)
    for ((c, column) in columns.withIndex()) {
      for (s in GRID_SLOTS[c].indices) {
        val slot = GRID_SLOTS[c][s]
        val item = column.getOrNull(s)
        if (item == null) {
          views.setViewVisibility(slot.root, View.GONE)
          continue
        }
        views.setViewVisibility(slot.root, View.VISIBLE)
        views.setOnClickPendingIntent(slot.root, open(itemUrl(item)))
        views.setContentDescription(slot.root, item.title)
        val bitmap = thumbnails[item.id]
        if (bitmap != null) {
          views.setImageViewBitmap(slot.image, bitmap)
          views.setViewVisibility(slot.image, View.VISIBLE)
          views.setViewVisibility(slot.text, View.GONE)
        } else {
          views.setViewVisibility(slot.image, View.GONE)
          views.setViewVisibility(slot.text, View.VISIBLE)
          views.setImageViewResource(slot.icon, kindIcon(item.kind))
          views.setTextViewText(slot.title, item.title)
        }
      }
    }
    return views
  }

  private fun list(): RemoteViews {
    val views = RemoteViews(context.packageName, R.layout.recent_saves_widget_list)
    views.setOnClickPendingIntent(R.id.recent_saves_root, open("shelvr:///"))

    val featured = items.first()
    val bitmap = thumbnails[featured.id]
    views.setOnClickPendingIntent(R.id.list_featured, open(itemUrl(featured)))
    views.setContentDescription(R.id.list_featured, featured.title)
    // A photo fills the card with the caption over a scrim; a save without
    // one shows its type icon.
    views.setViewVisibility(R.id.list_featured_cover, if (bitmap != null) View.VISIBLE else View.GONE)
    views.setViewVisibility(R.id.list_featured_card, if (bitmap != null) View.GONE else View.VISIBLE)
    if (bitmap != null) {
      views.setImageViewBitmap(R.id.list_featured_cover_image, bitmap)
      views.setTextViewText(R.id.list_featured_cover_title, featured.title)
      views.setTextViewText(R.id.list_featured_cover_subtitle, featured.subtitle)
    } else {
      views.setImageViewResource(R.id.list_featured_icon, kindIcon(featured.kind))
      views.setTextViewText(R.id.list_featured_title, featured.title)
      views.setTextViewText(R.id.list_featured_subtitle, featured.subtitle)
    }

    for ((index, row) in LIST_ROWS.withIndex()) {
      val item = items.getOrNull(index + 1)
      if (item == null) {
        // Invisible, not gone: rows keep their share of the height.
        views.setViewVisibility(row.root, View.INVISIBLE)
        continue
      }
      views.setViewVisibility(row.root, View.VISIBLE)
      views.setOnClickPendingIntent(row.root, open(itemUrl(item)))
      views.setContentDescription(row.root, item.title)
      views.setTextViewText(row.title, item.title)
      views.setTextViewText(row.subtitle, item.subtitle)
      val thumb = thumbnails[item.id]
      if (thumb != null) {
        views.setImageViewBitmap(row.image, thumb)
        views.setViewVisibility(row.image, View.VISIBLE)
        views.setViewVisibility(row.tile, View.GONE)
      } else {
        views.setViewVisibility(row.image, View.GONE)
        views.setViewVisibility(row.tile, View.VISIBLE)
        views.setImageViewResource(row.icon, kindIcon(item.kind))
      }
    }
    return views
  }

  private fun itemUrl(item: WidgetSaveItem) = "shelvr:///item/${Uri.encode(item.id)}"

  // Deep links open in the app like the iOS widgetURL. Each URL gets its own
  // request code so one tap target's intent never replaces another's.
  private fun open(url: String): PendingIntent {
    val intent = Intent(Intent.ACTION_VIEW, Uri.parse(url))
      .setPackage(context.packageName)
      .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    return PendingIntent.getActivity(
      context,
      url.hashCode(),
      intent,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )
  }

  private fun kindIcon(kind: String) = when (kind) {
    "link" -> R.drawable.recent_saves_widget_link
    "note" -> R.drawable.recent_saves_widget_note
    else -> R.drawable.recent_saves_widget_photo
  }

  private class GridSlot(val root: Int, val image: Int, val text: Int, val icon: Int, val title: Int)

  private class ListRow(
    val root: Int,
    val image: Int,
    val tile: Int,
    val icon: Int,
    val title: Int,
    val subtitle: Int,
  )

  companion object {
    private const val LIST_MIN_WIDTH_DP = 250f

    private val GRID_SLOTS = listOf(
      listOf(
        GridSlot(R.id.grid_c0_s0, R.id.grid_c0_s0_image, R.id.grid_c0_s0_text, R.id.grid_c0_s0_icon, R.id.grid_c0_s0_title),
        GridSlot(R.id.grid_c0_s1, R.id.grid_c0_s1_image, R.id.grid_c0_s1_text, R.id.grid_c0_s1_icon, R.id.grid_c0_s1_title),
        GridSlot(R.id.grid_c0_s2, R.id.grid_c0_s2_image, R.id.grid_c0_s2_text, R.id.grid_c0_s2_icon, R.id.grid_c0_s2_title),
      ),
      listOf(
        GridSlot(R.id.grid_c1_s0, R.id.grid_c1_s0_image, R.id.grid_c1_s0_text, R.id.grid_c1_s0_icon, R.id.grid_c1_s0_title),
        GridSlot(R.id.grid_c1_s1, R.id.grid_c1_s1_image, R.id.grid_c1_s1_text, R.id.grid_c1_s1_icon, R.id.grid_c1_s1_title),
        GridSlot(R.id.grid_c1_s2, R.id.grid_c1_s2_image, R.id.grid_c1_s2_text, R.id.grid_c1_s2_icon, R.id.grid_c1_s2_title),
      ),
    )

    private val LIST_ROWS = listOf(
      ListRow(R.id.list_row0, R.id.list_row0_image, R.id.list_row0_tile, R.id.list_row0_icon, R.id.list_row0_title, R.id.list_row0_subtitle),
      ListRow(R.id.list_row1, R.id.list_row1_image, R.id.list_row1_tile, R.id.list_row1_icon, R.id.list_row1_title, R.id.list_row1_subtitle),
      ListRow(R.id.list_row2, R.id.list_row2_image, R.id.list_row2_tile, R.id.list_row2_icon, R.id.list_row2_title, R.id.list_row2_subtitle),
      ListRow(R.id.list_row3, R.id.list_row3_image, R.id.list_row3_tile, R.id.list_row3_icon, R.id.list_row3_title, R.id.list_row3_subtitle),
    )

    // A missing or undecodable file falls back to the text tile, like iOS.
    private fun loadThumbnail(path: String): Bitmap? = oom {
      try {
        val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        BitmapFactory.decodeFile(path, bounds)
        if (bounds.outWidth <= 0 || bounds.outHeight <= 0) {
          null
        } else {
          val options = BitmapFactory.Options().apply {
            inSampleSize = RecentSavesLayout.sampleSize(bounds.outWidth, bounds.outHeight)
          }
          BitmapFactory.decodeFile(path, options)?.let { clampRatio(scaleDown(it)) }
        }
      } catch (error: Exception) {
        null
      }
    }

    // Every bitmap this renderer allocates goes through here, so memory
    // pressure costs one image its thumbnail (a text tile) and never the update.
    private inline fun oom(allocate: () -> Bitmap?): Bitmap? =
      try {
        allocate()
      } catch (error: OutOfMemoryError) {
        null
      }

    private fun scaled(bitmap: Bitmap, scale: Double): Bitmap =
      Bitmap.createScaledBitmap(
        bitmap,
        RecentSavesLayout.scaled(bitmap.width, scale),
        RecentSavesLayout.scaled(bitmap.height, scale),
        true,
      )

    private fun scaleDown(bitmap: Bitmap): Bitmap {
      val longest = maxOf(bitmap.width, bitmap.height)
      if (longest <= RecentSavesLayout.MAX_THUMBNAIL_PX) return bitmap
      return scaled(bitmap, RecentSavesLayout.MAX_THUMBNAIL_PX.toDouble() / longest)
    }

    private fun clampRatio(bitmap: Bitmap): Bitmap {
      val crop = RecentSavesLayout.ratioCrop(bitmap.width, bitmap.height) ?: return bitmap
      return Bitmap.createBitmap(bitmap, crop.x, crop.y, crop.width, crop.height)
    }
  }
}
