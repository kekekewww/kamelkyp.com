export function loader() {
  return Response.json(
    { ok: true, data: { service: "kamelkyp-com", status: "healthy" } },
    { headers: { "cache-control": "no-store" } },
  );
}
