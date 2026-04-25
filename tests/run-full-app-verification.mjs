import { spawn } from "node:child_process";

function runCommand(command, args, env = {}) {
  return new Promise((resolve) => {
    const startedAt = Date.now();
    const child = spawn(command, args, {
      stdio: "inherit",
      shell: true,
      env: { ...process.env, ...env },
    });
    child.on("close", (code) => {
      resolve({
        ok: code === 0,
        code: code ?? 1,
        ms: Date.now() - startedAt,
      });
    });
  });
}

function fmt(ms) {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

async function main() {
  const baseDev = "http://localhost:8080";
  const baseProd = "https://siteview-pro.onrender.com";

  const stages = [];

  // PROD smoke (API + critical E2E path)
  stages.push({
    name: "prod-smoke",
    result: await runCommand("node", ["tests/run-fix-verification.mjs", "prod"], {
      BASE_URL: baseProd,
      TARGET_ENV: "prod",
    }),
  });

  // DEV exhaustive modular suite (auth, floors/pdf, pins, uploads, insta mock, export, offline/cache/sync)
  stages.push({
    name: "dev-exhaustive",
    result: await runCommand(
      "npx",
      [
        "playwright",
        "test",
        "--config=playwright.config.ts",
        "--workers=1",
        "tests/auth-and-shell.spec.ts",
        "tests/security-page.spec.ts",
        "tests/pin-placement-consistency.spec.ts",
        "tests/uploads-online.spec.ts",
        "tests/insta360-mocked.spec.ts",
        "tests/export-html.spec.ts",
        "tests/offline-workflow.e2e.spec.ts",
        "tests/offline-workflow-granular.spec.ts",
        "tests/full-app-smoke.spec.ts",
      ],
      { BASE_URL: baseDev, TARGET_ENV: "dev" }
    ),
  });

  const allPassed = stages.every((s) => s.result.ok);
  console.log("\n[full-app-verification] summary");
  for (const stage of stages) {
    console.log(
      `  - ${stage.name}: ${stage.result.ok ? "PASS" : "FAIL"} (exit=${stage.result.code}, duration=${fmt(
        stage.result.ms
      )})`
    );
  }
  console.log(`  - overall: ${allPassed ? "PASS" : "FAIL"}\n`);

  process.exit(allPassed ? 0 : 1);
}

main().catch((err) => {
  console.error("[full-app-verification] fatal error", err);
  process.exit(1);
});

