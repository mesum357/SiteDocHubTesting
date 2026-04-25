import { useState } from "react";
import { motion, useDragControls } from "framer-motion";
import { useAppStore, useActiveFloor } from "@/store/useAppStore";
import PinDetailPanel from "./PinDetailPanel";
import { cn } from "@/lib/utils";

const COLLAPSED_HEIGHT = "14px"; // handle-only
const EXPANDED_HEIGHT = "70vh";

const MobileBottomSheet = () => {
  const floor = useActiveFloor();
  const selectedPinId = useAppStore((s) => s.selectedPinId);
  const selectPin = useAppStore((s) => s.selectPin);
  const togglePlacement = useAppStore((s) => s.togglePlacement);

  const [expanded, setExpanded] = useState(false);
  const dragControls = useDragControls();

  const showPin = !!selectedPinId;

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
        <div className="h-1 w-8 rounded-full bg-hairline" />
      </div>

      {expanded && showPin ? (
        <div className="flex-1 overflow-hidden">
          <PinDetailPanel />
        </div>
      ) : expanded ? (
        <div className="flex-1 overflow-y-auto px-3 py-3">
          <div className="mb-2 flex items-center justify-between px-1">
            <h3 className="font-display text-sm text-ink">{floor?.name} pins</h3>
            <button onClick={() => togglePlacement(true)} className="text-xs font-medium text-accent">+ Place</button>
          </div>
          <ul className="space-y-1">
            {floor?.pins.map((p) => (
              <li key={p.id}>
                <button onClick={() => selectPin(p.id)} className="flex w-full items-center gap-3 rounded-md px-2 py-2 text-left hover:bg-elevated">
                  {p.photoUrl ? (
                    <img src={p.photoUrl} alt="" className="h-6 w-6 rounded-full object-cover ring-1 ring-ok" />
                  ) : (
                    <span className="h-2.5 w-2.5 rounded-full border border-accent pin-pulse" />
                  )}
                  <span className="flex-1 truncate text-sm text-ink">{p.name}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <div className="sr-only">Bottom sheet minimized</div>
      )}
    </motion.div>
  );
};

export default MobileBottomSheet;
