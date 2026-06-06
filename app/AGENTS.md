<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Product Context For Coding Agents

## Role of this app

This repository is building a music marketplace platform for:

* beatmakers / producers
* artists
* sound engineers

The platform is not just a simple beat store. It combines:

* instrumental publishing and selling
* buyer/seller messaging
* seller analytics
* music rights / contract workflows
* discovery feed with algorithmic ranking
* future compliance, KYC, and Content ID capabilities

When implementing features, default to product decisions that support trust, monetization, scalability, and a creator-first workflow.

## Current technical direction

Expected stack from the client docs:

* frontend: Next.js + React + TypeScript + Tailwindcss + Shadcn
* frontend architecture: App Router, hybrid SSR / CSR / ISR depending on page
* backend direction: Next.js for core app flows, FastAPI for scoring / AI logic, Axum or Rust workers for heavy audio processing
* product priorities: strong desktop UX first, mobile support is still important, feed scrolling and public page performance matter

## Canonical business docs

Read these before changing product logic, naming, flows, permissions, monetization, or roadmap-sensitive features:

* `docs/fr/Cahier des charges.md`
* `docs/fr/versions à préparer.md`
* `docs/fr/Toutes les tâches métier.md`

Use them as the source of truth for business intent. If code and docs disagree, flag the mismatch instead of silently guessing.

## Product summary

Core business scope described by the client:

* user accounts, roles, profile management, and identity verification
* seller public profiles with ratings, followers, and catalog visibility
* beat publication with audio upload, metadata, thumbnail, previews, and license handling
* marketplace checkout with Stripe / PayPal and platform commissions
* internal chat between users, with later language detection and translation
* seller dashboard with sales, listens, revenue, and conversion analytics
* contract generation and digital signature flows tied to purchases
* music rights management around SACEM / ASCAP / SGAE / PRS
* discovery, ranking, and a TikTok-like feed for previews
* longer-term fingerprinting, crawler, and Content ID features

## Roadmap framing

Prioritize features according to the phased rollout described in `docs/fr/versions à préparer.md`:

* V1: signup, publication, catalog, purchase, payment, download access, basic chat
* V2: feed, discovery scoring, subscriptions, richer analytics, social proof
* V3: contracts, legal structure, KYC, moderation, admin
* V4: Content ID, crawling, advanced recommendation, publishing/edition features

Unless the task explicitly targets later phases, prefer decisions that unblock or stabilize V1 first.

## Business rules that should not be invented ad hoc

These are specifically called out in the client material and should remain consistent across implementations:

* default platform commission: 30%
* premium subscription can reduce commission to around 9%
* the first 3 publications are boosted
* free offers can carry mandatory platform branding / restrictions
* contracts and license logic are part of the product, not an afterthought

## Current implementation notes

### Analytics, scoring, and feed V2

The discovery feed now depends on first-party analytics events and recommendation scores.

When changing tracking, scoring, feed ranking, or seller analytics:

* treat PostgreSQL as the source of truth for analytics events and score snapshots
* keep Redis focused on rate limits, short-lived counters, and future buffering/cache work
* preserve the canonical analytics event names used by the client and API:
  `beat_impression`, `beat_click`, `beat_play`, `beat_pause`, `beat_skip`,
  `beat_like`, `beat_save`, `beat_share`, `beat_full_play`, `license_click`,
  `seller_profile_view`, `seller_follow`, `add_to_cart`, `purchase`, `search`,
  and `message_seller`
* never accept client-side `purchase` analytics as proof of payment; purchases must be recorded from trusted server-side payment/order flows
* keep anonymous tracking limited to low-risk listening/impression signals unless explicitly reviewed
* update both event aggregation and recommendation score recomputation when adding new high-impact signals
* keep recommendation outputs explainable enough for `/account-test` diagnostics and client demos

Important local files:

* `src/server/analytics/analytics.service.ts`: event validation, aggregation, taste profiles, scoring, and recommended feed payloads
* `src/server/analytics/analytics.constants.ts`: event weights, feed mix, scoring version, and scoring component weights
* `src/app/api/analytics/events/route.ts`: public analytics ingest endpoint
* `src/app/api/feed/route.ts`: recommended feed endpoint
* `src/app/api/account-test/analytics/route.ts`: authenticated dev/test diagnostics and manual score recomputation

### Account test surface

`/account-test` is a development and client-demo diagnostic page. Keep it useful but do not make it look like a separate product.

When adding diagnostics there:

* use the same layout conventions as account/catalog pages: `max-w-6xl`, border-bottom page header, cards, and restrained spacing
* use existing shadcn-style components or local theme tokens (`bg-card`, `text-foreground`, `text-muted-foreground`, `border-border`, `bg-muted`, `bg-primary`)
* avoid one-off gradients, hard-coded slate/amber palettes, and decorative debug styling
* keep routes authenticated with Clerk and disabled in production unless an explicit `*_TEST_ENABLED=true` flag is set
* expose raw JSON only as a secondary debugging aid after human-readable status, counts, and rankings

### Prisma and local migrations

Prisma commands should be run from the host for development migrations so generated migration files are written into the local workspace.

The dev Compose database is reachable as:

* from containers: `postgres:5432`
* from the host: `localhost:5432`

Prefer the Makefile targets:

* `make prisma-migrate NAME=<migration_name>`
* `make prisma-studio`
* `make prisma-generate`

Use container Prisma commands only when there is a specific reason and file synchronization is understood.

## Delivery guidance for AI agents

Before coding:

* identify which roadmap phase the request belongs to
* verify whether the behavior touches payments, rights, KYC, ranking, or contracts
* consult the French business docs when the request affects user flow or rules

While coding:

* keep naming aligned with the marketplace domain
* avoid building placeholder business logic that conflicts with the docs
* preserve separation between simple web flows and future heavy processing services
* build user interfaces with shadcn/ui conventions and the existing reusable components in `src/components/ui` before creating custom UI primitives
* keep UI styling aligned with the local component system, Tailwind tokens, and existing app patterns

When uncertain:

* document the assumption in your response
* prefer a safe V1-compatible implementation over speculative advanced behavior
