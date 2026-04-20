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

* frontend: Next.js + React + TypeScript + Tailwindcss
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

## Delivery guidance for AI agents

Before coding:

* identify which roadmap phase the request belongs to
* verify whether the behavior touches payments, rights, KYC, ranking, or contracts
* consult the French business docs when the request affects user flow or rules

While coding:

* keep naming aligned with the marketplace domain
* avoid building placeholder business logic that conflicts with the docs
* preserve separation between simple web flows and future heavy processing services

When uncertain:

* document the assumption in your response
* prefer a safe V1-compatible implementation over speculative advanced behavior
