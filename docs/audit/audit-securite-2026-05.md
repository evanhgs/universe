# Rapport d'audit de sécurité, qualité et performance — Universe

**Projet :** Universe — Marketplace musical (vente de beats)
**Stack :** Next.js 16 + Prisma/Postgres + Clerk + Stripe + S3 + worker Rust + FastAPI + Postmarker
**Date :** 2026-05-07

---

## 1. Résumé exécutif

L'analyse couvre **5 domaines** : application Next.js, worker Rust, service FastAPI, infrastructure Docker/CI, modèle de données.

**Bilan :**
- **Architecture saine** — séparation claire des responsabilités, communication via Postgres + S3, pas de couplage fort, bonnes intentions sécurité (Clerk, presigned URLs, headers, secrets en variables, conteneurs non-root).
- **Plusieurs failles critiques** — principalement liées aux paiements Stripe, à l'auth du service IA, à la gestion d'idempotence et aux protections DoS du worker Rust.
- **Beaucoup d'optimisations possibles** — N+1 queries, polling fixe, absence de cache HTTP, pagination manquante.

**Priorité absolue (à corriger avant prod paiements réels) :**
1. Idempotence du webhook Stripe
2. Open redirect via `successUrl`/`cancelUrl`
3. Auth + CORS sur ai-services
4. Cleanup tempfiles + protection DoS du worker Rust
5. Rate limiting sur les routes sensibles

---

## 2. Failles de sécurité

### 2.1 Application Next.js (`app/`)

#### CRITIQUES

| # | Faille | Fichier:Ligne | Impact | Recommandation |
|---|--------|---------------|--------|----------------|
| C1 | **Webhook Stripe non-idempotent** | `src/server/marketplace/marketplace.service.ts:454-479`, `marketplace.repository.ts:328-359` | Un retry Stripe (réseau, 5xx) recrée des entitlements/ledger entries → double crédit acheteur | Persister `event.id` Stripe avec contrainte `UNIQUE`, court-circuiter si déjà vu. Convertir création ledger en `upsert`. |
| C2 | **Open redirect via successUrl/cancelUrl** | `src/server/marketplace/marketplace.validation.ts:46-64`, `marketplace.service.ts:318-319` | Phishing post-paiement (redirige vers `attacker.com`) | Whitelist sur `new URL(successUrl).origin === process.env.APP_URL` |
| C3 | **Pas de rate limiting** | Toutes les routes `app/api/**` | Brute-force commandes, énumération slugs/entitlements, abus presign | Middleware `@upstash/ratelimit` ou in-memory par IP+userId sur endpoints sensibles |
| C4 | **Cron secret en Bearer simple** | `src/app/api/cron/email/chat-unread-reminders/route.ts:13-24` | Si secret leak (logs, repo), abus illimité | IP whitelist (Vercel cron) + HMAC timestamp |

#### HAUTES

| # | Faille | Fichier:Ligne | Impact | Recommandation |
|---|--------|---------------|--------|----------------|
| H1 | **IDOR potentiel sur entitlement download** | `src/server/marketplace/marketplace.service.ts:686-720` | Si filtre `buyerId` manqué dans repository → accès aux téléchargements d'autres acheteurs | Vérifier `entitlement.buyerId === account.id` explicitement après chargement |
| H2 | **MIME type spoofable au PUT S3** | `src/app/api/storage/uploads/presign/route.ts:152-160`, `src/server/storage/s3.ts` | Upload exécutables/scripts dans bucket malgré validation serveur | Bucket policy S3 forçant Content-Type signé, post-validation après upload |
| H3 | **Self-service SELLER role** | `src/app/api/account/me/roles/route.ts:40-73`, `account.validation.ts:148-182` | Tout user peut s'auto-promouvoir SELLER → vendre/encaisser sans KYC | Retirer SELLER de `SELF_SERVICE_ROLE_CODES`, exiger email verify + KYC |
| H4 | **Webhook Clerk sans freshness check** | `src/app/api/webhooks/clerk/route.ts:12-16` | Replay d'un événement ancien → écrase données user actuelles | Vérifier timestamp event > now - 5min après `verifyWebhook()` |

#### MOYENNES / BASSES

- **Presign download durée 15min** (`src/server/storage/s3.ts:31-32`) — réduire à 5min pour assets premium.
- **CSP partielle** (`src/proxy.ts:45-52`) — manque `script-src 'nonce'` strict.
- **JSON.parse sans wrapper** (routes `checkout/stripe`, `confirm`) — leak détails parse via error handler global.
- **Slug beat prédictible** — vérifier que `visibility=DRAFT` n'est pas accessible par énumération sans owner check.

### 2.2 Worker Rust (`audio-worker/`)

#### CRITIQUES

| # | Faille | Fichier:Ligne | Impact | Recommandation |
|---|--------|---------------|--------|----------------|
| C5 | **Pas de limite taille téléchargement** | `audio-worker/src/main.rs:331-366` | DoS : un asset 100GB bloque le worker, sature disque | `curl --max-filesize 5000M`, vérifier `Content-Length` avant fetch |
| C6 | **Fuite tempfiles si erreur** | `audio-worker/src/main.rs:282-329` | Cleanup uniquement après succès → fuite disque sur chaque erreur, blocage worker | Wrapper `Drop` ou `tempfile::NamedTempFile` (RAII) |
| C7 | **Jobs gelés en PROCESSING si crash** | `audio-worker/src/main.rs:150-156` | Panic entre `claim_job` et `mark_job_failed` → job lock définitif | Timeout `lockedAt` (5 min) qui relibère via `UPDATE … WHERE lockedAt < NOW() - interval '5min'` |

#### HAUTES / MOYENNES

| # | Faille | Fichier:Ligne | Impact | Recommandation |
|---|--------|---------------|--------|----------------|
| H5 | **Validation laxiste de `job.id` dans paths** | `audio-worker/src/main.rs:608-646` | Caractères spéciaux dans `job.id` peuvent altérer noms tempfiles | Regex strict `^[a-zA-Z0-9_-]+$` avant utilisation en path |
| H6 | **Pas de validation Content-Type fichier source** | `audio-worker/src/main.rs:331-366` | PDF/image piégée passée à ffprobe → crash ou exploit FFmpeg | `curl -H "Accept: audio/*"` + check header response |
| M1 | **Logs potentiellement leaky (object_key, endpoint)** | `audio-worker/src/main.rs:187-191, 333-338` | Information disclosure | Hash/redact object keys, masquer URLs signées |
| M2 | **Pas de graceful shutdown SIGTERM** | `audio-worker/src/main.rs:114-164` | Job en cours interrompu, reste en PROCESSING | `tokio::signal::ctrl_c()` + finir job courant |

### 2.3 Infrastructure & CI/CD

| # | Faille | Fichier:Ligne | Impact | Recommandation |
|---|--------|---------------|--------|----------------|
| C10 | **Secrets dev en clair dans le repo** | `infra/env/stack.dev.env:6-8` | Leak Clerk/Stripe keys sur git push | Committer `.example`, ajouter `.env*` dans `.gitignore`, rotation keys |
| H8 | **Caddy : HSTS / X-Frame / nosniff manquants** | `infra/proxy/Caddyfile.runtime:1-13` | Clickjacking, MIME sniffing, downgrade attacks | Bloc `header { Strict-Transport-Security … X-Frame-Options DENY X-Content-Type-Options nosniff }` |
| H9 | **Caddy AI-prod : pas de CORS** | `infra/proxy/Caddyfile.ai-prod:7` | Browser bypass possible | Restreindre `Access-Control-Allow-Origin` |
| H10 | **Postgres dev exposé sur 0.0.0.0** | `infra/compose.dev.yml:8-9` | Accessible réseau local développeur | Bind sur `127.0.0.1:5432` |
| H11 | **GitHub Actions tierces non pinnées par SHA** | `.github/workflows/staging-ci-cd.yml:99,108,282` | Supply chain attack si action compromise | Pinner `astral-sh/setup-uv@<sha>`, `appleboy/ssh-action@<sha>` |
| C11 | **`make prod-down` sans confirmation** | `Makefile:117-119` | Coupure prod accidentelle | `@read -p "Type 'yes-i-am-sure': " && [ "$$REPLY" = "yes-i-am-sure" ]` |

### 2.4 Modèle de données (Prisma)

| # | Problème | Fichier:Ligne | Impact | Recommandation |
|---|----------|---------------|--------|----------------|
| H12 | **Soft delete `User.deletedAt` incohérent** | `app/prisma/schema.prisma:216-232` | Cascade `onDelete` partout → soft delete contourné | Choisir une stratégie (soft OU hard) et l'appliquer uniformément |
| M3 | **Index manquants sur FK fréquemment filtrées** | Lignes 281, 293, 320 | Full table scan sur queries dashboard | `@@index([userId])`, `@@index([ownerId])` |
| M4 | **Pas d'audit trail** | Schema entier | Compliance/debugging difficile sur mutations sensibles | Table `AuditLog` + champs `createdBy`/`updatedBy` |
| M5 | **PII potentiel en `metadataJson`** | Lignes 316, 405, 514, 541, 566, 589 | Stockage non chiffré PII si développeurs y mettent | Convention claire + lint pour interdire IP/cards |

---

## 3. Bugs identifiés

| # | Bug | Fichier:Ligne | Description |
|---|-----|---------------|-------------|
| B1 | **Compteur de ventes vendeur non atomique** | `src/server/marketplace/marketplace.repository.ts:448-463` | `saleCount` mis à jour hors transaction via count → race condition entre webhooks parallèles |
| B2 | **Email confirmation hors transaction** | webhook Stripe + `emailService.sendOrderConfirmedEmails()` | Si email fail, order marquée payée sans notification → pattern saga manquant |
| B3 | **`as never` / `as T` masquent des erreurs runtime** | `src/app/api/webhooks/clerk/route.ts`, `beat-purchase-panel.tsx` | Validation Zod manquante, erreurs silencieuses |
| B4 | **Erreurs Stripe brutes renvoyées** | `src/app/api/webhooks/stripe/route.ts:19-26` | `error.message` peut leaker détails internes Stripe |
| B5 | **Reprise idempotence non documentée (worker)** | `audio-worker/src/main.rs:150-156` | Si crash après upload preview avant `mark_job_ready` → reprise re-télécharge et écrase ; pas explicitement testé |
| B6 | **Beat bloqué en attente de preview, pas de fallback côté UX** | flux upload beat → `AudioProcessingJob` → publication | Si le worker Rust échoue (panic, OOM, ffmpeg KO, S3 down), le beat reste invisible pour l'acheteur indéfiniment. Aucun mécanisme de récupération côté UI : le vendeur n'a pas de bouton « relancer le job » ni « uploader la preview manuellement ». La publication est couplée à la réussite asynchrone du worker, ce qui crée un point de défaillance unique. |

### Bug B6 — détail et plan de correction

**Symptôme actuel**

1. Vendeur upload son audio source → Next.js crée `Beat`, `MediaAsset`, `AudioProcessingJob PENDING`
2. Worker Rust tente l'encodage 30s → échec (FFmpeg, S3, OOM, panic) → job reste `PENDING` ou bascule `FAILED` après `maxAttempts`
3. **Le beat n'est jamais publié** parce que la condition de publication dépend de `MediaAsset AUDIO_PREVIEW.status = READY`
4. Le vendeur n'a **aucune visibilité** ni **aucun moyen de débloquer** la situation

**Correction recommandée — 3 volets**

| Volet | Action | Fichier(s) impactés |
|---|---|---|
| 1. Découpler publication ⇄ preview | Permettre la publication d'un beat même sans preview READY (afficher état `PREVIEW_PENDING` sur la fiche vendeur, désactiver lecture côté acheteur mais garder le beat en file d'attente preview ; politique métier à fixer : afficher au catalogue dès création, ou cacher tant que preview manquante) | `app/src/server/beats/beat.service.ts`, `app/src/app/beats/[slug]/page.tsx`, `app/prisma/schema.prisma` (rendre statut beat indépendant du statut preview) |
| 2. Fiabiliser la file de jobs | Garder le job en file (pas de suppression sur échec), exposer un endpoint `POST /api/beats/:slug/preview/retry` qui : (a) vérifie ownership, (b) accepte si statut `FAILED` ou `PENDING` depuis > seuil, (c) reset `attempts=0`, `status=PENDING`, `lockedBy=null`, `lockedAt=null`. Permet de relancer après redémarrage du worker Rust | `app/src/app/api/beats/[slug]/preview/retry/route.ts` (nouveau), nouveau `app/src/server/audio/audio.repository.ts` ou extension de `marketplace.repository.ts` |
| 3. UX vendeur | Sur la page d'édition du beat, afficher l'état du job preview. Si `FAILED` ou `PENDING > 5min` : 2 boutons → **« Relancer la génération »** (appelle l'endpoint retry) et **« Uploader une preview manuelle »** (presign PUT pour `AUDIO_PREVIEW`, marque READY directement, court-circuite le worker, marque le job en `CANCELLED` ou `MANUAL_OVERRIDE`) | `app/src/app/dashboard/beats/[id]/edit/...` (composant client), `app/src/app/api/storage/uploads/presign/route.ts` (étendre `kind` accepté pour preview manuelle) |

**Bénéfices**

- Plus de beats fantômes bloqués indéfiniment
- Vendeur autonome en cas d'incident worker
- Dégrade gracieusement (publication possible sans preview, ou en attente)
- Permet maintenance / redéploiement du worker Rust sans bloquer la création de beats

**Effort estimé :** 2-3 jours dev (backend + UI + migration éventuelle du statut beat).

**Lien avec autres findings :** B6 est aggravé par C6 (fuite tempfiles), C7 (jobs gelés en PROCESSING) et M2 (pas de graceful shutdown). Corriger ces 3 failles réduit la fréquence des B6, mais le mécanisme retry + manual upload reste indispensable pour les cas résiduels (FFmpeg crash sur fichier exotique, S3 indisponible, etc.).

---

## 4. Performance & optimisations

### 4.1 Top 10 optimisations recommandées

| # | Optimisation | Localisation | Impact estimé | Effort |
|---|--------------|--------------|---------------|--------|
| O1 | Pagination cursor sur listings (`listBuyerOrders`, `listSellerOrderItems`) | `marketplace.repository.ts:499-548` | Latence dashboard −50/80% sur gros vendeurs | 1j |
| O2 | Batcher presigned URLs S3 ou cache 5 min | `beat.service.ts:99-107` | Latence beat detail −300ms, charge S3 −10× | 1j |
| O3 | `export const revalidate = 60` sur routes beat publiques | `app/api/beats/[slug]/route.ts` | Hits BD −90% | 0.5j |
| O4 | Validation env vars Zod au boot | nouveau `src/lib/env.ts` | Fail-fast, évite erreurs silencieuses prod | 0.5j |
| O5 | Stripe : `upsert` ledger entries + `event.id` UNIQUE | `marketplace.repository.ts:328-359` | Élimine doublons replay | 1j |
| O6 | Compteur unread chat en `groupBy` au lieu de N+1 | `chat.service.ts:104-112` | Latence inbox −80% | 0.5j |
| O7 | Prisma Pool `max=20, min=5` + monitoring | `src/lib/prisma.ts:36-44` | Évite épuisement connexions sous charge | 0.5j |
| O8 | LISTEN/NOTIFY Postgres pour worker Rust | `audio-worker/src/main.rs:149-164` | Latence preview −95%, charge BD idle −99% | 2j |
| O9 | Worker Rust : 2-3 jobs concurrents (`tokio::spawn`) | `audio-worker/src/main.rs` | Throughput +30/50% | 1j |
| O10 | Logger structuré (Pino côté Next.js, `metrics` côté Rust) | global | Audit trail prod, MTTR debugging −70% | 2j |

### 4.2 Autres points performance

- **N+1 query** sur `listSellerOrderItems` chargeant `order.payments[0]` par item → `groupBy` ou `distinct`
- **`Promise.all` non plafonné** sur signature S3 multiple → risque d'épuisement connexions
- **Pas de cache Redis/in-memory** sur métadata beat (rarement modifiée)
- **Polling Rust 2s** = 432k queries/jour idle pour 10 workers
- **Bundle client** : 11 fichiers `"use client"` à profiler — certains pourraient devenir Server Components

---

## 5. Bons points observés

### Application Next.js
- Validation stricte des inputs côté serveur (schemas dédiés)
- Auth déléguée à Clerk (pas de JWT maison)
- Headers de sécurité dans `next.config.ts` (CSP, HSTS, X-Frame-Options, Referrer-Policy)
- Stripe : vérification montant exact via `fulfillStripeCheckoutSession()`
- Entitlement avec `downloadLimit` et `downloadCount`
- Slug regex `BEAT_SLUG_PATTERN` validé

### Worker Rust
- `SELECT FOR UPDATE SKIP LOCKED` correctement utilisé
- Logs structurés avec `tracing`
- SigV4 implémenté avec `hmac` crate
- `attempts < maxAttempts` avec backoff (à confirmer)

### Infrastructure
- Compose prod : conteneurs non-root, `read_only: true`, tmpfs avec flags safe
- Réseaux Docker isolés (internal/edge)
- Healthchecks définis sur tous services
- Secrets via Docker secrets (prod)
- Compose validé en CI (`docker compose config --quiet`)
- Permissions GitHub Actions restreintes (`contents: read`)
- Décimal (pas Float) pour les prix dans Prisma

---

## 6. Plan de remédiation suggéré

### Sprint 1 — Bloquants prod paiements (5-7 jours)
1. Idempotence webhook Stripe (C1) + `event.id` UNIQUE
2. Whitelist origin sur successUrl/cancelUrl (C2)
3. Auth + CORS sur ai-services (C8, C9)
4. Cleanup tempfiles worker Rust (C6) + max-filesize (C5)
5. Confirmation `make prod-down` (C11)
6. Retrait secrets dev du repo (C10) + rotation
7. **Découplage publication beat ⇄ preview + endpoint retry + UX upload manuel (B6)** — débloque les vendeurs en cas d'échec worker

### Sprint 2 — Sécurité renforcée (5 jours)
7. Rate limiting global (C3)
8. Cron secret HMAC + IP whitelist (C4)
9. SELLER hors self-service (H3)
10. Headers sécurité Caddy (H8, H9)
11. Pinning SHA actions GitHub (H11)
12. IDOR explicite check entitlement (H1)

### Sprint 3 — Robustesse worker + qualité (5-7 jours)
13. Timeout `lockedAt` jobs gelés (C7)
14. Validation `job.id` (H5) + Content-Type (H6)
15. Graceful shutdown SIGTERM (M2)
16. Test suite Vitest (marketplace, beats)
17. Logger structuré Pino (O10)
18. Validation env vars Zod (O4)

### Sprint 4 — Performance (5-7 jours)
19. Pagination listings (O1)
20. Cache HTTP `revalidate` (O3)
21. LISTEN/NOTIFY Rust (O8)
22. Concurrent jobs worker (O9)
23. Index Prisma manquants (M3)
24. Soft delete cohérent (H12)

---

## 7. Métriques d'audit

- **Failles critiques :** 11
- **Failles hautes :** 12
- **Failles moyennes/basses :** ~15
- **Bugs identifiés :** 6
- **Optimisations majeures :** 10
- **Effort total estimé :** 22-29 jours-développeur (1 dev senior)

---

## 8. Méthodologie

- 4 agents d'exploration en parallèle (Next.js sécurité, Next.js qualité, Rust, infra+Prisma)
- Lecture ciblée des fichiers critiques (auth, paiements, webhooks, signing, schéma)
- Pas de scan SAST automatisé exécuté ; complète avec `npm audit`, `cargo audit`, `pip-audit`, `trivy fs .` recommandé en CI
- **Aucun test d'intrusion actif** ; les failles listées sont issues d'analyse statique du code

---

## 9. Vérification post-fix recommandée

- `npm audit --production` + `cargo audit` + `pip-audit` en CI
- Test manuel des flows : achat Stripe (replay webhook), upload audio (MIME spoofing), download entitlement (autre user)
- Test charge sur worker (job 500 MB, 10 jobs parallèles, kill -9 mid-job)
- Scan headers : Mozilla Observatory sur prod
- Revue par CODEOWNERS dédiés (à créer : `.github/CODEOWNERS`)
