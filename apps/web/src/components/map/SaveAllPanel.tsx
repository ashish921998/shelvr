import AppStoreButton from "@/components/AppStoreButton";
import SaveAllLink from "@/components/map/SaveAllLink";
import type { InAppBrowser } from "@/lib/bioLink";
import {
  creatorMapLink,
  saveAllHint,
  saveAllLabel,
  type AppLinkScheme,
  type SaveAllMode,
} from "@/lib/creatorMap";

export default function SaveAllPanel({
  token,
  cities,
  mode,
  inApp,
  scheme,
}: {
  token: string;
  cities: { city: string; places: number }[];
  mode: Exclude<SaveAllMode, "none">;
  inApp: InAppBrowser | undefined;
  scheme: AppLinkScheme;
}) {
  return (
    <section
      aria-labelledby="save-all-title"
      className="mt-6 rounded-2xl border border-line bg-card p-4"
    >
      <h2 id="save-all-title" className="text-[17px] font-semibold text-ink">
        Save this map to Shelvr
      </h2>
      <p className="mt-1 text-sm text-muted">
        {cities.length === 1
          ? "The places go into a list in your Shelvr, with links to the posts they came from."
          : "Each city you save becomes a list in your Shelvr, with links to the posts its places came from."}
      </p>
      {mode === "app" ? (
        <>
          <div className="mt-4 flex flex-col gap-2">
            {cities.map(({ city, places }) => (
              <SaveAllLink
                key={city}
                href={creatorMapLink(scheme, token, city)}
                label={saveAllLabel(city, cities.length)}
                token={token}
                places={places}
                cities={cities.length}
                inApp={inApp}
              />
            ))}
          </div>
          <p className="mt-3 text-xs text-muted">{saveAllHint(inApp)}</p>
          <div className="mt-3">
            <AppStoreButton source="creator_map" shareToken={token} compact />
          </div>
        </>
      ) : (
        <p className="mt-3 text-sm text-ink">
          Open this page on your iPhone to save these places to Shelvr.
        </p>
      )}
    </section>
  );
}
