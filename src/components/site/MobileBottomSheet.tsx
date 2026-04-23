import { useState } from "react";
import { motion, useMotionValue, animate } from "framer-motion";
import { useAppStore, useActiveFloor } from "@/store/useAppStore";
import PinDetailPanel from "./PinDetailPanel";
import { cn } from "@/lib/utils";

const SNAP_COLLAPSED = 0.7; // 30vh visible
const SNAP_EXPANDED = 0.3;  // 70vh visible

const MobileBottomSheet = () => {
  const floor = useActiveFloor();
  const selectedPinId = useAppStore((s) => s.selectedPinId);
  const selectPin = useAppStore((s) => s.selectPin);
  const togglePlacement = useAppStore((s) => s.togglePlacement);

  const [expanded, setExpanded] = useState(false);
  const y = useMotionValue(0);

  const snapTo = (toExpanded: boolean) => {
    const vh = window.innerHeight;
    const target = toExpanded ? vh * SNAP_EXPANDED : vh * SNAP_COLLAPSED;
    animate(y, target - vh * (expanded ? SNAP_EXPANDED : SNAP_COLLAPSED), { type: "spring", stiffness: 280, damping: 28 });
    setExpanded(toExpanded);
  };

  const showPin = !!selectedPinId;

  return (
    <motion.div
      drag="y"
      dragConstraints={{ top: -window.innerHeight * 0.4, bottom: 0 }}
      dragElastic={0.15}
      onDragEnd={(_, info) => {
        if (info.offset.y < -60) snapTo(true);
        else if (info.offset.y > 60) snapTo(false);
        else animate(y, 0, { type: "spring", stiffness: 280, damping: 28 });
      }}
      style={{ y }}
      className={cn(
        "fixed inset-x-0 bottom-0 z-20 flex flex-col rounded-t-2xl border-t border-hairline bg-surface shadow-[0_-12px_40px_-8px_rgba(0,0,0,0.6)]",
      )}
      initial={{ height: "30vh" }}
      animate={{ height: expanded ? "70vh" : "30vh" }}
      transition={{ type: "spring", stiffness: 240, damping: 26 }}
    >
      <div className="flex justify-center pt-2" onClick={() => snapTo(!expanded)}>
        <div className="h-1 w-8 rounded-full bg-hairline" />
      </div>

      {showPin ? (
        <div className="flex-1 overflow-hidden">
          <PinDetailPanel />
        </div>
      ) : (
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
      )}
    </motion.div>
  );
};

export default MobileBottomSheet;
