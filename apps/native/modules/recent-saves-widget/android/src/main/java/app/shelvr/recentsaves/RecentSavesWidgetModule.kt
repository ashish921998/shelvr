package app.shelvr.recentsaves

import android.content.Context
import android.net.Uri
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

// The app side of the Android Recent Saves widget: lib/widget-sync writes the
// snapshot here and the widget provider draws it. iOS uses expo-widgets.
class RecentSavesWidgetModule : Module() {
  private val context: Context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  override fun definition() = ModuleDefinition {
    Name("RecentSavesWidget")

    // Thumbnails live in the app's private files, which the provider reads
    // in the app's own process before handing bitmaps to the launcher.
    Function("getDirectory") {
      Uri.fromFile(RecentSavesSnapshot.thumbnailDirectory(context)).toString()
    }

    AsyncFunction("setSnapshot") { json: String ->
      RecentSavesSnapshot.write(context, json)
      RecentSavesWidgetProvider.updateAll(context)
    }
  }
}
