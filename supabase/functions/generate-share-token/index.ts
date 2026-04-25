import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

function corsHeaders(req: Request) {
  const requested =
    req.headers.get("access-control-request-headers") ??
    "Content-Type, Authorization, apikey, x-client-info, x-supabase-api-version, prefer";
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": requested,
  } as const;
}

Deno.serve(async (req) => {
  try {
    if (req.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: { ...corsHeaders(req) } });
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json", ...corsHeaders(req) },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !anonKey || !serviceRoleKey) {
      return new Response(JSON.stringify({ error: "Server misconfigured" }), {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders(req) },
      });
    }

    // Caller-scoped client (auth) + service-role client (controlled write path)
    const callerClient = createClient(
      supabaseUrl,
      anonKey,
      { global: { headers: { Authorization: authHeader } } }
    );
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    // Verify caller and role explicitly; avoid opaque RLS 500s.
    const { data: callerData, error: authError } = await callerClient.auth.getUser();
    const caller = callerData?.user;
    if (authError || !caller) {
      return new Response(JSON.stringify({ error: "Invalid auth token" }), {
        status: 401,
        headers: { "Content-Type": "application/json", ...corsHeaders(req) },
      });
    }

    const { data: profile, error: profileError } = await adminClient
      .from("profiles")
      .select("role")
      .eq("id", caller.id)
      .single();

    if (profileError || !profile) {
      return new Response(JSON.stringify({ error: "Profile not found" }), {
        status: 403,
        headers: { "Content-Type": "application/json", ...corsHeaders(req) },
      });
    }

    if (profile.role !== "office_staff" && profile.role !== "admin") {
      return new Response(JSON.stringify({ error: "Forbidden: insufficient role" }), {
        status: 403,
        headers: { "Content-Type": "application/json", ...corsHeaders(req) },
      });
    }

    let body: { job_id?: string; expires_at?: string | null };
    try {
      body = await req.json();
    } catch {
      return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders(req) },
      });
    }

    const { job_id, expires_at } = body;

    if (!job_id) {
      return new Response(JSON.stringify({ error: "job_id is required" }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders(req) },
      });
    }

    // Validate referenced job early for clearer errors.
    const { data: jobExists, error: jobError } = await adminClient
      .from("jobs")
      .select("id")
      .eq("id", job_id)
      .maybeSingle();

    if (jobError) {
      return new Response(JSON.stringify({ error: `Job lookup failed: ${jobError.message}` }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders(req) },
      });
    }
    if (!jobExists) {
      return new Response(JSON.stringify({ error: "Job not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json", ...corsHeaders(req) },
      });
    }

    // Create share record with service role, tied to the authenticated caller.
    let insert = await adminClient
      .from("shares")
      .insert({ job_id, expires_at: expires_at ?? null, created_by: caller.id })
      .select("token")
      .single();

    // Backward-compat fallback for databases that don't have `created_by` yet.
    if (insert.error && /created_by|column .* does not exist/i.test(insert.error.message)) {
      insert = await adminClient
        .from("shares")
        .insert({ job_id, expires_at: expires_at ?? null })
        .select("token")
        .single();
    }

    if (insert.error || !insert.data) {
      return new Response(JSON.stringify({ error: insert.error?.message ?? "Share insert failed" }), {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders(req) },
      });
    }

    return new Response(
      JSON.stringify({
        token: insert.data.token,
        url: `/share/${insert.data.token}`,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders(req) },
      }
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unhandled function error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders(req) },
    });
  }
});
