import { createRequire } from "node:module";

/**
 * Pour utiliser ce script :
    make stripe-sync-catalog ARGS="--dry-run"
    make stripe-sync-catalog ARGS="--beat-id beat_xxx"

    make stripe-clear-catalog ARGS="--dry-run"
    
 */

type StripeCatalogService = typeof import("@/server/beats/stripe.catalog.service");
type ModuleWithLoadHook = {
  _load?: (request: string, parent: unknown, isMain: boolean) => unknown;
};

/**
 * `server-only` is a Next.js bundler marker. In a direct Node/tsx CLI it loads
 * the real package, which intentionally throws. This script is server-side, so
 * provide a no-op module before dynamically importing app services.
 */
function installServerOnlyShim() {
  const require = createRequire(import.meta.url);
  const moduleLoader = require("node:module") as ModuleWithLoadHook;
  const originalLoad = moduleLoader._load?.bind(moduleLoader);

  if (!originalLoad) {
    return;
  }

  moduleLoader._load = (request, parent, isMain) => {
    if (request === "server-only") {
      return {};
    }

    return originalLoad(request, parent, isMain);
  };
}

function parseArgs(argv: string[]) {
  const args = {
    dryRun: false,
    beatId: undefined as string | undefined,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--dry-run") {
      args.dryRun = true;
      continue;
    }

    if (arg === "--beat-id") {
      const beatId = argv[index + 1];

      if (!beatId) {
        throw new Error("--beat-id requires a value");
      }

      args.beatId = beatId;
      index += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return args;
}

async function main() {
  installServerOnlyShim();

  const {
    listStripeCatalogSyncCandidates,
    syncStripeCatalogForBeat,
  }: StripeCatalogService = await import("@/server/beats/stripe.catalog.service");
  const args = parseArgs(process.argv.slice(2));
  const candidates = await listStripeCatalogSyncCandidates(args.beatId);

  console.log(
    JSON.stringify(
      {
        dryRun: args.dryRun,
        candidateCount: candidates.length,
        candidates,
      },
      null,
      2,
    ),
  );

  for (const candidate of candidates) {
    const result = await syncStripeCatalogForBeat(candidate.id, {
      dryRun: args.dryRun,
    });

    console.log(JSON.stringify(result));
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
