export function GET() {
  return Response.json(
    {
      webcredentials: { apps: ["WJP847UZY2.app.shelvr.save"] },
      applinks: {
        apps: [],
        details: [
          {
            appIDs: ["WJP847UZY2.app.shelvr.save"],
            components: [{ "/": "/auth/callback" }],
          },
        ],
      },
    },
    { headers: { "cache-control": "public, max-age=3600" } },
  );
}
