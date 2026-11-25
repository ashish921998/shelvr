import type { Metadata } from "next";
import { LegalPage } from "@/components/LegalPage";
import { SUPPORT_EMAIL } from "@/lib/support";
import { pageMetadata } from "@/lib/siteMetadata";

export const metadata: Metadata = pageMetadata(
  "/copyright",
  "Copyright policy — Shelvr",
  "Report copyright infringement on Shelvr or respond to a removal.",
);

export default function CopyrightPage() {
  return (
    <LegalPage title="Copyright policy" lastUpdated="November 25, 2026">
      <p>
        If you own a copyright or represent its owner, you can report a photo,
        text, or link in Shelvr. For example, if a shared plan uses a cover
        image from your reel, identify that image and the plan where you found
        it.
      </p>
      <section>
        <h2 className="font-semibold text-ink text-lg">
          Send a copyright notice
        </h2>
        <p className="mt-2">
          Email Shelvr’s copyright contact at{" "}
          <a
            className="underline"
            href={`mailto:${SUPPORT_EMAIL}?subject=Copyright%20notice%20for%20Shelvr`}
          >
            {SUPPORT_EMAIL}
          </a>
          . Include the following details and statements in your message.
        </p>
        <ul className="mt-2 list-disc space-y-2 pl-6">
          <li>
            <strong>My name and contact details.</strong> Full name, mailing
            address, telephone number, and email address if available.
          </li>
          <li>
            <strong>My copyrighted work.</strong> Describe the work. For an
            imported post, include the original platform and post URL if
            available. For several works on one site, a representative list is
            sufficient.
          </li>
          <li>
            <strong>Where it appears on Shelvr.</strong> Identify the image,
            text, or link you want removed. Include the Shelvr share URL if
            available. If the material is only visible in the app, describe the
            screen and how to find it.
          </li>
          <li>
            <strong>Good-faith statement.</strong> I believe in good faith that
            neither the rights holder nor their representative has authorized
            this use and that the law does not permit it, including as fair use.
          </li>
          <li>
            <strong>Accuracy and authority.</strong> The information I have
            provided is accurate. I declare under penalty of perjury that I hold
            the exclusive right identified in this notice or am authorized to
            act for the person who holds it.
          </li>
          <li>
            <strong>Signature.</strong> Sign electronically or by hand.
          </li>
        </ul>
      </section>
      <section>
        <h2 className="font-semibold text-ink text-lg">
          What happens after a report
        </h2>
        <p className="mt-2">
          We promptly review notices. When we receive a compliant notice, we act
          expeditiously to remove or disable access through Shelvr to the
          identified material or link. We take reasonable steps to notify the
          affected user promptly. For removal of an original reel or post hosted
          elsewhere, contact the platform hosting it.
        </p>
      </section>
      <section>
        <h2 className="font-semibold text-ink text-lg">
          If your material was removed by mistake
        </h2>
        <p className="mt-2">
          If you believe Shelvr removed or disabled your material because of a
          mistake or misidentification, you can email a counter-notice to the
          copyright contact above. We will send a copy of a compliant
          counter-notice, including your contact details, to the person who sent
          the original notice. Include all of the following.
        </p>
        <ol className="mt-2 list-decimal space-y-2 pl-6">
          <li>
            Identify the removed or disabled material and where it appeared in
            Shelvr before removal.
          </li>
          <li>
            State under penalty of perjury that you believe in good faith that a
            mistake or misidentification led to the removal or disabling of the
            material.
          </li>
          <li>Give your full name, mailing address, and telephone number.</li>
          <li>
            State that you consent to the jurisdiction of the U.S. federal
            district court for the district where your address is located. If
            your address is outside the United States, state that you consent to
            jurisdiction in any U.S. judicial district where the operator of
            Shelvr may be found. State that you will accept service of process
            from the original claimant or their agent.
          </li>
          <li>Sign the counter-notice physically or electronically.</li>
        </ol>
        <p className="mt-2">
          We promptly forward a compliant counter-notice and tell the claimant
          we will restore access in 10 business days unless they notify us of
          the court action described below. We restore the material or access to
          it between 10 and 14 business days after we receive the
          counter-notice, unless we first receive notice that the claimant has
          filed a court action seeking to restrain the user from infringing
          activity involving that material.
        </p>
      </section>
      <section>
        <h2 className="font-semibold text-ink text-lg">
          Repeat infringement and false claims
        </h2>
        <p className="mt-2">
          Shelvr terminates accounts of repeat infringers in appropriate
          circumstances. Anyone who knowingly makes a material misrepresentation
          in a notice or counter-notice may be liable for resulting damages,
          including costs and attorneys’ fees.
        </p>
      </section>
    </LegalPage>
  );
}
