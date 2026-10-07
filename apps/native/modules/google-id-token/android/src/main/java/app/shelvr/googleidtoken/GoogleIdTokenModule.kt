package app.shelvr.googleidtoken

import androidx.credentials.CredentialManager
import androidx.credentials.CustomCredential
import androidx.credentials.GetCredentialRequest
import androidx.credentials.exceptions.GetCredentialCancellationException
import com.google.android.libraries.identity.googleid.GetGoogleIdOption
import com.google.android.libraries.identity.googleid.GoogleIdTokenCredential
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.functions.Coroutine
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

// Shows Android's Google account bottom sheet (Credential Manager) and returns
// the chosen account's Google ID token, which Convex verifies and signs in
// with. Resolves null when the person dismisses the sheet; rejects when the
// sheet cannot show (no Google account, Play services missing), and the app
// falls back to the browser flow.
class GoogleIdTokenModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("GoogleIdToken")

    AsyncFunction("getIdToken") Coroutine { serverClientId: String ->
      val activity = appContext.currentActivity ?: throw Exceptions.MissingActivity()
      val option = GetGoogleIdOption.Builder()
        .setServerClientId(serverClientId)
        .setFilterByAuthorizedAccounts(false)
        .build()
      val request = GetCredentialRequest.Builder().addCredentialOption(option).build()
      val credential = try {
        CredentialManager.create(activity).getCredential(activity, request).credential
      } catch (e: GetCredentialCancellationException) {
        return@Coroutine null
      }
      if (credential !is CustomCredential ||
        credential.type != GoogleIdTokenCredential.TYPE_GOOGLE_ID_TOKEN_CREDENTIAL
      ) {
        throw CodedException("ERR_UNEXPECTED_CREDENTIAL", "Not a Google ID token", null)
      }
      GoogleIdTokenCredential.createFrom(credential.data).idToken
    }
  }
}
