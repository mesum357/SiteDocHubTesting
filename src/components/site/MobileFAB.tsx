import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { MapPin, Plus, X } from "lucide-react";

interface Props {
  onPlacePin: () => void;
}

const MobileFAB = ({ onPlacePin }: Props) => {
  const [open, setOpen] = useState(false);
  return (
    <div className="fixed bottom-6 right-4 z-30 flex flex-col items-end gap-2">
      <AnimatePresence>
        {open && (
          <>
            <motion.button
              key="place"
              initial={{ opacity: 0, y: 10, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.9 }}
              transition={{ delay: 0.04 }}
              onClick={() => { setOpen(false); onPlacePin(); }}
              className="flex items-center gap-2 rounded-full border border-hairline bg-elevated px-3 py-2 text-xs font-medium text-ink shadow-lg"
            >
              <MapPin className="h-3.5 w-3.5 text-accent" /> Place Pin
            </motion.button>
          </>
        )}
      </AnimatePresence>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label="Quick actions"
        className="grid h-14 w-14 place-items-center rounded-full bg-accent text-accent-foreground shadow-[0_8px_24px_-6px_hsl(var(--accent)/0.6)] transition-transform active:scale-95"
      >
        <motion.span animate={{ rotate: open ? 45 : 0 }}>{open ? <X className="h-6 w-6" /> : <Plus className="h-6 w-6" />}</motion.span>
      </button>
    </div>
  );
};

export default MobileFAB;
