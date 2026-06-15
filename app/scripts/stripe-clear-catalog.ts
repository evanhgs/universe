import { createRequire } from "node:module";

import type Stripe from "stripe";

type StripeClientModule = typeof import("@/lib/stripe.client");
type ModuleWithLoadHook = {
  _load?: (request: string, parent: unknown, isMain: boolean) => unknown;
};

type ClearCatalogArgs = {
  dryRun: boolean;
  confirmed: boolean;
  universeOnly: boolean;
};

type ClearCatalogStats = {
  activePricesFound: number;
  activeProductsFound: number;
  activePricesArchived: number;
  activeProductsArchived: number;
  skippedLiveObjects: number;
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

function parseArgs(argv: string[]): ClearCatalogArgs {
  const args = {
    dryRun: false,
    confirmed: false,
    universeOnly: false,
  };

  for (const arg of argv) {
    if (arg === "--dry-run") {
      args.dryRun = true;
      continue;
    }

    if (arg === "--confirm-clear-test-catalog") {
      args.confirmed = true;
      continue;
    }

    if (arg === "--universe-only") {
      args.universeOnly = true;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return args;
}

function assertSafeTestMode(args: ClearCatalogArgs) {
  const secretKey = process.env.STRIPE_SECRET_KEY ?? "";

  if (secretKey.startsWith("sk_live_") || secretKey.startsWith("rk_live_")) {
    throw new Error("Refusing to clear a live Stripe catalog.");
  }

  if (!args.dryRun && !args.confirmed) {
    throw new Error(
      "Missing --confirm-clear-test-catalog. Run with --dry-run first, then confirm explicitly.",
    );
  }
}

function isUniversePrice(price: Stripe.Price) {
  return Boolean(price.metadata.beatId || price.metadata.offeringId || price.metadata.ownerId);
}

function isUniverseProduct(product: Stripe.Product) {
  return Boolean(product.metadata.beatId || product.metadata.ownerId || product.metadata.slug);
}

function priceProductId(price: Stripe.Price) {
  if (typeof price.product === "string") {
    return price.product;
  }

  return price.product?.id;
}

function isDefaultPriceError(error: unknown) {
  return error instanceof Error && error.message.toLowerCase().includes("default price");
}

async function listActivePrices(stripe: Stripe, universeOnly: boolean) {
  const prices: Stripe.Price[] = [];
  let startingAfter: string | undefined;

  do {
    const page = await stripe.prices.list({
      active: true,
      limit: 100,
      ...(startingAfter ? { starting_after: startingAfter } : {}),
    });

    prices.push(...page.data.filter((price) => !universeOnly || isUniversePrice(price)));
    startingAfter = page.has_more ? page.data.at(-1)?.id : undefined;
  } while (startingAfter);

  return prices;
}

async function listActiveProducts(stripe: Stripe, universeOnly: boolean) {
  const products: Stripe.Product[] = [];
  let startingAfter: string | undefined;

  do {
    const page = await stripe.products.list({
      active: true,
      limit: 100,
      ...(startingAfter ? { starting_after: startingAfter } : {}),
    });

    products.push(...page.data.filter((product) => !universeOnly || isUniverseProduct(product)));
    startingAfter = page.has_more ? page.data.at(-1)?.id : undefined;
  } while (startingAfter);

  return products;
}

async function archivePrice(stripe: Stripe, price: Stripe.Price) {
  try {
    await stripe.prices.update(price.id, { active: false });
  } catch (error) {
    if (!isDefaultPriceError(error)) {
      throw error;
    }

    const productId = priceProductId(price);

    if (!productId) {
      throw error;
    }

    await stripe.products.update(productId, { active: false });
    await stripe.prices.update(price.id, { active: false });
  }
}

async function clearCatalog(stripe: Stripe, args: ClearCatalogArgs): Promise<ClearCatalogStats> {
  const activePrices = await listActivePrices(stripe, args.universeOnly);
  const activeProducts = await listActiveProducts(stripe, args.universeOnly);
  const stats: ClearCatalogStats = {
    activePricesFound: activePrices.length,
    activeProductsFound: activeProducts.length,
    activePricesArchived: 0,
    activeProductsArchived: 0,
    skippedLiveObjects: 0,
  };

  for (const product of activeProducts) {
    if (product.livemode) {
      stats.skippedLiveObjects += 1;
      continue;
    }

    if (!args.dryRun) {
      await stripe.products.update(product.id, { active: false });
    }

    stats.activeProductsArchived += 1;
  }

  for (const price of activePrices) {
    if (price.livemode) {
      stats.skippedLiveObjects += 1;
      continue;
    }

    if (!args.dryRun) {
      await archivePrice(stripe, price);
    }

    stats.activePricesArchived += 1;
  }

  return stats;
}

async function main() {
  installServerOnlyShim();

  const args = parseArgs(process.argv.slice(2));
  assertSafeTestMode(args);

  const { getStripeClient }: StripeClientModule = await import("@/lib/stripe.client");
  const stats = await clearCatalog(getStripeClient(), args);

  console.log(
    JSON.stringify(
      {
        dryRun: args.dryRun,
        universeOnly: args.universeOnly,
        mode: args.dryRun ? "preview" : "archive",
        ...stats,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
