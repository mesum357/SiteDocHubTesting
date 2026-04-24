import { useState } from "react";
import { Link2, Download, ChevronDown, User, Plus, WifiOff, RefreshCw, Check, AlertTriangle, Camera } from "lucide-react";
import { useActiveJob, useAppStore } from "@/store/useAppStore";
import { useSyncStatus } from "@/hooks/useSyncStatus";
import { flushUploadQueue } from "@/lib/syncEngine";
import { generateHtmlReport, downloadHtmlReport } from "@/lib/exportHtml";
import { canPerform } from "@/lib/permissions";
import { useAuthStore } from "@/store/useAuthStore";
import { cn } from "@/lib/utils";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

interface Props {
  onNewJob: () => void;
  onShare: () => void;
}

const Header = ({ onNewJob, onShare }: Props) => {
  const job = useActiveJob();
  const jobs = useAppStore((s) => s.jobs);
  const setActiveJob = useAppStore((s) => s.setActiveJob);
  const { label: syncLabel, color: syncColor, status: syncStatus } = useSyncStatus();
  const [open, setOpen] = useState(false);
  const [userOpen, setUserOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const { role, user, signOut } = useAuthStore();
  const navigate = useNavigate();

  const handleSyncClick = () => {
    if (syncStatus === "error") {
      flushUploadQueue();
      toast.info("Retrying sync...");
    }
  };

  return (
    <header className="glass sticky top-0 z-30 flex h-14 md:h-16 items-center justify-between border-b border-hairline px-3 md:px-5">
      {/* Brand */}
      <div className="flex items-center gap-2.5">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent text-base font-bold shadow-lg shadow-accent/20">
          <Camera size={16} className="text-white" />
        </div>
        <span className="font-display text-sm md:text-base font-semibold tracking-tight !text-white">
          Sitedochub
        </span>
      </div>

      {/* Job selector */}
      <div className="relative">
        <button
          onClick={() => setOpen((o) => !o)}
          className="lift-on-hover flex items-center gap-2 rounded-full border border-hairline bg-elevated px-3 py-1.5 text-sm font-medium text-ink hover:border-accent"
          aria-label="Select job"
        >
          <span className="max-w-[140px] md:max-w-none truncate font-display">
            {job?.name ?? "Select a job"}
          </span>
          <ChevronDown className={cn("h-4 w-4 text-ink-secondary transition-transform", open && "rotate-180")} />
        </button>
        {open && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
            <div className="absolute left-1/2 top-[calc(100%+8px)] z-50 w-[280px] -translate-x-1/2 overflow-hidden rounded-lg border border-hairline bg-elevated shadow-2xl animate-scale-in">
              {jobs.length === 0 ? (
                <div className="px-4 py-6 text-center text-xs text-ink-secondary">
                  No jobs yet — create your first one below.
                </div>
              ) : (
                <ul className="max-h-72 overflow-y-auto py-1">
                  {jobs.map((j) => (
                    <li key={j.id}>
                      <button
                        onClick={() => { setActiveJob(j.id); setOpen(false); }}
                        className={cn(
                          "flex w-full items-center justify-between px-3 py-2.5 text-left transition-colors hover:bg-accent-soft",
                          j.id === job?.id && "bg-accent-soft",
                        )}
                      >
                        <div className="min-w-0">
                          <div className="truncate text-sm font-medium text-ink">{j.name}</div>
                          <div className="font-mono-data text-[11px] text-ink-secondary">
                            {new Date(j.createdAt).toLocaleDateString()}
                            {j.archived && " · archived"}
                          </div>
                        </div>
                        {j.id === job?.id && <Check className="h-4 w-4 text-accent" />}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {canPerform(role, "CREATE_JOB") && (
                <button
                  onClick={() => { setOpen(false); onNewJob(); }}
                  className="flex w-full items-center gap-2 border-t border-hairline px-3 py-2.5 text-sm font-medium text-accent transition-colors hover:bg-accent-soft"
                >
                  <Plus className="h-4 w-4" /> New Job
                </button>
              )}
            </div>
          </>
        )}
      </div>

      {/* Right cluster */}
      <div className="flex items-center gap-1.5 md:gap-2">
        <button
          onClick={handleSyncClick}
          aria-label="Sync status"
          className="lift-on-hover flex items-center gap-1.5 rounded-md border border-hairline bg-elevated px-2.5 py-1.5 text-xs hover:border-accent"
        >
          {syncColor === "green" && (
            <><span className="h-2 w-2 rounded-full bg-ok" /><span className="hidden sm:inline text-ink-secondary">{syncLabel}</span></>
          )}
          {syncColor === "blue" && (
            <><RefreshCw className="h-3.5 w-3.5 animate-spin text-accent" /><span className="hidden sm:inline text-ink-secondary">{syncLabel}</span></>
          )}
          {syncColor === "amber" && (
            <>
              {syncStatus === "error"
                ? <AlertTriangle className="h-3.5 w-3.5 text-amber-400" />
                : <WifiOff className="h-3.5 w-3.5 text-amber-400" />
              }
              <span className="text-ink-secondary">{syncLabel}</span>
            </>
          )}
        </button>
        {canPerform(role, "GENERATE_SHARE") && (
          <button onClick={() => { onShare(); }} aria-label="Share" className="lift-on-hover hidden sm:grid h-8 w-8 place-items-center rounded-md border border-hairline bg-elevated text-ink-secondary hover:border-accent hover:text-accent">
            <Link2 className="h-4 w-4" />
          </button>
        )}
        {canPerform(role, "EXPORT_REPORT") && (
          <button
            onClick={async () => {
              if (!job || exporting) return;
              setExporting(true);
              const toastId = toast.loading("Generating export…");
              try {
                const { html, filename } = await generateHtmlReport(job, (pct) => {
                  toast.loading(`Encoding photos… ${pct}%`, { id: toastId });
                });
                downloadHtmlReport(html, filename);
                toast.success(`Exported ${filename}`, { id: toastId });
              } catch {
                toast.error("Export failed", { id: toastId });
              } finally {
                setExporting(false);
              }
            }}
            disabled={!job || exporting}
            aria-label="Export"
            className="lift-on-hover hidden sm:grid h-8 w-8 place-items-center rounded-md border border-hairline bg-elevated text-ink-secondary hover:border-accent hover:text-accent"
          >
            <Download className="h-4 w-4" />
          </button>
        )}
        <div className="relative">
          <button onClick={() => setUserOpen((o) => !o)} aria-label="Account" className="lift-on-hover grid h-8 w-8 place-items-center rounded-full border border-hairline bg-elevated text-xs font-display text-ink hover:border-accent uppercase">
            {user?.email?.slice(0, 2) ?? "US"}
          </button>
          {userOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setUserOpen(false)} />
              <div className="absolute right-0 top-[calc(100%+6px)] z-50 w-44 overflow-hidden rounded-lg border border-hairline bg-elevated shadow-2xl animate-scale-in">
                {canPerform(role, "MANAGE_USERS") && (
                  <button className="flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-accent-soft" onClick={() => { setUserOpen(false); navigate("/admin/users"); }}>
                    <User className="h-4 w-4 text-ink-secondary" /> Users
                  </button>
                )}
                <button className="flex w-full items-center gap-2 border-t border-hairline px-3 py-2 text-sm hover:bg-accent-soft" onClick={async () => { setUserOpen(false); await signOut(); navigate("/login"); toast.info("Signed out"); }}>
                  Sign out
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
