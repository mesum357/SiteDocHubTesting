import { useEffect, useState } from "react";
import { motion, useDragControls } from "framer-motion";
import { useAppStore, useActiveFloor, useActiveJob } from "@/store/useAppStore";
import { useAuthStore } from "@/store/useAuthStore";
import { canPerform } from "@/lib/permissions";
import PinDetailPanel from "./PinDetailPanel";
import { cn } from "@/lib/utils";
import { useCachedPinPhotoUrl } from "@/hooks/useCachedPinPhotoUrl";

const COLLAPSED_HEIGHT = "44px"; // larger grab area for easier swipe
const EXPANDED_HEIGHT = "70vh";

const MobileBottomSheet = () => {
  const job = useActiveJob();
  const floor = useActiveFloor();
  const selectedPinId = useAppStore((s) => s.selectedPinId);
  const selectPin = useAppStore((s) => s.selectPin);
  const togglePlacement = useAppStore((s) => s.togglePlacement);
  const addFloor = useAppStore((s) => s.addFloor);
  const role = useAuthStore((s) => s.role);

  const [expanded, setExpanded] = useState(false);
  const [addingFloor, setAddingFloor] = useState(false);
  const [floorDraft, setFloorDraft] = useState("");
  const dragControls = useDragControls();

  const showPin = !!selectedPinId;

  // Auto-open details when a map pin is selected on mobile.
  useEffect(() => {
    if (selectedPinId) {
      setExpanded(true);
    }
  }, [selectedPinId]);

  return (
    <motion.div
      drag="y"
      dragListener={false}
      dragControls={dragControls}
      dragConstraints={{ top: 0, bottom: 0 }}
      dragSnapToOrigin
      dragElastic={0.08}
      onDragEnd={(_, info) => {
        if (info.offset.y < -30) setExpanded(true);
        else if (info.offset.y > 30) setExpanded(false);
      }}
      className={cn("fixed inset-x-0 bottom-0 z-20 flex flex-col rounded-t-2xl border-t border-hairline bg-surface shadow-[0_-12px_40px_-8px_rgba(0,0,0,0.6)]")}
      initial={{ height: COLLAPSED_HEIGHT }}
      animate={{ height: expanded ? EXPANDED_HEIGHT : COLLAPSED_HEIGHT }}
      transition={{ type: "spring", stiffness: 240, damping: 26 }}
    >
      <div
        className="flex cursor-grab touch-none justify-center py-2 active:cursor-grabbing"
        onPointerDown={(e) => dragControls.start(e)}
        onClick={() => setExpanded((v) => !v)}
      >
        <div className="h-1.5 w-12 rounded-full bg-hairline" />
      </div>

      {expanded ? (
        <div className="flex min-h-0 flex-1 flex-col">
          {showPin ? (
            <div className="min-h-0 flex-1 overflow-hidden">
              <PinDetailPanel />
            </div>
          ) : (
            <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
              <div className="mb-2 flex items-center justify-between px-1">
                <h3 className="font-display text-sm text-ink">{floor?.name} pins</h3>
                <div className="flex items-center gap-2">
                  {canPerform(role, "CREATE_FLOOR") &&
                    (addingFloor ? (
                      <input
                        autoFocus
                        value={floorDraft}
                        onChange={(e) => setFloorDraft(e.target.value)}
                        onBlur={() => {
                          if (job && floorDraft.trim()) addFloor(job.id, floorDraft.trim());
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
                        className="w-24 rounded-full border border-accent bg-elevated px-2 py-1 text-xs outline-none"
                      />
                    ) : (
                      <button onClick={() => setAddingFloor(true)} className="text-xs font-medium text-accent">+ Floor</button>
                    ))}
                  <button onClick={() => togglePlacement(true)} className="text-xs font-medium text-accent">+ Place</button>
                </div>
              </div>
              <ul className="space-y-1">
                {floor?.pins.map((p) => (
                  <PinRow key={p.id} pin={p} onSelect={() => selectPin(p.id)} />
                ))}
              </ul>
            </div>
          )}
        </div>
      ) : (
        <div className="sr-only">Bottom sheet minimized</div>
      )}
    </motion.div>
  );
};

function PinRow({
  pin,
  onSelect,
}: {
  pin: { id: string; name: string; photoUrl?: string };
  onSelect: () => void;
}) {
  const src = useCachedPinPhotoUrl(pin.id, pin.photoUrl);
  return (
    <li>
      <button
        onClick={onSelect}
        className="flex w-full items-center gap-3 rounded-md px-2 py-2 text-left hover:bg-elevated"
      >
        {pin.photoUrl ? (
          <img src={src} alt="" className="h-6 w-6 rounded-full object-cover ring-1 ring-ok" />
        ) : (
          <span className="h-2.5 w-2.5 rounded-full border border-accent pin-pulse" />
        )}
        <span className="flex-1 truncate text-sm text-ink">{pin.name}</span>
      </button>
    </li>
  );
}

export default MobileBottomSheet;
