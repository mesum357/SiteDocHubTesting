import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type Role = "field_worker" | "office_staff" | "admin";

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "authorization, content-type",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
    },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return json(204, null);
  if (req.method !== "POST") return json(405, { error: "Method not allowed" });

  const { jobId } = (await req.json().catch(() => ({}))) as { jobId?: string };
  if (!jobId) return json(400, { error: "Missing jobId" });

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!supabaseUrl || !serviceKey || !anonKey) {
    return json(500, { error: "Server misconfigured" });
  }

  const authHeader = req.headers.get("authorization") ?? "";
  if (!authHeader.toLowerCase().startsWith("bearer ")) {
    return json(401, { error: "Missing auth" });
  }

  // Use anon client to validate the caller, then service client for deletion.
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });
  const svc = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false },
  });

  const { data: userData, error: userErr } = await userClient.auth.getUser();
  const user = userData?.user;
  if (userErr || !user) return json(401, { error: "Invalid auth" });

  const { data: profile, error: profErr } = await svc
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (profErr || !profile) return json(403, { error: "Forbidden" });

  const role = profile.role as Role;
  if (role !== "admin" && role !== "office_staff") {
    return json(403, { error: "Forbidden" });
  }

  // Collect storage paths before deletion.
  const { data: floors } = await svc
    .from("floors")
    .select("id, pdf_path")
    .eq("job_id", jobId);
  const floorIds = (floors ?? []).map((f) => f.id);

  const { data: pins } = floorIds.length
    ? await svc
        .from("pins")
        .select("photo_path")
        .in("floor_id", floorIds)
    : { data: [] as Array<{ photo_path: string | null }> };

  const pdfPaths = (floors ?? [])
    .map((f) => f.pdf_path)
    .filter((p): p is string => Boolean(p));
  const photoPaths = (pins ?? [])
    .map((p) => p.photo_path)
    .filter((p): p is string => Boolean(p));

  // Best-effort storage cleanup (ignore per-file errors).
  if (pdfPaths.length) {
    await svc.storage.from("floor-plans").remove(pdfPaths).catch(() => {});
  }
  if (photoPaths.length) {
    await svc.storage.from("pin-photos").remove(photoPaths).catch(() => {});
    await svc.storage.from("site-photos").remove(photoPaths).catch(() => {});
  }

  // Delete the job (DB cascades: floors/pins/shares).
  const { error: delErr } = await svc.from("jobs").delete().eq("id", jobId);
  if (delErr) return json(500, { error: delErr.message });

  return json(200, { ok: true });
});

