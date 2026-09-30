package app.shelvr.recentsaves

import android.content.Context
import android.net.Uri
import org.json.JSONObject
import java.io.File

internal data class WidgetSaveItem(
  val id: String,
  val title: String,
  val subtitle: String,
  val kind: String,
  val imagePath: String?,
)

// Mirrors RecentSavesWidgetProps in src/widgets/recent-saves-widget.tsx.
internal data class RecentSavesSnapshot(
  val items: List<WidgetSaveItem>,
  val emptyTitle: String,
  val emptyHint: String,
  val locked: Boolean,
  val validUntil: Long?,
  // The Pro copy for when the widget locks itself at `validUntil`.
  val lockedTitle: String?,
  val lockedHint: String?,
) {
  // Fail closed like the iOS widget: once the widget's own clock passes the
  // expiry, it shows the locked state even if the app never ran again.
  fun isLocked(now: Long): Boolean = locked || expired(now)

  private fun expired(now: Long) = validUntil != null && now >= validUntil

  fun title(now: Long): String = if (!locked && expired(now)) lockedTitle ?: emptyTitle else emptyTitle

  fun hint(now: Long): String = if (!locked && expired(now)) lockedHint ?: emptyHint else emptyHint

  companion object {
    private const val PREFS = "shelvr_recent_saves_widget"
    private const val KEY = "snapshot"

    fun thumbnailDirectory(context: Context): File =
      File(context.filesDir, "recent-saves-widget").apply { mkdirs() }

    fun write(context: Context, json: String) {
      // Parse before storing so a malformed snapshot never replaces a good one.
      parse(json)
      context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        .edit()
        .putString(KEY, json)
        .commit()
    }

    // No snapshot yet reads as locked: the widget shows nothing until the app
    // has published one for a signed-in Pro account.
    fun read(context: Context): RecentSavesSnapshot {
      val json = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(KEY, null)
      return json?.let { runCatching { parse(it) }.getOrNull() } ?: RecentSavesSnapshot(
        items = emptyList(),
        emptyTitle = "Shelvr",
        emptyHint = "",
        locked = true,
        validUntil = null,
        lockedTitle = null,
        lockedHint = null,
      )
    }

    private fun parse(json: String): RecentSavesSnapshot {
      val root = JSONObject(json)
      val array = root.optJSONArray("items")
      val items = buildList {
        if (array != null) {
          for (index in 0 until array.length()) {
            val item = array.getJSONObject(index)
            add(
              WidgetSaveItem(
                id = item.getString("id"),
                title = item.optString("title"),
                subtitle = item.optString("subtitle"),
                kind = item.optString("kind", "note"),
                imagePath = item.optString("imageUri").takeIf { it.isNotEmpty() }?.let { Uri.parse(it).path },
              )
            )
          }
        }
      }
      return RecentSavesSnapshot(
        items = items,
        emptyTitle = root.optString("emptyTitle", "Shelvr"),
        emptyHint = root.optString("emptyHint"),
        locked = root.optBoolean("locked", true),
        validUntil = if (root.isNull("validUntil")) null else root.getLong("validUntil"),
        lockedTitle = if (root.isNull("lockedTitle")) null else root.getString("lockedTitle"),
        lockedHint = if (root.isNull("lockedHint")) null else root.getString("lockedHint"),
      )
    }
  }
}
