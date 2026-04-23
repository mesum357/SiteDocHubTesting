import { useEffect, useState } from "react";
import { useAppStore } from "@/store/useAppStore";
import { toast } from "sonner";

interface Props { open: boolean; onOpenChange: (b: boolean) => void; }

const NewJobModal = ({ open, onOpenChange }: Props) => {
  const createJob = useAppStore((s) => s.createJob);
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("Photo Walk");
  const [floor, setFloor] = useState("Floor 1");

  useEffect(() => { if (open) { setName(""); setDesc("Photo Walk"); setFloor("Floor 1"); } }, [open]);

  if (!open) return null;

  const submit = () => {
    if (!name.trim()) return;
    createJob({ name: name.trim(), description: desc.trim(), firstFloorLabel: floor.trim() || "Floor 1" });
    toast.success(`Created "${name.trim()}"`);
    onOpenChange(false);
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-base/60 p-4 backdrop-blur-sm" onClick={() => onOpenChange(false)}>
      <div className="w-full max-w-md rounded-xl border border-hairline bg-surface p-5 shadow-2xl animate-scale-in" onClick={(e) => e.stopPropagation()}>
        <h2 className="font-display text-base text-ink">New Job</h2>
        <p className="mt-1 text-xs text-ink-secondary">Create a new photo-walk job for a project site.</p>

        <div className="mt-4 space-y-3">
          <Field label="Job Name" required>
            <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Mill St Apts" className="w-full rounded-md border border-hairline bg-elevated px-3 py-2 text-sm text-ink outline-none focus:border-accent" />
          </Field>
          <Field label="Description">
            <input value={desc} onChange={(e) => setDesc(e.target.value)} className="w-full rounded-md border border-hairline bg-elevated px-3 py-2 text-sm text-ink outline-none focus:border-accent" />
          </Field>
          <Field label="First Floor Label">
            <input value={floor} onChange={(e) => setFloor(e.target.value)} className="w-full rounded-md border border-hairline bg-elevated px-3 py-2 text-sm text-ink outline-none focus:border-accent" />
          </Field>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button onClick={() => onOpenChange(false)} className="rounded-md px-3 py-2 text-sm text-ink-secondary hover:bg-elevated">Cancel</button>
          <button onClick={submit} disabled={!name.trim()} className="lift-on-hover rounded-md bg-accent px-4 py-2 font-display text-sm text-accent-foreground disabled:opacity-40">Create Job</button>
        </div>
      </div>
    </div>
  );
};

const Field = ({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) => (
  <label className="block">
    <span className="mb-1 block font-display text-[11px] uppercase tracking-wider text-ink-secondary">
      {label} {required && <span className="text-accent">*</span>}
    </span>
    {children}
  </label>
);

export default NewJobModal;
