const TARGET_ENV = process.env.TARGET_ENV === "dev" ? "dev" : "prod";
const ORIGIN =
  process.env.BASE_URL ||
  (TARGET_ENV === "dev" ? "http://localhost:8080" : "https://siteview-pro.onrender.com");
const SUPABASE_URL =
  process.env.SUPABASE_URL || "https://wwqjpkskvqpbmuqmyspq.supabase.co";

const ANON_KEY = process.env.PROD_SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
const ACCESS_TOKEN = process.env.PROD_ACCESS_TOKEN || "";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function preflight(path, method, requestHeaders) {
  const url = `${SUPABASE_URL}${path}`;
  const res = await fetch(url, {
    method: "OPTIONS",
    headers: {
      Origin: ORIGIN,
      "Access-Control-Request-Method": method,
      "Access-Control-Request-Headers": requestHeaders,
    },
  });
  const acao = res.headers.get("access-control-allow-origin");
  const acah = (res.headers.get("access-control-allow-headers") || "").toLowerCase();
  console.log(`[preflight] ${path} -> ${res.status} ACAO=${acao} ACAH=${acah}`);
  assert(res.status >= 200 && res.status < 300, `Preflight failed for ${path}: ${res.status}`);
  assert(acao === "*" || acao === ORIGIN, `Missing/invalid ACAO for ${path}`);
}

async function restRead(path) {
  const url = `${SUPABASE_URL}${path}`;
  const headers = {
    Origin: ORIGIN,
    apikey: ANON_KEY || "",
  };
  if (ACCESS_TOKEN) headers.Authorization = `Bearer ${ACCESS_TOKEN}`;
  const res = await fetch(url, { headers });
  const acao = res.headers.get("access-control-allow-origin");
  const body = await res.text();
  console.log(`[rest] ${path} -> ${res.status} ACAO=${acao}`);
  assert(acao === "*" || acao === ORIGIN, `REST missing ACAO for ${path}`);
  return { status: res.status, body };
}

async function main() {
  console.log(`[smoke] env=${TARGET_ENV} origin=${ORIGIN}`);

  await preflight("/functions/v1/generate-share-token", "POST", "authorization,apikey,x-client-info,content-type");
  await preflight("/functions/v1/delete-job", "POST", "authorization,apikey,x-client-info,content-type");

  if (!ANON_KEY) {
    console.log(
      "[smoke] skipping REST probes (set PROD_SUPABASE_ANON_KEY or VITE_SUPABASE_ANON_KEY to enable)"
    );
  } else {
    // REST probes (status may be 200/401/403 depending on token, but ACAO must exist).
    await restRead("/rest/v1/jobs?select=id&limit=1");
    await restRead("/rest/v1/floors?select=id&limit=1");
    await restRead("/rest/v1/pins?select=id&limit=1");
    await restRead("/rest/v1/profiles?select=id&limit=1");
  }

  console.log("prod-cors-smoke: PASS");
}

main().catch((err) => {
  console.error("prod-cors-smoke: FAIL");
  console.error(err);
  process.exit(1);
});

