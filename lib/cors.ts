/**
 * Public shop APIs (catalog, availability, orders) can be called from a business's own website,
 * e.g. a separate Starlight site on its own domain. No cookies are involved, so any origin is fine.
 */
export const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
};

export function preflight() {
  return new Response(null, { status: 204, headers: CORS });
}

/** Add the CORS headers to a finished response. */
export function withCors(res: Response) {
  for (const [k, v] of Object.entries(CORS)) res.headers.set(k, v);
  return res;
}
