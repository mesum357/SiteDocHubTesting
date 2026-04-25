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
import { useSyncStatus } from "@/hooks/useSyncStatus";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

const Index = () => {
  const [newJobOpen, setNewJobOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [installPromptEvent, setInstallPromptEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [installBannerDismissed, setInstallBannerDismissed] = useState(false);
  const [iosHintDismissed, setIosHintDismissed] = useState(false);
  const isMobile = useIsMobile();
  const placementMode = useAppStore((s) => s.placementMode);
  const loaded = useAppStore((s) => s.loaded);
  const loadJobs = useAppStore((s) => s.loadJobs);
  const { status: syncStatus, queueCount } = useSyncStatus();

  const isStandalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
  const ua = navigator.userAgent.toLowerCase();
  const isIos = /iphone|ipad|ipod/.test(ua);
  const isSafari = isIos && /safari/.test(ua) && !/crios|fxios|edgios/.test(ua);

  useEffect(() => {
    loadJobs();
  }, [loadJobs]);

  useEffect(() => {
    const onBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPromptEvent(event as BeforeInstallPromptEvent);
    };

    const onAppInstalled = () => {
      setInstallPromptEvent(null);
      setInstallBannerDismissed(true);
      setIosHintDismissed(true);
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.addEventListener("appinstalled", onAppInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("appinstalled", onAppInstalled);
    };
  }, []);

  const canShowInstallBanner =
    !isStandalone &&
    !!installPromptEvent &&
    !installBannerDismissed;

  const canShowIosHint =
    !isStandalone &&
    isIos &&
    isSafari &&
    !canShowInstallBanner &&
    !iosHintDismissed;

  const handleInstallApp = async () => {
    if (!installPromptEvent) return;
    await installPromptEvent.prompt();
    const choice = await installPromptEvent.userChoice;
    setInstallPromptEvent(null);
    if (choice.outcome === "accepted") {
      setInstallBannerDismissed(true);
    }
  };

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

      {syncStatus === "syncing" && (
        <div className="pointer-events-none fixed bottom-3 left-1/2 z-40 -translate-x-1/2 rounded-full border border-accent/40 bg-elevated/95 px-3 py-1 text-[11px] text-ink-secondary shadow-lg">
          syncing... {queueCount} queued
        </div>
      )}

      {canShowInstallBanner && (
        <div className="fixed inset-x-3 bottom-3 z-50 md:left-auto md:right-3 md:w-[380px] rounded-lg border border-hairline bg-surface/95 p-3 shadow-2xl backdrop-blur-md">
          <div className="text-sm font-medium text-ink">Install SiteDocHub app</div>
          <p className="mt-1 text-xs text-ink-secondary">
            Add this app to your phone for quick access and better offline experience.
          </p>
          <div className="mt-3 flex items-center justify-end gap-2">
            <button
              onClick={() => setInstallBannerDismissed(true)}
              className="rounded-md px-2.5 py-1.5 text-xs text-ink-secondary hover:bg-elevated"
            >
              Later
            </button>
            <button
              onClick={handleInstallApp}
              className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-accent-foreground"
            >
              Install app
            </button>
          </div>
        </div>
      )}

      {canShowIosHint && (
        <div className="fixed inset-x-3 bottom-3 z-50 md:left-auto md:right-3 md:w-[420px] rounded-lg border border-hairline bg-surface/95 p-3 shadow-2xl backdrop-blur-md">
          <div className="text-sm font-medium text-ink">Install on iPhone</div>
          <p className="mt-1 text-xs text-ink-secondary">
            In Safari, tap Share, then tap Add to Home Screen.
          </p>
          <div className="mt-3 flex items-center justify-end">
            <button
              onClick={() => setIosHintDismissed(true)}
              className="rounded-md px-2.5 py-1.5 text-xs text-ink-secondary hover:bg-elevated"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default Index;
