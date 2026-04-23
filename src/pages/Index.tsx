import { useEffect, useState } from "react";
import { Toaster as Sonner } from "@/components/ui/sonner";
import Header from "@/components/site/Header";
import Sidebar from "@/components/site/Sidebar";
import FloorPlanCanvas from "@/components/site/FloorPlanCanvas";
import PinDetailPanel from "@/components/site/PinDetailPanel";
import MobileBottomSheet from "@/components/site/MobileBottomSheet";
import MobileFAB from "@/components/site/MobileFAB";
import NewJobModal from "@/components/site/NewJobModal";
import ShareLinkModal from "@/components/site/ShareLinkModal";
import { CanvasSkeleton, SidebarSkeleton } from "@/components/site/Skeletons";
import { useAppStore } from "@/store/useAppStore";
import { useIsMobile } from "@/hooks/use-mobile";

const Index = () => {
  const [loaded, setLoaded] = useState(false);
  const [newJobOpen, setNewJobOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const isMobile = useIsMobile();
  const placementMode = useAppStore((s) => s.placementMode);

  useEffect(() => {
    const t = setTimeout(() => setLoaded(true), 750);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className="flex h-screen w-full flex-col overflow-hidden bg-base text-ink">
      <Header onNewJob={() => setNewJobOpen(true)} onShare={() => setShareOpen(true)} />

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar — desktop & tablet */}
        <aside className="hidden md:flex md:w-[280px] lg:w-[280px] flex-shrink-0 border-r border-hairline bg-surface overflow-y-auto">
          {loaded ? <Sidebar onNewJob={() => setNewJobOpen(true)} /> : <SidebarSkeleton />}
        </aside>

        {/* Canvas */}
        <main className="relative flex-1 overflow-hidden">
          {loaded ? <FloorPlanCanvas /> : <CanvasSkeleton />}
        </main>

        {/* Right panel — desktop only */}
        <aside className="hidden lg:flex w-[320px] flex-shrink-0 border-l border-hairline bg-surface overflow-y-auto">
          <PinDetailPanel />
        </aside>
      </div>

      {/* Mobile bottom sheet */}
      {isMobile && <MobileBottomSheet />}
      {isMobile && <MobileFAB onPlacePin={() => useAppStore.getState().togglePlacement(true)} />}

      {/* Tablet right panel as overlay */}
      {!isMobile && <PinDetailPanel tabletOverlay />}

      <NewJobModal open={newJobOpen} onOpenChange={setNewJobOpen} />
      <ShareLinkModal open={shareOpen} onOpenChange={setShareOpen} />

      <Sonner
        position={isMobile ? "top-center" : "top-right"}
        toastOptions={{
          classNames: {
            toast: "!bg-elevated !border-hairline !text-ink !font-sans",
          },
        }}
      />

      {placementMode && (
        <div className="pointer-events-none fixed inset-x-0 top-16 z-40 mx-auto w-fit rounded-full border border-accent bg-accent-soft px-4 py-1.5 text-xs font-display uppercase tracking-wider text-accent animate-fade-up">
          Placement mode — click the floor plan
        </div>
      )}
    </div>
  );
};

export default Index;
