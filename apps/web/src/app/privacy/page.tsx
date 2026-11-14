import type { Metadata } from "next";
import { LegalPage } from "@/components/LegalPage";
import { SUPPORT_EMAIL } from "@/lib/support";
import { pageMetadata } from "@/lib/siteMetadata";

export const metadata: Metadata = pageMetadata(
  "/privacy",
  "Privacy Policy — Shelvr",
  "How Shelvr collects, uses, and protects your data.",
);

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy Policy" lastUpdated="November 14, 2026">
      <section>
        <h2 className="font-semibold text-ink text-lg">What Shelvr is</h2>
        <p className="mt-2">
          Shelvr helps you turn saved reels, TikToks, and links into places to
          visit and plans for trips or nights out. This policy explains what
          data we collect, how we use it, who handles it, and your choices.
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
            <strong>Content you save.</strong> For each link you save, such as a
            reel or TikTok, we store the URL and, when they are available, the
            caption or extracted page text, a copy of its cover image, its
            title, description and tags, and the places found in it with their
            map locations. We also store the plans you make. All of this is kept
            in our backend (Convex) so it syncs to your devices. We do not store
            the video itself. If you share a photo or text to Shelvr, including
            through Siri or Shortcuts, we store that too. Photos and notes stay
            in your account until you delete them.
          </li>
          <li>
            <strong>Cities you’ve been to.</strong> If you pick cities you have
            visited, during onboarding or from your passport, we store which of
            our listed cities you picked, its country and when you added it, so
            it shows as a city stamp in your passport and counts toward your
            cities and countries. We do not use your location for this. Cities
            you pick during onboarding stay on your device until you sign in.
            You can remove a city stamp in the app, and deleting your account
            deletes them.
          </li>
          <li>
            <strong>Photo metadata.</strong> When you send a photo to Shelvr
            from another app, Shelvr normally removes its EXIF metadata before
            uploading it. A photo saved through Siri, Shortcuts, or the Save an
            Image action can keep its metadata, which can include when and where
            it was taken. Any metadata the file keeps is stored with it, sent to
            Gemini with it, and goes with the file if you share that photo from
            the app. Earlier versions of the app could also keep a photo’s
            capture time and GPS coordinates as fields in our database so the
            item could appear on your map and be sorted by when it was taken.
            Those database fields are not sent to the AI provider.
          </li>
          <li>
            <strong>Your location.</strong> On iPhone, the Map tab asks for
            permission to show where you are. If you allow it, the map uses your
            location on your device to open near you and to show your position.
            The map does not send your location to us, and we do not track your
            live location.
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
            have an account. We also keep a note in local storage of which
            version of the site’s buttons your browser was shown, so it keeps
            seeing the same one, and send it with those events to compare the
            versions. Website identifiers are not linked to your account or to
            your saved content, and the website does not record sessions. No
            analytics data is used for advertising.
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
          To find the places in your saves, Shelvr sends content from its server
          to Google’s Gemini API. What is sent: a link’s address and what we
          read from it, such as its title, creator, description, and up to about
          30,000 characters of page text; a reel’s or TikTok’s caption and what
          is said in the video; the places in a shared Google Maps list, with
          their addresses, map points, and notes; a note’s title and up to about
          8,000 characters of its text; and photos you save, with any text you
          send with them through Siri or Shortcuts and any text the app reads
          from them on your device. If your account has spaces, their names and
          descriptions can also be sent, and so can the titles, descriptions,
          tags, and links of saves being matched to them.
        </p>
        <p className="mt-2">
          To read a link you save, our server requests it from the site it
          points to, such as TikTok, Instagram, YouTube, X, Pinterest, or Google
          Maps, and may follow a link in its caption to find a recipe. The
          request can carry the link as you shared it, including that platform’s
          share code, but not your Shelvr name or account.
        </p>
        <p className="mt-2">
          Date and trip plans start from places already saved in your chosen
          city, or on the shared list you plan from, and can add nearby
          suggestions from Apple Maps. Places marked “We went” are normally left
          out. Your saved collection and visit history are not sent to Gemini to
          make these plans.
        </p>
        <p className="mt-2">
          To put places on a map and to make suggestions, our server sends
          search text to Apple Maps. This can be a place’s name or address, a
          city, a kind of place, a word from a save’s tags, the stay you enter
          for a trip, or what you type when adding a place. It can include a map
          point to search near, such as a saved place or the city centre, and
          your language. It does not include your name or account.
        </p>
        <p className="mt-2">
          AI processing is part of saving content in Shelvr. It runs
          automatically unless it is disabled for your account. With AI
          disabled, links still save, but AI place extraction is unavailable.
          Plans can still use places already saved in your account. To request a
          change to your AI processing preference, use Contact Support in the
          app or email <strong>{SUPPORT_EMAIL}</strong>.
        </p>
        <p className="mt-2">
          Shelvr uses Google’s paid Gemini API service. Google states that
          prompts and responses sent through that service are not used to
          improve its products. Shelvr does not use your saved content to train
          models and does not share it for advertising.
        </p>
        <p className="mt-2">
          Older versions of the app have a “Find links” button, which the
          current app does not. If you tap it, Gemini writes a shopping search
          query from that save, and the query is sent to SerpAPI, which returns
          product results. This only happens when you tap it.
        </p>
        <p className="mt-2">
          To find places or recipes in a TikTok or Instagram reel, including
          videos with no caption, Shelvr may send its public link to Treg
          (treg.to), which uses ScrapeCreators to return a TikTok’s caption or
          what is said in the video. That text is then sent to Gemini to extract
          the places or recipe.
        </p>
        <p className="mt-2">
          The reel place finder and the Oracle on this website work without an
          account. The reel place finder reads the link you paste, as above, and
          sends what it reads to Gemini to list the places. The Oracle reads any
          links you give it and sends what it reads, along with anything else
          you give it, such as titles or a screenshot, to Gemini for a reading.
          We do not store what you submit or the results. We do keep a rate
          limit record keyed to your IP address, to limit how often these tools
          can be used. The waitlist and plan vote pages use the same kind of
          rate limit.
        </p>
        <p className="mt-2">
          Transient AI failures do not delete content you already captured.
        </p>
      </section>

      <section>
        <h2 className="font-semibold text-ink text-lg">Public share links</h2>
        <p className="mt-2">
          When you share a link or note save, Shelvr creates an unlisted public
          web page for it. The page shows your first name, if we have one, the
          title, the AI description, the image, the source link, or the first
          500 characters of a note. Anyone with the link can open it, and search
          engines are asked not to index it. You can remove the page by deleting
          the save. A photo save gets no public page; sharing one from the app
          sends the file itself.
        </p>
        <p className="mt-2">
          A plan can also be shared as an unlisted vote link, which shows your
          first name, if we have one, and the plan’s city and places, with the
          cover image of a saved link but never a photo you saved. Anyone with
          the link can vote, up to 20 people at a time, and we store each
          voter’s choices with a random browser identifier. The link closes
          after a week, and we delete it and its votes about a week after that.
        </p>
      </section>

      <section>
        <h2 className="font-semibold text-ink text-lg">Shared lists</h2>
        <p className="mt-2">
          When you start a shared list, the places you have saved in its chosen
          cities are copied to it, up to 200. When you join one, its other
          members can see your first name, if we have one, the places you add,
          and which places have been marked visited. Anyone with the invite link
          can join while the list has room. Before joining, they can see the
          owner’s first name, the list’s name, its cities and a few of its
          places. The owner can remove a member, which also stops the old link
          working. A place on a list is a copy, so deleting your save does not
          remove it. Places you added stay on the list if you leave, until its
          last member leaves and the list is deleted. They are removed if you
          delete your account.
        </p>
      </section>

      <section>
        <h2 className="font-semibold text-ink text-lg">
          Who handles your data
        </h2>
        <p className="mt-2">
          We do not sell your data. We share it only with the providers needed
          to run Shelvr, with the sites we request when reading your saved
          links, with the people you choose through share links and shared
          lists, and where the law requires it. These providers are required to
          protect data to the same standard we hold ourselves to.
        </p>
        <ul className="mt-2 list-disc pl-5 space-y-2">
          <li>
            <strong>Google (Gemini API):</strong> AI processing, as described
            above.
          </li>
          <li>
            <strong>Apple Maps:</strong> map locations for places, suggestions
            for plans, and the map in the iPhone app.
          </li>
          <li>
            <strong>Google Maps:</strong> the map in the Android app.
          </li>
          <li>
            <strong>SerpAPI:</strong> shopping search for “Find links” in older
            versions of the app.
          </li>
          <li>
            <strong>Treg and ScrapeCreators:</strong> TikTok captions and video
            transcripts for finding places and recipes in TikToks and reels.
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
            <strong>Vercel:</strong> hosting for this website.
          </li>
          <li>
            <strong>Apple and Google:</strong> sign-in, and the App Store for
            purchases.
          </li>
        </ul>
        <p className="mt-3">
          The sites we request when reading your saved links are not our
          providers, and their own privacy policies apply.
        </p>
        <p className="mt-3">
          If you opt in to Apple refund data sharing, RevenueCat may share
          purchase identifiers, delivery status, and whether sample content was
          provided with Apple to help review a refund request. This does not
          include your saves, the places in them, or product analytics events.
          We record your choice, the accepted terms version, and the time of
          your decision. You can turn sharing off in Profile. Changes are sent
          to RevenueCat; the app shows when an update is pending. Previously
          shared information cannot be recalled.
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
          anonymous identifier and button version: events already recorded
          remain, and the next visit starts new ones. Deleting your Shelvr
          account does not cancel an App Store subscription; manage that in your
          Apple ID settings.
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
          <li>
            Request a change to your AI processing preference through Contact
            Support in the app or by emailing <strong>{SUPPORT_EMAIL}</strong>.
          </li>
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
