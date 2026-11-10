type SharedStop = {
  name: string;
  lat: number;
  lng: number;
  time?: string;
  note?: string;
};

type SharedTrip = {
  name?: string;
  city: string;
  startDate?: string;
  days: SharedStop[][];
};

function escapeHtml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function stopRow(stop: SharedStop): string {
  const map = new URL("https://maps.apple.com/");
  map.searchParams.set("ll", `${stop.lat},${stop.lng}`);
  map.searchParams.set("q", stop.name);
  const time = stop.time ? `<time>${escapeHtml(stop.time)}</time>` : "";
  const note = stop.note ? `<p class="note">${escapeHtml(stop.note)}</p>` : "";
  return `<li>${time}<a href="${escapeHtml(map.href)}">${escapeHtml(stop.name)}</a>${note}</li>`;
}

export function tripSharePage(trip: SharedTrip | null): Response {
  const title = escapeHtml(
    trip ? (trip.name ?? `${trip.city} trip`) : "Trip link unavailable",
  );
  const body = trip
    ? `<p>${escapeHtml([trip.city, trip.startDate].filter(Boolean).join(" · "))}</p>${trip.days
        .map(
          (stops, i) =>
            `<section><h2>Day ${i + 1}</h2>${stops.length ? `<ol>${stops.map(stopRow).join("")}</ol>` : "<p>No stops scheduled.</p>"}</section>`,
        )
        .join("")}`
    : "<p>Ask the trip owner for an active link.</p>";
  return new Response(
    `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title><style>
:root{color-scheme:light dark;font:17px/1.5 system-ui}
body{margin:0;background:Canvas;color:CanvasText}
main{max-width:38rem;margin:auto;padding:2rem 1.25rem}
h1{font-size:2rem;line-height:1.15;margin:.5rem 0;overflow-wrap:anywhere}
h2{font-size:1.2rem;margin:0}
section{border-top:1px solid GrayText;padding:1rem 0}
ol{margin:.6rem 0 0;padding-left:1.5rem}
li{padding:.35rem 0;overflow-wrap:anywhere}
time{display:inline-block;margin-right:.6rem;font-variant-numeric:tabular-nums}
.note{margin:.25rem 0;white-space:pre-wrap}
</style></head><body><main><small>Shelvr · View-only trip</small><h1>${title}</h1>${body}</main></body></html>`,
    {
      status: trip ? 200 : 404,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
        "Content-Security-Policy":
          "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'",
        "Referrer-Policy": "no-referrer",
        "X-Content-Type-Options": "nosniff",
        "X-Robots-Tag": "noindex, nofollow",
      },
    },
  );
}
