package app.shelvr.recentsaves

import android.app.AlarmManager
import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.os.Bundle

class RecentSavesWidgetProvider : AppWidgetProvider() {
  override fun onUpdate(context: Context, manager: AppWidgetManager, ids: IntArray) {
    render(context, manager, ids)
  }

  // Resizing on Android 11 and older picks the grid or the list from the new
  // width. Android 12+ launchers pick from the sized layouts on their own.
  override fun onAppWidgetOptionsChanged(
    context: Context,
    manager: AppWidgetManager,
    id: Int,
    options: Bundle,
  ) {
    render(context, manager, intArrayOf(id))
  }

  companion object {
    fun updateAll(context: Context) {
      val manager = AppWidgetManager.getInstance(context)
      val ids = manager.getAppWidgetIds(ComponentName(context, RecentSavesWidgetProvider::class.java))
      render(context, manager, ids)
    }

    private fun render(context: Context, manager: AppWidgetManager, ids: IntArray) {
      val snapshot = RecentSavesSnapshot.read(context)
      val now = System.currentTimeMillis()
      val locked = snapshot.isLocked(now)
      scheduleLock(context, if (locked || ids.isEmpty()) null else snapshot.validUntil)
      if (ids.isEmpty()) return
      val renderer = RecentSavesRenderer(context, snapshot, now)
      for (id in ids) {
        val options = manager.getAppWidgetOptions(id)
        try {
          manager.updateAppWidget(id, renderer.views(options))
        } catch (error: IllegalArgumentException) {
          // Over the launcher's bitmap budget despite the shrink: show the
          // saves as text tiles rather than leave the widget stale.
          manager.updateAppWidget(id, RecentSavesRenderer(context, snapshot, now, withImages = false).views(options))
        }
      }
    }

    // A snapshot outlives the app, so a Pro entitlement that lapses while the
    // app stays closed must still lock the widget. Redraw at the expiry; the
    // redraw reads the clock and shows the locked state. Android has no exact
    // alarm without a special permission, so this one wakes the device but may
    // land some minutes late, and the six-hourly update backs it up. The app
    // locks at the stored period end plus a week's grace, so minutes matter
    // little.
    private fun scheduleLock(context: Context, at: Long?) {
      val alarms = context.getSystemService(Context.ALARM_SERVICE) as? AlarmManager ?: return
      val intent = Intent(context, RecentSavesWidgetProvider::class.java)
        .setAction(AppWidgetManager.ACTION_APPWIDGET_UPDATE)
        .putExtra(
          AppWidgetManager.EXTRA_APPWIDGET_IDS,
          AppWidgetManager.getInstance(context)
            .getAppWidgetIds(ComponentName(context, RecentSavesWidgetProvider::class.java)),
        )
      val pending = PendingIntent.getBroadcast(
        context,
        0,
        intent,
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
      )
      if (at == null) {
        alarms.cancel(pending)
      } else {
        alarms.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pending)
      }
    }
  }
}
