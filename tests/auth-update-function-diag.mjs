import { createClient } from "@supabase/supabase-js";

function reqEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var ${name}`);
  return v;
}

function pickUrl() {
  return process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
}

function pickKey() {
  return (
    process.env.SUPABASE_ANON_KEY ||
    process.env.SUPABASE_PUBLISHABLE_KEY ||
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
    process.env.VITE_SUPABASE_ANON_KEY
  );
}

async function main() {
  const url = pickUrl();
  if (!url) throw new Error("Missing SUPABASE_URL (or VITE_SUPABASE_URL)");
  const key = pickKey();
  if (!key) throw new Error("Missing Supabase publishable/anon key");

  const email = reqEnv("TEST_EMAIL");
  const currentPassword = reqEnv("TEST_PASSWORD");
  const newEmail = process.env.NEW_EMAIL;
  const newPassword = process.env.NEW_PASSWORD;

  if (!newEmail && !newPassword) {
    throw new Error("Set NEW_EMAIL or NEW_PASSWORD");
  }

  let host = "";
  try {
    host = new URL(url).host;
  } catch {
    throw new Error(`Invalid SUPABASE URL: ${url}`);
  }
  console.log(`[update-account] using host: ${host}`);

  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  const { error: signInErr } = await supabase.auth.signInWithPassword({
    email,
    password: currentPassword,
  });
  if (signInErr) throw signInErr;

  const { data, error } = await supabase.functions.invoke("update-account", {
    body: {
      currentPassword,
      newEmail,
      newPassword,
    },
  });

  if (error) {
    console.error("[update-account] invoke error:", error);
    process.exitCode = 1;
    return;
  }

  console.log("[update-account] result:", data);
}

main().catch((e) => {
  console.error("[update-account] fatal:", e);
  process.exitCode = 1;
});

