import { useState } from "react";
import { Link2, Download, ChevronDown, User, Plus, Wifi, WifiOff, RefreshCw, Check } from "lucide-react";
import { useActiveJob, useAppStore } from "@/store/useAppStore";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface Props {
  onNewJob: () => void;
  onShare: () => void;
}

const Header = ({ onNewJob, onShare }: Props) => {
  const job = useActiveJob();
  const jobs = useAppStore((s) => s.jobs);
  const setActiveJob = useAppStore((s) => s.setActiveJob);
  const sync = useAppStore((s) => s.syncStatus);
  const queued = useAppStore((s) => s.queuedCount);
  const cycleSync = useAppStore((s) => s.cycleSyncStatus);
  const [open, setOpen] = useState(false);
  const [userOpen, setUserOpen] = useState(false);

  return (
    <header className="glass sticky top-0 z-30 flex h-14 md:h-16 items-center justify-between border-b border-hairline px-3 md:px-5">
      {/* Brand */}
      <div className="flex items-center gap-2.5">
        <div className="grid h-7 w-7 place-items-center rounded-md bg-accent shadow-[0_4px_16px_-4px_hsl(var(--accent)/0.6)]">
          <div className="h-3 w-3 rounded-sm bg-base" />
        </div>
        <span className="font-display text-sm md:text-base font-medium tracking-tight text-ink">
          SiteDocHB
        </span>
      </div>

      {/* Job selector */}
      <div className="relative">
        <button
          onClick={() => setOpen((o) => !o)}
          className="lift-on-hover flex items-center gap-2 rounded-full border border-hairline bg-elevated px-3 py-1.5 text-sm font-medium text-ink hover:border-accent"
          aria-label="Select job"
        >
          <span className="max-w-[140px] md:max-w-none truncate font-display">{job.name}</span>
          <ChevronDown className={cn("h-4 w-4 text-ink-secondary transition-transform", open && "rotate-180")} />
        </button>
        {open && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
            <div className="absolute left-1/2 top-[calc(100%+8px)] z-50 w-[280px] -translate-x-1/2 overflow-hidden rounded-lg border border-hairline bg-elevated shadow-2xl animate-scale-in">
              <ul className="max-h-72 overflow-y-auto py-1">
                {jobs.map((j) => (
                  <li key={j.id}>
                    <button
                      onClick={() => { setActiveJob(j.id); setOpen(false); }}
                      className={cn(
                        "flex w-full items-center justify-between px-3 py-2.5 text-left transition-colors hover:bg-accent-soft",
                        j.id === job.id && "bg-accent-soft",
                      )}
                    >
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium text-ink">{j.name}</div>
                        <div className="font-mono-data text-[11px] text-ink-secondary">
                          {new Date(j.createdAt).toLocaleDateString()}
                          {j.archived && " · archived"}
                        </div>
                      </div>
                      {j.id === job.id && <Check className="h-4 w-4 text-accent" />}
                    </button>
                  </li>
                ))}
              </ul>
              <button
                onClick={() => { setOpen(false); onNewJob(); }}
                className="flex w-full items-center gap-2 border-t border-hairline px-3 py-2.5 text-sm font-medium text-accent transition-colors hover:bg-accent-soft"
              >
                <Plus className="h-4 w-4" /> New Job
              </button>
            </div>
          </>
        )}
      </div>

      {/* Right cluster */}
      <div className="flex items-center gap-1.5 md:gap-2">
        <button
          onClick={cycleSync}
          aria-label="Sync status"
          className="lift-on-hover flex items-center gap-1.5 rounded-md border border-hairline bg-elevated px-2.5 py-1.5 text-xs hover:border-accent"
        >
          {sync === "synced" && (<><span className="h-2 w-2 rounded-full bg-ok" /><span className="hidden sm:inline text-ink-secondary">Synced</span></>)}
          {sync === "syncing" && (<><RefreshCw className="h-3.5 w-3.5 animate-spin text-accent" /><span className="hidden sm:inline text-ink-secondary">Syncing…</span></>)}
          {sync === "offline" && (<><WifiOff className="h-3.5 w-3.5 text-accent" /><span className="text-ink-secondary">Offline · {queued} queued</span></>)}
        </button>
        <button onClick={() => { onShare(); }} aria-label="Share" className="lift-on-hover hidden sm:grid h-8 w-8 place-items-center rounded-md border border-hairline bg-elevated text-ink-secondary hover:border-accent hover:text-accent">
          <Link2 className="h-4 w-4" />
        </button>
        <button onClick={() => toast.info("Export started")} aria-label="Export" className="lift-on-hover hidden sm:grid h-8 w-8 place-items-center rounded-md border border-hairline bg-elevated text-ink-secondary hover:border-accent hover:text-accent">
          <Download className="h-4 w-4" />
        </button>
        <div className="relative">
          <button onClick={() => setUserOpen((o) => !o)} aria-label="Account" className="lift-on-hover grid h-8 w-8 place-items-center rounded-full border border-hairline bg-elevated text-xs font-display text-ink hover:border-accent">
            HB
          </button>
          {userOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setUserOpen(false)} />
              <div className="absolute right-0 top-[calc(100%+6px)] z-50 w-44 overflow-hidden rounded-lg border border-hairline bg-elevated shadow-2xl animate-scale-in">
                <button className="flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-accent-soft" onClick={() => { setUserOpen(false); toast.info("Settings opened"); }}>
                  <User className="h-4 w-4 text-ink-secondary" /> Settings
                </button>
                <button className="flex w-full items-center gap-2 border-t border-hairline px-3 py-2 text-sm hover:bg-accent-soft" onClick={() => { setUserOpen(false); toast.info("Signed out"); }}>
                  <Wifi className="h-4 w-4 text-ink-secondary" /> Sign out
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  );
};

export default Header;
