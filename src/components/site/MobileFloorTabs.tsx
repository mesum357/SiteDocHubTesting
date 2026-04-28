import { useEffect, useRef, useState } from "react";
import { useActiveJob, useAppStore } from "@/store/useAppStore";
import { useAuthStore } from "@/store/useAuthStore";
import { canPerform } from "@/lib/permissions";
import { cn } from "@/lib/utils";

const MobileFloorTabs = () => {
  const job = useActiveJob();
  const activeFloorId = useAppStore((s) => s.activeFloorId);
  const setActiveFloor = useAppStore((s) => s.setActiveFloor);
  const addFloor = useAppStore((s) => s.addFloor);
  const role = useAuthStore((s) => s.role);
  const activeTabRef = useRef<HTMLButtonElement | null>(null);
  const [elevated, setElevated] = useState(false);
  const [addingFloor, setAddingFloor] = useState(false);
  const [floorDraft, setFloorDraft] = useState("");

  useEffect(() => {
    activeTabRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
      inline: "center",
    });
  }, [activeFloorId]);

  useEffect(() => {
    const onScroll = () => setElevated(window.scrollY > 2);
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  if (!job || job.floors.length === 0) return null;

  return (
    <div
      className={cn(
        "sticky top-14 z-20 border-b border-hairline bg-surface/95 px-2 py-1.5 backdrop-blur-sm transition-shadow md:hidden",
        elevated ? "shadow-[0_8px_18px_-14px_rgba(0,0,0,0.8)]" : "shadow-none"
      )}
    >
      <div className="flex gap-1.5 overflow-x-auto pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {job.floors.map((f) => (
          <button
            key={f.id}
            ref={activeFloorId === f.id ? activeTabRef : null}
            onClick={() => setActiveFloor(f.id)}
            className={cn(
              "shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors sm:px-3 sm:text-xs",
              activeFloorId === f.id
                ? "border-accent bg-accent text-accent-foreground shadow-[0_6px_16px_-8px_hsl(var(--accent)/0.8)]"
                : "border-hairline bg-elevated text-ink-secondary"
            )}
          >
            <span className="inline-flex items-center gap-1.5">
              <span>{f.name}</span>
              <span
                className={cn(
                  "rounded-full px-1.5 py-0.5 text-[10px] leading-none",
                  activeFloorId === f.id
                    ? "bg-white/20 text-accent-foreground"
                    : "bg-hairline text-ink-secondary"
                )}
              >
                {f.pins.length}
              </span>
            </span>
          </button>
        ))}
        {canPerform(role, "CREATE_FLOOR") &&
          (addingFloor ? (
            <input
              autoFocus
              value={floorDraft}
              onChange={(e) => setFloorDraft(e.target.value)}
              onBlur={() => {
                if (floorDraft.trim()) addFloor(job.id, floorDraft.trim());
                setAddingFloor(false);
                setFloorDraft("");
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                if (e.key === "Escape") {
                  setAddingFloor(false);
                  setFloorDraft("");
                }
              }}
              placeholder="Floor name"
              className="w-24 shrink-0 rounded-full border border-accent bg-elevated px-2 py-1 text-xs text-ink outline-none"
            />
          ) : (
            <button
              onClick={() => setAddingFloor(true)}
              className="shrink-0 rounded-full border border-accent bg-accent-soft px-2.5 py-1 text-[11px] font-medium text-accent sm:px-3 sm:text-xs"
            >
              Add floor
            </button>
          ))}
      </div>
    </div>
  );
};

export default MobileFloorTabs;
