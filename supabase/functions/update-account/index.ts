import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

function corsHeaders(req: Request) {
  const requested =
    req.headers.get("access-control-request-headers") ??
    "Content-Type, Authorization, apikey, x-client-info, x-supabase-api-version, prefer";
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": requested,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  } as const;
}

function json(req: Request, status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders(req),
    },
  });
}

type UpdateBody = {
  currentPassword?: string;
  newEmail?: string;
  newPassword?: string;
};

Deno.serve(async (req) => {
  try {
    if (req.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: { ...corsHeaders(req) } });
    }
    if (req.method !== "POST") return json(req, 405, { error: "Method not allowed" });

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !anonKey || !serviceKey) {
      return json(req, 500, { error: "Server misconfigured" });
    }

    const authHeader = req.headers.get("authorization") ?? "";
    if (!authHeader.toLowerCase().startsWith("bearer ")) {
      return json(req, 401, { error: "Missing auth" });
    }

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false },
    });
    const svc = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false },
    });

    const { data: userData, error: userErr } = await userClient.auth.getUser();
    const user = userData?.user;
    if (userErr || !user) return json(req, 401, { error: "Invalid auth" });

    const { currentPassword, newEmail, newPassword } = (await req
      .json()
      .catch(() => ({}))) as UpdateBody;

    if (!currentPassword) {
      return json(req, 400, { error: "currentPassword is required" });
    }
    if (!newEmail && !newPassword) {
      return json(req, 400, { error: "newEmail or newPassword is required" });
    }
    if (!user.email) {
      return json(req, 400, { error: "No authenticated email found for current user" });
    }

    // Verify current password first.
    const verifier = createClient(supabaseUrl, anonKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
        storageKey: `SiteDocHB-fn-reauth-${crypto.randomUUID()}`,
      },
    });
    const { error: verifyErr } = await verifier.auth.signInWithPassword({
      email: user.email,
      password: currentPassword,
    });
    if (verifyErr) return json(req, 401, { error: "Current password is incorrect." });

    const updatePayload: {
      email?: string;
      email_confirm?: boolean;
      password?: string;
    } = {};

    if (newEmail) {
      updatePayload.email = newEmail.trim().toLowerCase();
      // Ensure email takes effect immediately without client-side /auth/v1/user flow.
      updatePayload.email_confirm = true;
    }
    if (newPassword) {
      updatePayload.password = newPassword;
    }

    const { error: updateErr } = await svc.auth.admin.updateUserById(user.id, updatePayload);
    if (updateErr) {
      return json(req, 400, {
        error: updateErr.message,
        code: updateErr.code ?? null,
      });
    }

    return json(req, 200, { ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unhandled function error";
    return json(req, 500, { error: message });
  }
});

