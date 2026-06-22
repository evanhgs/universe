# Revue de code — Application Next.js « Universe »

**Date :** 2026-06-22
**Périmètre :** `app/` (Next.js 16 / React 19 / Prisma 7 / Clerk / Stripe / Redis / S3)
**Méthode :** lecture directe des fichiers sensibles + 4 agents de revue parallèles (frontend, backend/DB, tests, tooling/types) + vérification ligne par ligne des affirmations de l'autocritique de Codex.
**Verdict global :** Architecture et outillage **au-dessus de la moyenne** ; logique métier (paiement / droits / argent) **dangereuse**. Le code a l'air sérieux — c'est précisément ce qui le rend risqué, parce qu'on lui fait confiance.

> Échelle de sévérité : **P0** = crash prod ou perte d'argent · **P1** = bug réel à impact utilisateur · **P2** = qualité / robustesse / dette.

---

## 1. Résumé exécutif

Ce dépôt a déjà subi un audit sécurité (`docs/audit/audit-securite-2026-05.md`) qui a corrigé l'idempotence webhook, le rate-limiting, l'open-redirect Stripe et l'ABAC. Les fautes « faciles » sont donc traitées. Mais sous le vernis propre subsistent **quatre bombes P0** qu'aucun des audits précédents (ni l'autocritique de Codex) n'avait identifiées, plus une faille que l'audit de mai avait pourtant explicitement demandé de corriger et qui n'a jamais été appliquée.

**Les 5 corrections vitales, dans l'ordre :**

1. **Singleton Prisma inversé** — une connexion DB neuve par requête en prod → crash garanti. *(1 ligne)*
2. **Auto-promotion SELLER sans KYC** — signalée par l'audit de mai (H3), jamais corrigée → fraude. *(1 ligne)*
3. **Webhook Stripe empoisonné** — un échec de fulfillment renvoie 200 sans livrer la commande payée.
4. **Argent calculé en virgule flottante** — commissions et répartitions IEEE-754.
5. **Trois races sur l'argent** — exclusivité, downloads, promotions.

---

## 2. P0 — Ça casse la prod ou ça perd de l'argent

### P0-1 — Singleton Prisma inversé : une connexion DB par appel en production
**`src/lib/prisma.ts:51-66`**

```ts
if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;   // caché UNIQUEMENT hors prod
}
return prisma;
```

Le cache n'est posé **qu'en dehors de la production**. En prod, `globalForPrisma.prisma` n'est jamais renseigné → chaque `getPrisma()` construit un `PrismaClient` **et** un `pg.Pool` neufs. Il y a **114 appels** `getPrisma()` inline, par requête.

- **Impact :** explosion du nombre de connexions Postgres sous charge (`too many connections`), la DB tombe. Invisible en dev (le cache global y est actif).
- **Ironie :** `src/lib/redis.ts` fait le singleton **correctement** (`let redis` au niveau module). Le pattern est connu, juste inversé sur le composant le plus critique.
- **Fix :**
  ```ts
  const client = globalForPrisma.prisma ?? new PrismaClient({ adapter: new PrismaPg(getPrismaPool()) });
  globalForPrisma.prisma = client; // le global ne sert qu'à survivre au HMR en dev
  return client;
  ```
  Le gate `NODE_ENV !== production` ne doit concerner que l'astuce HMR, jamais la mise en cache.

### P0-2 — Webhook Stripe : un échec empoisonne l'événement, la commande payée est perdue
**`src/app/api/webhooks/stripe/route.ts:19-27` · `marketplace.service.ts:741-767` · `marketplace.repository.ts:808-858`**

`recordWebhookEventStart` insère une ligne `WebhookEventLog` en `PROCESSING` **avant** traitement. Si le fulfillment échoue (timeout Stripe, blip DB, ou l'envoi d'email dans le même `try`), la ligne passe `FAILED` mais **reste en base**, l'erreur remonte → route renvoie **400** → Stripe retente → `recordWebhookEventStart` heurte la contrainte unique `(provider, eventId)` → `alreadyProcessed: true` → route renvoie **200 OK sans jamais livrer**.

- **Impact :** l'acheteur a payé, la commande reste `PENDING_PAYMENT`, aucun entitlement créé. Le commentaire du code (`marketplace.repository.ts:854`) admet « replay manuel requis ». Le design confond « vu » et « traité avec succès ».
- **Aggravant :** le chemin de confirmation client (`confirmStripeCheckoutSessionForOrder`) et le webhook appellent **tous deux** `fulfillStripeCheckoutSession` → partagent ce bug **et** peuvent entrer en double-fulfillment race.
- **Fix :** ne court-circuiter que sur `status === 'PROCESSED'`, pas sur l'existence de la ligne. En cas d'échec : supprimer la ligne (ou marquer rejouable) et renvoyer **500** pour un vrai retry Stripe. **Sortir l'envoi d'email du chemin critique.**

### P0-3 — Tout le calcul monétaire est en virgule flottante
**`marketplace.repository.ts:60-82, 325-340, 359-398, 695-698`**

Commission, remises et **répartition proportionnelle** des remises par ligne sont en `number` (IEEE-754), arrondies seulement à la fin (`Math.round(value*100)/100`). La répartition `roundMoney(discount * (lineSubtotal / subtotal))` arrondit chaque ligne indépendamment → **Σ(remises lignes) ≠ remise totale**, donc **Σ(totaux lignes) ≠ total commande**.

- **Impact :** à l'échelle, sur/sous-paiement des vendeurs de centimes par commande multi-vendeurs ; rapports de revenus qui ne tombent pas juste.
- **Fix :** tout en **entiers (centimes)** de bout en bout, conversion en `Decimal` uniquement à la persistance, allocation déterministe du reste d'arrondi sur la plus grosse ligne. Une seule source de vérité (`money.ts`), pas trois (`decimalToNumber` est réimplémenté 3× — voir P2).

### P0-4 — Auto-promotion SELLER sans KYC (signalée par l'audit de mai, jamais corrigée)
**`src/server/account/account.constants.ts:13`**

```ts
export const SELF_SERVICE_ROLE_CODES = ["BUYER", "SELLER"] as const;
```

L'audit de mai (H3) demandait explicitement de **retirer SELLER**. Toujours là. `PUT /api/account/me/roles` laisse tout utilisateur se déclarer vendeur, publier et encaisser — sans email vérifié, sans KYC.

- **Impact :** porte ouverte à la fraude / blanchiment sur une plateforme qui manipule de l'argent et vise KYC/Content-ID.
- **Fix :** `SELF_SERVICE_ROLE_CODES = ["BUYER"]`. Le passage SELLER exige email vérifié + démarrage KYC via endpoint dédié.

### P0-5 (design, signalé par Codex) — La home page est une humiliation publique
**`src/app/page.tsx`**

- `page.tsx:20` — un `<p>` imbriqué dans un `<h1>` (HTML invalide).
- `page.tsx:25` — copy truffé de fautes : « Grâce à universe faite plus de stream … commencer dès maintenant à faire vos premiers sous* » (astérisque sans note).
- `page.tsx:44` — **userId Clerk affiché en clair** sur la page publique.
- `page.tsx:32` — CTA principal « Tester le compte » pointant vers `/account-test` (page de diagnostic).
- **Fix :** vraie landing (proposition de valeur, CTA catalogue/publier, sections licences/paiement/previews) ; déplacer l'état Clerk hors prod ; `<h1>` unique + `<p>` séparé ; relecture FR pro.

---

## 3. P1 — Bugs réels à impact utilisateur

### P1-1 — Vente « exclusive » vendable deux fois (race check-then-act)
**`marketplace.repository.ts:973-1007` · `chat.repository.ts:288-340`**
Contrôle d'unicité = lecture puis insertion, **non transactionnelle**, **jamais re-vérifiée au paiement**. Deux acheteurs peuvent obtenir la même licence exclusive.
**Fix :** index unique partiel (un entitlement exclusif actif par `beatId`) + re-validation dans la transaction de fulfillment.

### P1-2 — Limite de téléchargement contournable (TOCTOU)
**`marketplace.service.ts:1040+` · `marketplace.repository.ts:1428`**
`downloadCount >= downloadLimit` vérifié puis `incrementEntitlementDownloadCount` dans un **second** appel non atomique. Concurrence → dépassement. (Le double-check `buyerId` IDOR est bien présent, mais pas l'atomicité.)
**Fix :** `updateMany({ where: { id, downloadCount: { lt: downloadLimit } }, data: { increment } })`, rejet si 0 ligne.

### P1-3 — Usage des promotions non transactionnel, limite non ré-appliquée
**`marketplace.service.ts:666-682` · `marketplace.repository.ts:1188-1251`**
`markPromotionUsed` = `increment` aveugle hors transaction ; `usageLimit` vérifié uniquement à la création de commande. Mort du process entre commit et increment → coupon réutilisable à l'infini.
**Fix :** increment dans la transaction de fulfillment, `updateMany({ where: { usageCount: { lt: usageLimit } } })`, rollback si 0.

### P1-4 — Résumé d'abonnement : appels Stripe + envoi d'emails sur un chemin de lecture, `catch {}` vide
**`subscription.service.ts:233-264`**
Afficher la page pricing peut déclencher un aller-retour Stripe synchrone, des écritures DB **et l'envoi d'emails transactionnels** (`sendSubscriptionStarted`), le tout avalé par un `catch` vide.
**Fix :** réconciliation par webhook/cron uniquement. Aucun effet de bord ni email sur un render.

### P1-5 — N+1 sur le compteur de messages non lus (endpoint le plus pollé)
**`chat.service.ts:174-185, 434-439`**
Badge « non lus » = `1 + N` `count()` par rafraîchissement + appels S3 par participant. 100 conversations = 100+ requêtes/poll.
**Fix :** un seul `groupBy` agrégé, ou compteur dénormalisé sur `ConversationParticipant`.

### P1-6 — `aggregateBeatStats` charge toute la table `AnalyticsEvent` en mémoire
**`analytics.service.ts:681-744`**
`findMany` sans `take` ni fenêtre temporelle, sur la table la plus volumineuse, puis reduce en JS. OOM/timeout dès que le trafic monte ; appelé par un cron qui échouera silencieusement. (Largement redondant : `BeatStats` est déjà maintenu en live.)
**Fix :** `groupBy` côté DB ; au minimum fenêtrer par `occurredAt`.

### P1-7 — `findMany` sans pagination partout
**`marketplace.repository.ts:879-927` · `chat.repository.ts:189-201` · `analytics.service.ts:682`**
Listes commandes/conversations sans `take`/curseur, `include` profonds, lancées en parallèle par le dashboard, filtrées/`.length` en JS. Nickel en dev, s'effondre avec un vrai vendeur.
**Fix :** pagination curseur + agrégats SQL (`_sum`/`_count`).

### P1-8 — Bug de polling du panneau preview (closure périmée)
**`src/app/beats/[slug]/preview-job-panel.tsx:64-72`**
`state?.status` dans les deps → l'intervalle se détruit/recrée à chaque tick ; le garde `READY` lit un `state` figé → ne voit jamais READY de façon fiable ; un job `FAILED` est pollé à l'infini.
**Fix :** retirer `state?.status` des deps, stopper l'intervalle sur état terminal via une ref.

### P1-9 — Catalogue : race de requêtes + bouton Retour cassé
**`beats-catalog-client.tsx:125-167`**
Aucun `AbortController` (le fetch lent gagne) ; `window.history.pushState` manuel désynchronisé de l'état React, sans handler `popstate`.
**Fix :** `AbortController` par requête ; filtres via `router.push` + `useSearchParams`.

### P1-10 — IP cliente issue de headers spoofables
**`rate-limit.ts:137-147` (utilisé par `cron-auth.ts:77`)**
`getClientIp` fait confiance à `x-forwarded-for` / `cf-connecting-ip` / `x-real-ip` bruts → bypass rate-limit, et l'allowlist IP des crons devient contournable (le HMAC sauve la mise — défense en profondeur). Le HMAC cron ne couvre pas le body.
**Fix :** ne dériver l'IP que d'un header posé par un proxy de confiance ; inclure le body dans la signature HMAC.

### P1-11 — Slug fallback `${base}-${Date.now()}` (collision concurrente)
**`beat.repository.ts:100`**
25 lectures `findUnique` puis fallback `Date.now()` — pas une stratégie d'unicité robuste, race concurrente possible.
**Fix :** contrainte unique DB + retry sur erreur `P2002`, fallback `base-${nanoid}`.

### P1-12 — Seed du feed `Math.random() || DEFAULT_FEED_SCORE_SEED`
**`analytics.service.ts:1191`**
Première page non-déterministe (le seed EST persisté dans le cursor ensuite, `analytics.service.ts:1222` — donc impact limité à la 1ʳᵉ page). Le `|| DEFAULT` est quasi mort (`Math.random()` truthy sauf 0 exact).
**Fix :** seed stable généré côté serveur par session/feed-request, renvoyé dans le cursor ; logguer scoring version + seed + quotas pour le debug.

### P1-13 — `beat-update-form.tsx` : fichier mort d'une ligne de TODO
**`src/app/beats/[slug]/beat-update-form.tsx:1`**
Le fichier est **un seul commentaire** TODO en français familier, **importé nulle part** (grep = 0). L'édition de beat n'existe pas — fichier qui ment sur une feature.
**Fix :** supprimer le fichier + créer un ticket, ou implémenter un composant réel.

---

## 4. P2 — Qualité, robustesse, dette

- **Fichiers-Dieu :** `marketplace.repository.ts` (1439), `account-test/page.tsx` (**1307 lignes, `"use client"`, en prod, part dans le bundle de tous les visiteurs**), `analytics.service.ts` (1278), `beat.repository.ts` (1116). Découper par agrégat ; `account-test` doit être un server component qui `notFound()` sans `*_TEST_ENABLED`.
- **`decimalToNumber` réimplémenté 3×** avec divergence sémantique (analytics renvoie `0` sur null, les autres `null`) — bug en embuscade. `marketplace.service.ts:77`, `marketplace.repository.ts:88`, `analytics.service.ts:250`.
- **Messages sans rafraîchissement live** (`messages-client.tsx:204-257`) : les messages entrants n'apparaissent qu'après re-sélection. Pour un chat, fonctionnalité manquante.
- **Header personnalisé fetché côté client** (`auth-buttons.tsx:73-102`) → flash « Profil » + waterfall réseau. À résoudre en server component.
- **Poll des non-lus 30s sans gating visibilité** (`auth-buttons.tsx:104-142`) : tourne en onglet caché. Pause sur `document.hidden`.
- **`<img>` brut sur le feed perf-critique** (`feed-client.tsx:719`, `beats-catalog-client.tsx:272`) eslint désactivé → CLS, images surdimensionnées. `next/image` + `sizes`.
- **Erreurs internes fuitées au client** (`webhooks/stripe/route.ts:23`, `marketplace.http.ts:48-51`) : `error.message` brut renvoyé ; `account_not_found` non mappé → 400 au lieu de 401/404. Mapper vers codes safe + log serveur.
- **Navigation globale pauvre** : pas de lien catalogue/feed/publier/messages/dashboard. Ajouter une nav principale + menu utilisateur connecté + variante mobile.
- **Tracking analytics localStorage sans consentement visible** (`feed-client.tsx`, `SESSION_STORAGE_KEY`) : réflexion RGPD/opt-out requise ; centraliser un `analyticsClient` ; `crypto.randomUUID()` plutôt que `Math.random()`.
- **Logique d'upload dans le composant client** (`beat-uploader.tsx`, 955 lignes) : extraire `src/lib/client/upload.ts` + hook `useBeatUpload` ; protéger `JSON.parse` ; cleanup des assets orphelins si la création échoue après upload.
- **Pas de validation structurée** (Zod/Valibot) ; parsing maison avec `unknown` ; erreurs `Error` génériques. Introduire des erreurs métier typées (`ValidationError`, `PaymentMismatchError`, `ForbiddenError`…).
- **CSP éparpillée** (next.config.ts + Clerk `proxy.ts` + env) : centraliser/documenter ; ajouter `frame-ancestors 'none'` via CSP.
- **Middleware matcher très large** (`proxy.ts:67`) : mesurer l'overhead sur assets/404 ; exclure les webhooks des middlewares inutiles.

### Tooling & types (compléments)
- **`prisma.config.ts:12` — `DATABASE_URL ?? ""`** : fallback chaîne vide → échec driver opaque au lieu d'un clair « DATABASE_URL manquant ». Ne défaulter que pour `generate`.
- **Pas de schéma d'env validé** : 31 variables `process.env.*` brutes sur 45 sites (dont `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `CLERK_WEBHOOK_SIGNING_SECRET`, `RESEND_API_KEY`, `S3_SECRET_ACCESS_KEY`). **Aucun secret avec fallback en dur** (bon point). → module `env.ts` validé par zod importé au boot.
- **`noUncheckedIndexedAccess` OFF** (`tsconfig.json`) : `strict: true` ne couvre pas `arr[i]`. Le flag le plus rentable manquant.
- **`analytics.service.ts:1215` — le SEUL `!` non-null du repo** : `candidates.find(...)!` → crash runtime si l'invariant casse. Garde explicite + `continue`.
- **`@types/ioredis@^4` inutile/faux** (`ioredis@5` embarque ses types) → retirer.
- **`overrides` épingle `hono`/`@hono/node-server`** alors que `hono` n'est importé nulle part dans `src` (copier-collé d'un autre service) → documenter ou supprimer.

---

## 5. Couverture de tests — honnête là où elle existe, aveugle là où l'argent passe

139 tests verts, pas de `.only`/`.skip`, pas de bruit. Les tests `permissions`, `rate-limit`, `subscription.service`, `marketplace.repository` sont **réellement comportementaux** (math de commission, deny-avant-allow, fail-closed). Bien.

**Mais la confiance s'effondre exactement là où est l'argent :**
- **Webhook Stripe : 0 test** (`src/app/api/webhooks/stripe/route.ts`). Signature, `payment_status`, réconciliation montant/devise, idempotence/replay — rien (`marketplace.service.test.ts:43` mocke `markOrderPaidFromStripe`, `:83` force `alreadyProcessed: false`).
- **Chemin de fulfillment monétaire non testé** : les gardes `stripe_session_not_paid`, `stripe_amount_mismatch` (`marketplace.service.ts:644-680`) ne sont jamais exercés.
- **Règle « 3 premières publications boostées » non testée** (`analytics.service.ts:956`) — un off-by-one `<= 3` passe en vert.
- **Éligibilité commission réduite (9%)** : `findSellerCommissionRateBp` avec abonnement expiré → fallback 30% non couvert.
- **Aucun test d'intégration DB** : tout mocké à la couche repository ; les tests vérifient les arguments passés au mock Prisma, pas que la contrainte unique « un abonnement par user » existe vraiment.
- **Pas de tests de concurrence/idempotence** (double webhook, double confirmation, races promo/exclusivité), ni de sécurité horizontale (A accède ressource de B), ni E2E (Playwright).

**À ajouter en priorité :** test route webhook (400 sur signature invalide, 200 + fulfillment sinon), chemin de fulfillment avec montant mismatché, le boost, et une suite d'intégration Prisma fine (testcontainers).

---

## 6. Ce qui est bien (parce que sévère ≠ malhonnête)

ABAC déclaratif propre (deny prioritaire) ; cron HMAC + timestamp anti-rejeu ; rate-limit fail-closed en prod ; CSP strict via Clerk + headers complets (HSTS, X-Frame DENY, COOP/CORP, nosniff, Permissions-Policy) ; open-redirect Stripe corrigé (allowlist fail-closed) ; **IDOR download protégé en défense en profondeur** ; confirmation Stripe client **bien gardée** (session retirée de Stripe et recoupée — voir §7) ; idempotence webhook *présente* (juste mal branchée) ; `strict: true`, **0 `any`/`@ts-ignore` sur 141 fichiers**, code généré gitignoré, pas de `ignoreBuildErrors`, `tsc` + `eslint` verts, **aucun secret avec fallback en dur**. Beaucoup d'humains ne livrent pas ça.

---

## 7. Notation de l'autocritique de Codex — **12/20**

Codex a produit une revue honnête et structurée, **juste sur tout ce qui se voit** (home, navigation, TODO, copywriting, RGPD, déterminisme feed, slug). Mais c'est une revue de **décorateur** : papier peint impeccablement analysé, fondations jamais ouvertes.

### Vérifié exact (✅)
- Home (`<p>` dans `<h1>`, fautes, userId en clair, CTA `/account-test`) — **confirmé** `page.tsx:20,25,32,44`.
- TODO `beat-update-form.tsx` — **pire que décrit** : fichier d'une ligne, importé nulle part.
- Slug `Date.now()` — **confirmé** `beat.repository.ts:100`.
- Seed feed `Math.random()` + observation du `|| DEFAULT` quasi mort — **juste et fin** `analytics.service.ts:1191`.
- Navigation pauvre, consentement tracking, surfaces hackathon, services-pieuvres, manque de Zod/erreurs typées — **valides**.

### Surévalué / mal vu (⚠️)
- **Confirmation Stripe non-authentifiée :** Codex « devient très nerveux » mais **n'a pas vérifié**. `fulfillStripeCheckoutSession` (`marketplace.service.ts:625-662`) **retire la session depuis Stripe** et recoupe `client_reference_id`/metadata, l'enregistrement `payment`, `payment_status === "paid"`, sous-total et devise. Un `orderId` seul ne donne aucun droit. **Ce chemin est bien gardé** — instinct sain, conclusion fausse. Le vrai danger de cette route est ailleurs : le **double-fulfillment** partagé avec le webhook (P0-2).
- **Seed feed :** le seed **est persisté dans le cursor** (`analytics.service.ts:1222`) — seule la 1ʳᵉ page est non-déterministe. Problème réel mais plus petit que présenté.

### Totalement raté (🔴) — et c'est ce qui tue le business
Codex a déclaré « architecture globalement saine », « TypeScript strict, indispensable », « lint + typecheck passent » et s'est auto-congratulé. Pendant ce temps il a manqué :
1. **Son propre singleton Prisma inversé** (P0-1) — crash prod.
2. **L'auto-promotion SELLER** (P0-4) — que son propre audit de mai avait demandé de retirer.
3. **L'argent en virgule flottante** (P0-3).
4. **Le webhook empoisonné** (P0-2) — il dit « l'idempotence existe » sans tester la branche d'échec.
5. **Les trois races sur l'argent** (P1-1/2/3) — il parle de « durcir les invariants DB » en généralité, sans nommer un seul trou.

### Le défaut de fond
La priorisation de Codex (P0 = userId home, fautes, TODO) confond une tache sur la cravate avec un infarctus. Son classement **n'a pas de catégorie « ça perd de l'argent / ça tombe en prod »** — parce qu'il n'a jamais trouvé ces bugs. Sa liste est juste ; elle est juste branchée sur les mauvais P0.

> **Synthèse :** Codex a fait une excellente revue de la vitrine et a déclaré la caisse enregistreuse « globalement saine » sans l'ouvrir.

---

## 8. Plan d'action priorisé (fusion des deux revues)

| Prio | Origine | Action |
|------|---------|--------|
| **P0-a** | cette revue | Singleton Prisma (`prisma.ts:61`) — 1 ligne, crash prod |
| **P0-b** | cette revue / audit mai H3 | Retirer SELLER de `SELF_SERVICE_ROLE_CODES` — 1 ligne, fraude |
| **P0-c** | cette revue | Webhook empoisonné + double-fulfillment client/webhook |
| **P0-d** | cette revue | Argent en entiers (centimes), source unique |
| **P0-e** | Codex | Home : HTML, fautes, userId, CTA `/account-test` |
| **P1** | les deux | 3 races argent · `/account-test` server-gated · N+1 · pagination · upload extrait · seed feed stable · preview poll · catalogue race/back |
| **P2** | Codex + tooling | Nav, design system, Playwright/E2E, state machines, copy, env schema, `noUncheckedIndexedAccess`, nettoyages deps |

### Découpage proposé (4 semaines)
- **S1 — Assainissement :** P0-a + P0-b (les deux fixes d'une ligne, immédiat) → home → `/account-test` server-gated + retrait du lien public → suppression `beat-update-form.tsx`.
- **S2 — Paiement & droits :** webhook source de vérité, idempotence rejouable, tests montant/devise/session, argent en centimes, fin du double-fulfillment, index uniques (exclusivité/promo/download).
- **S3 — Upload & catalogue :** refactor upload, validation serveur renforcée, cleanup assets orphelins, pagination, SEO pages beat/profil.
- **S4 — Feed & analytics :** consentement/opt-out, analyticsClient centralisé, seed stable + diagnostics scoring, tests feed, `groupBy` à la place du full-scan.

---

*Revue produite le 2026-06-22. Affirmations vérifiées ligne par ligne dans le code à la date du commit `5bb40c0`.*
