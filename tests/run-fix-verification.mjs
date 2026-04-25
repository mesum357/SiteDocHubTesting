/* eslint-disable no-console */
import { spawn } from "node:child_process";

function parseEnvArg(argv) {
  const arg = argv.find((a) => a.startsWith("--env="));
  if (arg) {
    const value = arg.slice("--env=".length);
    return value === "dev" ? "dev" : "prod";
  }
  const idx = argv.findIndex((a) => a === "--env");
  if (idx >= 0 && argv[idx + 1]) {
    return argv[idx + 1] === "dev" ? "dev" : "prod";
  }
  const shortIdx = argv.findIndex((a) => a === "-e");
  if (shortIdx >= 0 && argv[shortIdx + 1]) {
    return argv[shortIdx + 1] === "dev" ? "dev" : "prod";
  }
  const positional = argv.find((a) => a === "dev" || a === "prod");
  if (positional) return positional;
  return "prod";
}

function runCommand(command, args, extraEnv = {}) {
  return new Promise((resolve) => {
    const startedAt = Date.now();
    const child = spawn(command, args, {
      stdio: "inherit",
      shell: true,
      env: { ...process.env, ...extraEnv },
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

function formatDuration(ms) {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

async function main() {
  const targetEnv = parseEnvArg(process.argv.slice(2));
  const baseUrl =
    targetEnv === "dev" ? "http://localhost:8080" : "https://siteview-pro.onrender.com";
  const playwrightConfig =
    targetEnv === "dev" ? "playwright.config.ts" : "playwright.prod.config.ts";

  console.log(`\n[fix-verification] env=${targetEnv} baseUrl=${baseUrl}\n`);

  const smoke = await runCommand("node", ["tests/prod-cors-smoke.mjs"], {
    TARGET_ENV: targetEnv,
    BASE_URL: baseUrl,
  });

  const e2e = await runCommand(
    "npx",
    [
      "playwright",
      "test",
      "--config",
      playwrightConfig,
      "tests/prod-share-delete.spec.ts",
    ],
    {
      TARGET_ENV: targetEnv,
      BASE_URL: baseUrl,
    }
  );

  const allPassed = smoke.ok && e2e.ok;
  console.log("\n[fix-verification] summary");
  console.log(
    `  - api-smoke: ${smoke.ok ? "PASS" : "FAIL"} (exit=${smoke.code}, duration=${formatDuration(smoke.ms)})`
  );
  console.log(
    `  - e2e-flow : ${e2e.ok ? "PASS" : "FAIL"} (exit=${e2e.code}, duration=${formatDuration(e2e.ms)})`
  );
  console.log(`  - overall  : ${allPassed ? "PASS" : "FAIL"}\n`);

  process.exit(allPassed ? 0 : 1);
}

main().catch((err) => {
  console.error("[fix-verification] fatal error", err);
  process.exit(1);
});

