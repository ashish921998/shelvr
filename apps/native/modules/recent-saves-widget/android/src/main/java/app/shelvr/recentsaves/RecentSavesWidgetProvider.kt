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
        manager.updateAppWidget(id, renderer.views(manager.getAppWidgetOptions(id)))
      }
    }

    // A snapshot outlives the app, so a Pro entitlement that lapses while the
    // app stays closed must still lock the widget. Redraw at the expiry; the
    // redraw reads the clock and shows the locked state. The alarm is inexact,
    // and the six-hourly update in the provider info backs it up.
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
        alarms.set(AlarmManager.RTC, at, pending)
      }
    }
  }
}
