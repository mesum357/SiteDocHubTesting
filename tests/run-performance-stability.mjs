import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { chromium, devices } from "@playwright/test";

const BASE_URL = process.env.BASE_URL || "http://localhost:8080";
const OUT_DIR = path.resolve("test-results", "performance");
const OUT_FILE = path.join(OUT_DIR, "performance-stability-report.json");
const NAV_TIMEOUT_MS = 45_000;
const SERVER_WAIT_MS = 60_000;

const THRESHOLDS = {
  desktopLcpMs: Number(process.env.PERF_DESKTOP_LCP_MAX_MS || 4000),
  mobileLcpMs: Number(process.env.PERF_MOBILE_LCP_MAX_MS || 3000),
  clsMax: Number(process.env.PERF_CLS_MAX || 0.1),
  inpMsMax: Number(process.env.PERF_INP_MAX_MS || 200),
};

const PROFILES = [
  {
    name: "desktop-chrome",
    options: {
      viewport: { width: 1440, height: 900 },
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    },
  },
  { name: "iphone-13", options: devices["iPhone 13"] },
  { name: "pixel-7", options: devices["Pixel 7"] },
  { name: "ipad-pro-11", options: devices["iPad Pro 11"] },
];

function nowIso() {
  return new Date().toISOString();
}

async function sleep(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function isServerUp(url) {
  try {
    const res = await fetch(url, { method: "GET" });
    return res.status >= 200 && res.status < 500;
  } catch {
    return false;
  }
}

async function ensureServer() {
  if (await isServerUp(BASE_URL)) return { child: null, startedByScript: false };

  const child = spawn("npm", ["run", "dev"], {
    cwd: process.cwd(),
    shell: true,
    stdio: "pipe",
    env: process.env,
  });

  let stdout = "";
  let stderr = "";
  child.stdout?.on("data", (d) => {
    stdout += String(d);
  });
  child.stderr?.on("data", (d) => {
    stderr += String(d);
  });

  const startedAt = Date.now();
  while (Date.now() - startedAt < SERVER_WAIT_MS) {
    // eslint-disable-next-line no-await-in-loop
    if (await isServerUp(BASE_URL)) {
      return { child, startedByScript: true };
    }
    // eslint-disable-next-line no-await-in-loop
    await sleep(1000);
  }

  child.kill();
  throw new Error(
    `Dev server did not become ready at ${BASE_URL} within ${SERVER_WAIT_MS}ms.\nstdout:\n${stdout}\nstderr:\n${stderr}`
  );
}

function classifyLcpMs(lcpMs) {
  if (!Number.isFinite(lcpMs)) return "unknown";
  if (lcpMs <= 2500) return "good";
  if (lcpMs <= 4000) return "needs-improvement";
  return "poor";
}

function classifyCls(cls) {
  if (!Number.isFinite(cls)) return "unknown";
  if (cls <= 0.1) return "good";
  if (cls <= 0.25) return "needs-improvement";
  return "poor";
}

function classifyInpMs(inpMs) {
  if (!Number.isFinite(inpMs)) return "unknown";
  if (inpMs <= 200) return "good";
  if (inpMs <= 500) return "needs-improvement";
  return "poor";
}

async function maybeLogin(page) {
  const email = process.env.E2E_EMAIL;
  const password = process.env.E2E_PASSWORD;
  const emailInput = page.locator('input[type="email"]');
  const passwordInput = page.locator('input[type="password"]');
  if (!(await emailInput.count()) || !(await passwordInput.count())) return { attempted: false, ok: true };
  if (!email || !password) return { attempted: false, ok: false, reason: "login-required-but-no-creds" };

  await emailInput.first().fill(email);
  await passwordInput.first().fill(password);
  await page.getByRole("button", { name: /sign in|login/i }).first().click();
  await page.waitForTimeout(1500);
  return { attempted: true, ok: true };
}

async function runProfile(browser, profile) {
  const startedAt = Date.now();
  const context = await browser.newContext({
    ...profile.options,
  });
  const page = await context.newPage();

  const consoleErrors = [];
  const pageErrors = [];
  const requestFailures = [];
  const crashEvents = [];

  page.on("console", (msg) => {
    if (msg.type() === "error") {
      consoleErrors.push(msg.text());
    }
  });
  page.on("pageerror", (err) => {
    pageErrors.push(err.message);
  });
  page.on("requestfailed", (req) => {
    requestFailures.push({
      url: req.url(),
      method: req.method(),
      failure: req.failure()?.errorText || "unknown",
    });
  });
  page.on("crash", () => {
    crashEvents.push("page-crash");
  });

  await page.addInitScript(() => {
    window.__siteviewPerf = {
      lcp: 0,
      cls: 0,
      inp: 0,
      fcp: 0,
      ttfb: 0,
      navType: "",
      lcpElement: "",
    };

    try {
      const nav = performance.getEntriesByType("navigation")[0];
      if (nav) {
        window.__siteviewPerf.ttfb = nav.responseStart || 0;
        window.__siteviewPerf.navType = nav.type || "";
      }
    } catch {
      // ignore
    }

    new PerformanceObserver((entryList) => {
      const entries = entryList.getEntries();
      for (const entry of entries) {
        if (entry.name === "first-contentful-paint") {
          window.__siteviewPerf.fcp = entry.startTime;
        }
      }
    }).observe({ type: "paint", buffered: true });

    new PerformanceObserver((entryList) => {
      const entries = entryList.getEntries();
      const last = entries[entries.length - 1];
      if (!last) return;
      window.__siteviewPerf.lcp = last.startTime;
      if (last.element && last.element.tagName) {
        const el = last.element;
        const cls = [el.tagName.toLowerCase(), ...(el.classList ? [...el.classList] : [])].join(".");
        window.__siteviewPerf.lcpElement = cls;
      }
    }).observe({ type: "largest-contentful-paint", buffered: true });

    new PerformanceObserver((entryList) => {
      for (const entry of entryList.getEntries()) {
        if (!entry.hadRecentInput) {
          window.__siteviewPerf.cls += entry.value;
        }
      }
    }).observe({ type: "layout-shift", buffered: true });

    new PerformanceObserver((entryList) => {
      for (const entry of entryList.getEntries()) {
        // event-timing duration is a good local proxy for responsiveness.
        if (entry.duration > window.__siteviewPerf.inp) {
          window.__siteviewPerf.inp = entry.duration;
        }
      }
    }).observe({ type: "event", buffered: true, durationThreshold: 16 });
  });

  let navigationOk = true;
  let navigationError = null;
  try {
    await page.goto(BASE_URL, { waitUntil: "domcontentloaded", timeout: NAV_TIMEOUT_MS });
  } catch (err) {
    navigationOk = false;
    navigationError = err instanceof Error ? err.message : String(err);
  }

  const loginResult = navigationOk ? await maybeLogin(page) : { attempted: false, ok: false };
  await page.waitForTimeout(1800);

  // Basic interaction sampling to surface crash-on-interaction issues.
  if (navigationOk) {
    const mapRoot = page.locator('[data-testid="floor-plan-root"]');
    if (await mapRoot.count()) {
      const refreshBtn = page.getByRole("button", { name: /refresh/i });
      if (await refreshBtn.count()) {
        await refreshBtn.first().click({ force: true });
      }
      await page.mouse.wheel(0, 800);
      await page.mouse.wheel(0, -800);
    }
  }

  const perf = navigationOk
    ? await page.evaluate(() => {
        return {
          ...window.__siteviewPerf,
          url: location.href,
        };
      })
    : {
        lcp: 0,
        cls: 0,
        inp: 0,
        fcp: 0,
        ttfb: 0,
        navType: "",
        lcpElement: "",
        url: "",
      };

  await context.close();

  const hasHardFailure =
    !navigationOk ||
    crashEvents.length > 0 ||
    pageErrors.length > 0 ||
    requestFailures.some((r) => !r.url.includes("favicon"));

  return {
    profile: profile.name,
    timestamp: nowIso(),
    durationMs: Date.now() - startedAt,
    navigationOk,
    navigationError,
    login: loginResult,
    metrics: {
      lcpMs: Math.round(perf.lcp || 0),
      cls: Number((perf.cls || 0).toFixed(4)),
      inpMs: Math.round(perf.inp || 0),
      fcpMs: Math.round(perf.fcp || 0),
      ttfbMs: Math.round(perf.ttfb || 0),
      navType: perf.navType || "",
      lcpElement: perf.lcpElement || "",
      finalUrl: perf.url || "",
      lcpRating: classifyLcpMs(perf.lcp || 0),
      clsRating: classifyCls(perf.cls || 0),
      inpRating: classifyInpMs(perf.inp || 0),
    },
    stability: {
      hasHardFailure,
      crashCount: crashEvents.length,
      pageErrorCount: pageErrors.length,
      consoleErrorCount: consoleErrors.length,
      failedRequestCount: requestFailures.length,
      pageErrors,
      consoleErrors,
      requestFailures,
    },
  };
}

async function main() {
  await fs.mkdir(OUT_DIR, { recursive: true });
  const server = await ensureServer();
  let browser;
  try {
    // Prefer system Chrome so script works even when Playwright bundled browsers
    // are not installed.
    browser = await chromium.launch({ headless: true, channel: "chrome" });
  } catch {
    browser = await chromium.launch({ headless: true });
  }
  const runs = [];
  try {
    for (const profile of PROFILES) {
      // eslint-disable-next-line no-console
      console.log(`[perf] running profile: ${profile.name}`);
      // eslint-disable-next-line no-await-in-loop
      const result = await runProfile(browser, profile);
      runs.push(result);
    }
  } finally {
    await browser.close();
    if (server.startedByScript && server.child) {
      server.child.kill();
    }
  }

  const hardFailures = runs.filter((r) => r.stability.hasHardFailure);
  const perfFailures = runs.flatMap((r) => {
    const failures = [];
    const isDesktop = r.profile.includes("desktop");
    const lcpLimit = isDesktop ? THRESHOLDS.desktopLcpMs : THRESHOLDS.mobileLcpMs;
    if (r.metrics.lcpMs > lcpLimit) {
      failures.push({
        profile: r.profile,
        metric: "LCP",
        actual: r.metrics.lcpMs,
        limit: lcpLimit,
      });
    }
    if (r.metrics.cls > THRESHOLDS.clsMax) {
      failures.push({
        profile: r.profile,
        metric: "CLS",
        actual: r.metrics.cls,
        limit: THRESHOLDS.clsMax,
      });
    }
    if (r.metrics.inpMs > THRESHOLDS.inpMsMax) {
      failures.push({
        profile: r.profile,
        metric: "INP",
        actual: r.metrics.inpMs,
        limit: THRESHOLDS.inpMsMax,
      });
    }
    return failures;
  });

  const summary = {
    generatedAt: nowIso(),
    baseUrl: BASE_URL,
    profileCount: runs.length,
    hardFailureCount: hardFailures.length,
    perfFailureCount: perfFailures.length,
    thresholds: THRESHOLDS,
    pass: hardFailures.length === 0 && perfFailures.length === 0,
    notes: [
      "This script provides synthetic local metrics and crash/error checks.",
      "It cannot guarantee zero crashes across all real devices, but fails on strong crash/error signals.",
    ],
  };

  const report = { summary, runs, perfFailures };
  await fs.writeFile(OUT_FILE, JSON.stringify(report, null, 2), "utf-8");

  // eslint-disable-next-line no-console
  console.log(`\n[perf] report written: ${OUT_FILE}`);
  for (const run of runs) {
    // eslint-disable-next-line no-console
    console.log(
      `[perf] ${run.profile} | LCP=${run.metrics.lcpMs}ms (${run.metrics.lcpRating}) | CLS=${run.metrics.cls} (${run.metrics.clsRating}) | INP=${run.metrics.inpMs}ms (${run.metrics.inpRating}) | hardFailure=${run.stability.hasHardFailure}`
    );
  }
  if (perfFailures.length > 0) {
    // eslint-disable-next-line no-console
    console.log("[perf] threshold failures:");
    for (const failure of perfFailures) {
      // eslint-disable-next-line no-console
      console.log(
        `  - ${failure.profile} ${failure.metric}: actual=${failure.actual} limit=${failure.limit}`
      );
    }
  }

  process.exit(summary.pass ? 0 : 1);
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("[perf] fatal error", err);
  process.exit(1);
});

