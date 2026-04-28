import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")! // service role — bypasses RLS for read
);

function corsHeaders(req: Request) {
  const requested =
    req.headers.get("access-control-request-headers") ??
    "Content-Type, Authorization, apikey, x-client-info, x-supabase-api-version, prefer";
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": requested,
  } as const;
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: corsHeaders(req),
    });
  }

  const url = new URL(req.url);
  const token = url.pathname.split("/").pop();

  if (!token) {
    return new Response(JSON.stringify({ error: "Missing token" }), {
      status: 400,
      headers: { "Content-Type": "application/json", ...corsHeaders(req) },
    });
  }

  // Look up share token
  const { data: share, error: shareError } = await supabase
    .from("shares")
    .select("job_id, expires_at")
    .eq("token", token)
    .single();

  if (shareError || !share) {
    return new Response(JSON.stringify({ error: "Invalid or expired link" }), {
      status: 404,
      headers: { "Content-Type": "application/json", ...corsHeaders(req) },
    });
  }

  // Check expiry
  if (share.expires_at && new Date(share.expires_at) < new Date()) {
    return new Response(JSON.stringify({ error: "This link has expired" }), {
      status: 410,
      headers: { "Content-Type": "application/json", ...corsHeaders(req) },
    });
  }

  // Fetch job (support both schema variants: created_date vs created_at)
  let job: {
    id: string;
    name: string;
    description: string | null;
    created_date: string | null;
  } | null = null;

  const jobWithDate = await supabase
    .from("jobs")
    .select("id, name, description, created_date")
    .eq("id", share.job_id)
    .maybeSingle();

  if (!jobWithDate.error && jobWithDate.data) {
    job = {
      id: jobWithDate.data.id as string,
      name: jobWithDate.data.name as string,
      description: (jobWithDate.data.description as string | null) ?? "",
      created_date: (jobWithDate.data.created_date as string | null) ?? null,
    };
  } else {
    const jobWithCreatedAt = await supabase
      .from("jobs")
      .select("id, name, description, created_at")
      .eq("id", share.job_id)
      .maybeSingle();

    if (!jobWithCreatedAt.error && jobWithCreatedAt.data) {
      const createdAt = jobWithCreatedAt.data.created_at as string | null;
      job = {
        id: jobWithCreatedAt.data.id as string,
        name: jobWithCreatedAt.data.name as string,
        description: (jobWithCreatedAt.data.description as string | null) ?? "",
        created_date: createdAt ? new Date(createdAt).toISOString().slice(0, 10) : null,
      };
    }
  }

  // Fetch floors ordered by floor_order
  const { data: floors } = await supabase
    .from("floors")
    .select("id, label, floor_order, pdf_path")
    .eq("job_id", share.job_id)
    .order("floor_order");

  // Fetch pins for all floors
  const floorIds = floors?.map((f: { id: string }) => f.id) ?? [];
  const { data: pins } = await supabase
    .from("pins")
    .select(
      "id, floor_id, name, x_pct, y_pct, pin_order, photo_path, note, photo_taken_at"
    )
    .in("floor_id", floorIds)
    .order("pin_order");

  const pinIds = (pins ?? [])
    .map((p: { id: string }) => p.id)
    .filter((id): id is string => Boolean(id));
  const { data: pinImages } = pinIds.length
    ? await supabase
        .from("pin_images")
        .select("id, pin_id, photo_path, photo_taken_at")
        .in("pin_id", pinIds)
        .order("photo_taken_at", { ascending: false })
    : { data: [] as Array<{ id: string; pin_id: string; photo_path: string; photo_taken_at: string }> };

  // Generate signed URLs for latest pin photo + pin image history.
  const allPhotoPaths = [
    ...((pins ?? []).map((p: { photo_path: string | null }) => p.photo_path).filter((p): p is string => Boolean(p))),
    ...((pinImages ?? []).map((p) => p.photo_path).filter((p): p is string => Boolean(p))),
  ];
  const uniquePhotoPaths = [...new Set(allPhotoPaths)];
  const signedPhotoUrlByPath = new Map<string, string>();
  if (uniquePhotoPaths.length > 0) {
    const { data: signedPhotosData } = await supabase.storage
      .from("pin-photos")
      .createSignedUrls(uniquePhotoPaths, 3600);
    signedPhotosData?.forEach((item) => {
      if (!item.error && item.signedUrl) signedPhotoUrlByPath.set(item.path, item.signedUrl);
    });
  }

  const signedPins = await Promise.all(
    (pins ?? []).map(
      async (pin: { photo_path: string | null; [key: string]: unknown }) => {
        const pinId = pin.id as string;
        let photoUrl = pin.photo_path ? signedPhotoUrlByPath.get(pin.photo_path) ?? null : null;
        if (!photoUrl && pin.photo_path) {
          const { data: legacyData } = await supabase.storage
            .from("site-photos")
            .createSignedUrl(pin.photo_path, 3600);
          photoUrl = legacyData?.signedUrl ?? null;
        }

        const photos = (pinImages ?? [])
          .filter((img) => img.pin_id === pinId)
          .map((img) => ({
            id: img.id,
            pin_id: img.pin_id,
            photo_path: img.photo_path,
            photo_taken_at: img.photo_taken_at,
            photoUrl: signedPhotoUrlByPath.get(img.photo_path) ?? null,
          }))
          .filter((img) => Boolean(img.photoUrl));

        return { ...pin, photoUrl, photos };
      }
    )
  );

  // Generate signed URLs for floor plan PDFs
  const signedFloors = await Promise.all(
    (floors ?? []).map(
      async (floor: { pdf_path: string | null; [key: string]: unknown }) => {
        let pdfUrl = null;
        if (floor.pdf_path) {
          const { data } = await supabase.storage
            .from("floor-plans")
            .createSignedUrl(floor.pdf_path, 3600);
          pdfUrl = data?.signedUrl ?? null;
        }
        return { ...floor, pdfUrl };
      }
    )
  );

  return new Response(
    JSON.stringify({ job, floors: signedFloors, pins: signedPins }),
    {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        ...corsHeaders(req),
      },
    }
  );
});
