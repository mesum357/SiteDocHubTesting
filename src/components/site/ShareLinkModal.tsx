import { useEffect, useState } from "react";
import { Check, Copy, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useActiveJob } from "@/store/useAppStore";
import { supabase } from "@/lib/supabaseClient";

interface Props { open: boolean; onOpenChange: (b: boolean) => void }

const ShareLinkModal = ({ open, onOpenChange }: Props) => {
  const job = useActiveJob();
  const [copied, setCopied] = useState(false);
  const [expiry, setExpiry] = useState("");
  const [shareUrl, setShareUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !job) return;
    setCopied(false);
    setShareUrl("");
    setError(null);
    setLoading(true);

    const generateToken = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const body: { job_id: string; expires_at?: string } = { job_id: job.id };
        if (expiry) body.expires_at = new Date(expiry).toISOString();

        const res = await supabase.functions.invoke("generate-share-token", {
          body,
          headers: session?.access_token
            ? { Authorization: `Bearer ${session.access_token}` }
            : undefined,
        });

        if (res.error) throw res.error;
        const token = res.data?.token;
        if (!token) throw new Error("No token returned");

        const base = window.location.origin;
        setShareUrl(`${base}/share/${token}`);
      } catch (err: any) {
        console.error("[SiteDocHB] Share token error:", err);
        setError("Failed to generate share link");
        // Fallback: use job ID directly
        setShareUrl(`${window.location.origin}/share/${job.id}`);
      } finally {
        setLoading(false);
      }
    };

    generateToken();
  }, [open, job?.id]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-base/60 p-4 backdrop-blur-sm" onClick={() => onOpenChange(false)}>
      <div className="w-full max-w-md rounded-xl border border-hairline bg-surface p-5 shadow-2xl animate-scale-in" onClick={(e) => e.stopPropagation()}>
        <h2 className="font-display text-base text-ink">Share read-only link</h2>
        <p className="mt-1 text-xs text-ink-secondary">Anyone with this link can view this job read-only.</p>

        <div className="mt-4 flex items-center gap-2">
          {loading ? (
            <div className="flex flex-1 items-center gap-2 rounded-md border border-hairline bg-elevated px-3 py-2">
              <Loader2 className="h-3.5 w-3.5 animate-spin text-accent" />
              <span className="text-xs text-ink-secondary">Generating link…</span>
            </div>
          ) : (
            <input readOnly value={shareUrl} className="flex-1 rounded-md border border-hairline bg-elevated px-3 py-2 font-mono-data text-xs text-ink outline-none" />
          )}
          <button
            onClick={() => {
              if (!shareUrl) return;
              navigator.clipboard.writeText(shareUrl);
              setCopied(true);
              toast.info("Link copied to clipboard");
              setTimeout(() => setCopied(false), 2000);
            }}
            disabled={loading || !shareUrl}
            className="lift-on-hover flex h-9 items-center gap-1.5 rounded-md bg-accent px-3 font-display text-xs text-accent-foreground disabled:opacity-50"
          >
            {copied ? <><Check className="h-3.5 w-3.5" /> Copied!</> : <><Copy className="h-3.5 w-3.5" /> Copy</>}
          </button>
        </div>

        {error && (
          <div className="mt-2 text-[11px] text-amber-400">{error} — using fallback link</div>
        )}

        <div className="mt-4">
          <label className="block">
            <span className="mb-1 block font-display text-[11px] uppercase tracking-wider text-ink-secondary">Expires (optional)</span>
            <input type="date" value={expiry} onChange={(e) => setExpiry(e.target.value)} className="w-full rounded-md border border-hairline bg-elevated px-3 py-2 text-sm text-ink outline-none focus:border-accent" />
          </label>
        </div>

        <div className="mt-5 flex justify-end">
          <button onClick={() => onOpenChange(false)} className="rounded-md border border-hairline px-3 py-2 text-sm text-ink-secondary hover:bg-elevated">Done</button>
        </div>
      </div>
    </div>
  );
};

export default ShareLinkModal;
