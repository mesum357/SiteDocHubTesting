import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/** Headers the Supabase JS client may send on `functions.invoke` (preflight must allow them). */
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, apikey, x-client-info, x-supabase-api-version, prefer",
} as const;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: { ...corsHeaders } });
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }

  // Create client with the caller's JWT — RLS will enforce role checks
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } }
  );

  let body: { job_id?: string; expires_at?: string | null };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }

  const { job_id, expires_at } = body;

  if (!job_id) {
    return new Response(JSON.stringify({ error: "job_id is required" }), {
      status: 400,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }

  const { data, error } = await supabase
    .from("shares")
    .insert({ job_id, expires_at: expires_at ?? null })
    .select("token")
    .single();

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }

  return new Response(
    JSON.stringify({
      token: data.token,
      url: `/share/${data.token}`,
    }),
    {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    }
  );
});
