/// <reference lib="webworker" />

declare const self: ServiceWorkerGlobalScope & { __WB_DISABLE_DEV_LOGS?: boolean };

/** Runs before other workbox imports in `sw.ts` (import order). */
self.__WB_DISABLE_DEV_LOGS = true;

export {};
