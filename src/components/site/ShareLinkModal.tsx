import { useEffect, useState } from "react";
import { Check, Copy } from "lucide-react";
import { toast } from "sonner";
import { useActiveJob } from "@/store/useAppStore";

interface Props { open: boolean; onOpenChange: (b: boolean) => void }

const ShareLinkModal = ({ open, onOpenChange }: Props) => {
  const job = useActiveJob();
  const [copied, setCopied] = useState(false);
  const [expiry, setExpiry] = useState("");

  useEffect(() => { if (open) setCopied(false); }, [open]);

  if (!open) return null;
  const url = `https://sitedoc.halsell.app/share/${job.id}`;

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-base/60 p-4 backdrop-blur-sm" onClick={() => onOpenChange(false)}>
      <div className="w-full max-w-md rounded-xl border border-hairline bg-surface p-5 shadow-2xl animate-scale-in" onClick={(e) => e.stopPropagation()}>
        <h2 className="font-display text-base text-ink">Share read-only link</h2>
        <p className="mt-1 text-xs text-ink-secondary">Anyone with this link can view this job read-only.</p>

        <div className="mt-4 flex items-center gap-2">
          <input readOnly value={url} className="flex-1 rounded-md border border-hairline bg-elevated px-3 py-2 font-mono-data text-xs text-ink outline-none" />
          <button
            onClick={() => { navigator.clipboard.writeText(url); setCopied(true); toast.info("Link copied to clipboard"); setTimeout(() => setCopied(false), 2000); }}
            className="lift-on-hover flex h-9 items-center gap-1.5 rounded-md bg-accent px-3 font-display text-xs text-accent-foreground"
          >
            {copied ? <><Check className="h-3.5 w-3.5" /> Copied!</> : <><Copy className="h-3.5 w-3.5" /> Copy</>}
          </button>
        </div>

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
