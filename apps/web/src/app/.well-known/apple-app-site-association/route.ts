export function GET() {
  return Response.json(
    {
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
