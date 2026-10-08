import type { Metadata } from "next";
import { LegalPage } from "@/components/LegalPage";
import { SUPPORT_EMAIL } from "@/lib/support";

export const metadata: Metadata = {
  title: "Privacy Policy — Shelvr",
  description: "How Shelvr collects, uses, and protects your data.",
};

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy Policy" lastUpdated="October 8, 2026">
      <section>
        <h2 className="font-semibold text-ink text-lg">What Shelvr is</h2>
        <p className="mt-2">
          Shelvr is a save-it-for-later app: you capture links, images, and
          notes, and Shelvr organizes them into spaces so you can find them
          again. This policy explains what data is collected to make that work,
          who handles it, and what you can control.
        </p>
      </section>

      <section>
        <h2 className="font-semibold text-ink text-lg">Data we collect</h2>
        <ul className="mt-2 list-disc pl-5 space-y-2">
          <li>
            <strong>Account information.</strong> When you sign up we collect
            your email address (and your name, if your sign-in provider shares
            it). You sign in with Apple or Google.
          </li>
          <li>
            <strong>Waitlist signup.</strong> If you join an availability
            waitlist, including the Android waitlist, we collect your email
            address and the consent text you agreed to, only to send the
            relevant launch notification. The address is stored in our backend
            (Convex) and may be synced to our email provider (Resend) for that
            purpose. To unsubscribe or have your address deleted, email{" "}
            <strong>{SUPPORT_EMAIL}</strong>.
          </li>
          <li>
            <strong>Content you save.</strong> The links, notes, and images you
            save, including URLs, note text, extracted page content, titles,
            descriptions, tags, and space assignments, are stored in our backend
            (Convex) so they sync to your devices. Images are only imported when
            you capture them or pick them from your camera or photo library
            (including Tidy).
          </li>
          <li>
            <strong>Photo metadata.</strong> When you import a photo, EXIF
            metadata is stripped from the uploaded file. Shelvr keeps the
            capture time and GPS coordinates as fields in its own database so
            the item can appear on your map and be sorted by when it was taken.
            These fields are not sent to the AI provider. Shelvr does not track
            your live device location.
          </li>
          <li>
            <strong>Purchase information.</strong> If you subscribe to Shelvr
            Pro, RevenueCat processes your purchase together with the App Store.
            We receive your subscription status, not your payment card details.
          </li>
          <li>
            <strong>Feedback.</strong> If you send feedback from the app, the
            message text and your account email are emailed to our support inbox
            through Resend.
          </li>
          <li>
            <strong>Notification data.</strong> If you turn on notifications,
            your device push token and the notification text, which can include
            the title of a saved item, are delivered through Expo’s push
            service.
          </li>
          <li>
            <strong>Product analytics and crash reports.</strong> We use PostHog
            for product analytics events (such as ids, counts, and screen names,
            not the content of your saves) and, in the production app, crash and
            error reports. In the app, analytics include a random device
            identifier and are tied to your account id after sign-in. The app
            does not collect session recordings. On this website, we record a
            random anonymous identifier in your browser’s local storage and send
            basic usage events (such as page views, store button clicks,
            waitlist form interactions, and the page URL) to PostHog before you
            have an account. Website identifiers are not linked to your account
            or to your saved content, and the website does not record sessions.
            No analytics data is used for advertising.
          </li>
          <li>
            <strong>On your device only.</strong> Widget data and Spotlight and
            Siri indexing of your saves stay on your device.
          </li>
        </ul>
        <p className="mt-3">
          We do not collect your contacts, your browsing history outside content
          you choose to save, or advertising identifiers, and we do not run
          third-party advertising SDKs.
        </p>
      </section>

      <section>
        <h2 className="font-semibold text-ink text-lg">
          How your content is processed
        </h2>
        <p className="mt-2">
          To organize your saves, Shelvr sends content from its server to
          Google’s Gemini API (a generation model and Gemini embeddings). This
          is used to write titles, descriptions, and tags, suggest spaces, and
          power search. What is sent: link addresses and up to about 6,000
          characters of extracted page text, note text, saved photos (the image
          content), the names and descriptions of your spaces, and your search
          queries.
        </p>
        <p className="mt-2">
          You can decline AI processing when the app asks, and change your
          choice later in Settings. If you decline, saves are stored without AI
          titles and tags.
        </p>
        <p className="mt-2">
          Shelvr uses Google’s paid Gemini API service. Google states that
          prompts and responses sent through that service are not used to
          improve its products. Shelvr does not use your saved content to train
          models and does not share it for advertising.
        </p>
        <p className="mt-2">
          If you use “Find links” on a save, a shopping search query derived
          from that save is sent to SerpAPI, which returns product results. This
          only happens when you tap it.
        </p>
        <p className="mt-2">
          Transient AI failures do not delete content you already captured.
        </p>
      </section>

      <section>
        <h2 className="font-semibold text-ink text-lg">Public share links</h2>
        <p className="mt-2">
          When you share a save, Shelvr creates an unlisted public web page for
          it. The page shows the title, the AI description, the image, the
          source link, or the first 500 characters of a note. Anyone with the
          link can open it, and search engines are asked not to index it. You
          can remove the page by deleting the save.
        </p>
      </section>

      <section>
        <h2 className="font-semibold text-ink text-lg">
          Who handles your data
        </h2>
        <p className="mt-2">
          We do not sell your data. We share it only with the providers needed
          to run Shelvr, and where the law requires it. These providers are
          required to protect data to the same standard we hold ourselves to.
        </p>
        <ul className="mt-2 list-disc pl-5 space-y-2">
          <li>
            <strong>Google (Gemini API):</strong> AI processing and embeddings,
            as described above.
          </li>
          <li>
            <strong>SerpAPI:</strong> shopping search for “Find links”.
          </li>
          <li>
            <strong>Convex:</strong> database, file storage, and backend
            hosting.
          </li>
          <li>
            <strong>RevenueCat:</strong> subscription status and purchase
            processing.
          </li>
          <li>
            <strong>PostHog:</strong> product analytics and crash reports.
          </li>
          <li>
            <strong>Resend:</strong> email delivery for feedback and the
            waitlist.
          </li>
          <li>
            <strong>Expo:</strong> push notification delivery.
          </li>
          <li>
            <strong>Apple and Google:</strong> sign-in, and the App Store for
            purchases.
          </li>
        </ul>
        <p className="mt-3">
          If you opt in through Shelvr’s updated-terms screen, RevenueCat may
          share purchase identifiers, delivery status, and whether sample
          content was provided with Apple to help review a refund request. This
          does not include your saved links, notes, photos, or product analytics
          events. We record your choice, the accepted terms version, and the
          time of your decision. You can turn sharing off in Profile. Changes
          are sent to RevenueCat; the app shows when an update is pending.
          Previously shared information cannot be recalled.
        </p>
      </section>

      <section>
        <h2 className="font-semibold text-ink text-lg">
          Retention and deletion
        </h2>
        <p className="mt-2">
          Your content stays in your account until you delete it. Deleting an
          item removes it from our backend and removes its share page. You can
          delete your entire Shelvr account in the app under Settings, then
          Delete account. That removes Shelvr’s records of your saves, spaces,
          memberships, pending uploads, subscription row, and authentication
          records.
        </p>
        <p className="mt-3">
          Some data may remain with processors. Analytics events already
          recorded by PostHog are not automatically erased, and RevenueCat keeps
          purchase records needed for billing. Email{" "}
          <strong>{SUPPORT_EMAIL}</strong> to request deletion of that data.
          Waitlist email addresses are kept until you ask us to remove them.
          Clearing your browser’s local storage only discards this browser’s
          anonymous identifier: events already recorded remain, and the next
          event starts a new identifier. Deleting your Shelvr account does not
          cancel an App Store subscription; manage that in your Apple ID
          settings.
        </p>
        <p className="mt-3">
          Account deletion also requests that refund data sharing stop. A
          minimal record of the account identifier and pending withdrawal
          remains until RevenueCat confirms the update, then is deleted.
        </p>
      </section>

      <section>
        <h2 className="font-semibold text-ink text-lg">Your choices</h2>
        <ul className="mt-2 list-disc pl-5 space-y-2">
          <li>Turn AI processing on or off in Settings.</li>
          <li>
            Turn notifications on or off in Settings, including the weekly shelf
            and save reminders.
          </li>
          <li>Delete a save to remove its public page.</li>
          <li>Delete your account in Settings, then Delete account.</li>
          <li>
            Contact <strong>{SUPPORT_EMAIL}</strong> for anything else.
          </li>
        </ul>
      </section>

      <section>
        <h2 className="font-semibold text-ink text-lg">Your rights</h2>
        <p className="mt-2">
          Depending on where you live, you may have rights to access, correct,
          export, or delete your personal data. Contact us and we will honor
          them.
        </p>
      </section>

      <section>
        <h2 className="font-semibold text-ink text-lg">Children</h2>
        <p className="mt-2">
          Shelvr is not directed at anyone under 18, and we do not knowingly
          collect data from them.
        </p>
      </section>

      <section>
        <h2 className="font-semibold text-ink text-lg">Changes</h2>
        <p className="mt-2">
          If we make material changes to this policy, we will update this page
          and the date above.
        </p>
      </section>

      <section>
        <h2 className="font-semibold text-ink text-lg">Contact</h2>
        <p className="mt-2">
          Questions or requests: <strong>{SUPPORT_EMAIL}</strong>
        </p>
      </section>
    </LegalPage>
  );
}
