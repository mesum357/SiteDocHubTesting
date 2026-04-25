import { createClient } from "@supabase/supabase-js";

function reqEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var ${name}`);
  return v;
}

function optEnv(name) {
  const v = process.env[name];
  return v && v.trim() ? v.trim() : undefined;
}

function getSupabaseAnonKey() {
  // Support both generic names and Vite-style names used by this repo.
  return (
    optEnv("SUPABASE_ANON_KEY") ??
    optEnv("SUPABASE_PUBLISHABLE_KEY") ??
    optEnv("VITE_SUPABASE_PUBLISHABLE_KEY") ??
    optEnv("VITE_SUPABASE_ANON_KEY")
  );
}

function getSupabaseUrl() {
  return process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
}

async function readJsonOrText(res) {
  const text = await res.text();
  if (!text) return { text: "" };
  try {
    return JSON.parse(text);
  } catch {
    return { text };
  }
}

async function main() {
  const SUPABASE_URL = getSupabaseUrl();
  if (!SUPABASE_URL) {
    throw new Error("Missing SUPABASE_URL (or VITE_SUPABASE_URL)");
  }
  const SUPABASE_ANON_KEY = getSupabaseAnonKey();
  if (!SUPABASE_ANON_KEY) {
    throw new Error(
      "Missing Supabase publishable/anon key. Set one of: SUPABASE_ANON_KEY, SUPABASE_PUBLISHABLE_KEY, VITE_SUPABASE_PUBLISHABLE_KEY."
    );
  }
  const TEST_EMAIL = reqEnv("TEST_EMAIL");
  const TEST_PASSWORD = reqEnv("TEST_PASSWORD");

  const NEW_EMAIL = optEnv("NEW_EMAIL");
  const NEW_PASSWORD = optEnv("NEW_PASSWORD");
  const REDIRECT_TO = optEnv("REDIRECT_TO"); // e.g. https://siteview-pro.onrender.com/security

  console.log("[auth-diag] using host:", new URL(SUPABASE_URL).host);

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
      storageKey: `auth-diag-${Date.now()}`,
    },
  });

  console.log("[auth-diag] signing in as", TEST_EMAIL);
  const { data: signInData, error: signInErr } = await supabase.auth.signInWithPassword({
    email: TEST_EMAIL,
    password: TEST_PASSWORD,
  });
  if (signInErr) {
    console.error("[auth-diag] signInWithPassword error:", signInErr);
    process.exitCode = 1;
    return;
  }

  const accessToken = signInData?.session?.access_token;
  if (!accessToken) throw new Error("No access_token returned from sign-in.");

  // 1) supabase-js updateUser (email)
  if (NEW_EMAIL) {
    console.log("\n[auth-diag] supabase.auth.updateUser({ email })");
    const { error } = REDIRECT_TO
      ? await supabase.auth.updateUser({ email: NEW_EMAIL }, { emailRedirectTo: REDIRECT_TO })
      : await supabase.auth.updateUser({ email: NEW_EMAIL });

    if (error) console.error("[auth-diag] updateUser(email) error:", error);
    else console.log("[auth-diag] updateUser(email) OK");
  } else {
    console.log("\n[auth-diag] NEW_EMAIL not set, skipping email update.");
  }

  // 2) supabase-js updateUser (password)
  if (NEW_PASSWORD) {
    console.log("\n[auth-diag] supabase.auth.updateUser({ password })");
    const { error } = await supabase.auth.updateUser({ password: NEW_PASSWORD });
    if (error) console.error("[auth-diag] updateUser(password) error:", error);
    else console.log("[auth-diag] updateUser(password) OK");
  } else {
    console.log("\n[auth-diag] NEW_PASSWORD not set, skipping password update.");
  }

  // 3) direct REST call to show the REAL 400 payload (most useful)
  // This is what the browser ends up doing: PUT /auth/v1/user?redirect_to=...
  if (NEW_EMAIL || NEW_PASSWORD) {
    const url = new URL("/auth/v1/user", SUPABASE_URL);
    if (REDIRECT_TO) url.searchParams.set("redirect_to", REDIRECT_TO);

    const body = {};
    if (NEW_EMAIL) body.email = NEW_EMAIL;
    if (NEW_PASSWORD) body.password = NEW_PASSWORD;

    console.log("\n[auth-diag] direct REST PUT", url.toString());
    const res = await fetch(url.toString(), {
      method: "PUT",
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    const payload = await readJsonOrText(res);
    console.log("[auth-diag] status:", res.status);
    console.log("[auth-diag] response:", payload);
    if (!res.ok) process.exitCode = 1;
  }
}

main().catch((e) => {
  console.error("[auth-diag] fatal:", e);
  process.exitCode = 1;
});

