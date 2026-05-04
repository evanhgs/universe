# Universe

Marketplace musical pour publier, vendre, acheter et telecharger des beats. Le projet combine une
application Next.js, un worker Rust pour le traitement audio, une API FastAPI reservee aux services
IA futurs, Postgres comme source de verite metier, et un stockage S3-compatible pour les assets.

## Architecture globale de l'application

Point cle : `nextjs` ne communique pas directement avec le worker Rust par HTTP. La liaison se fait
par la base Postgres et le stockage S3-compatible :

- Next.js cree les lignes metier, les assets et les jobs dans Postgres.
- Next.js donne au navigateur des URLs S3 presignees pour uploader ou lire les fichiers.
- Le worker Rust surveille Postgres, prend les jobs `PENDING`, lit/ecrit dans S3, puis met a jour
  Postgres.
- Le navigateur repasse par Next.js pour savoir si la preview est prete.

### Schema Mermaid principal

```mermaid
flowchart TB
  Browser["Navigateur utilisateur\nReact UI / pages Next.js"]
  Seller["Vendeur\nupload + publication"]
  Buyer["Acheteur\ncatalogue + achat + download"]

  subgraph NextApp["Service nextjs :3000"]
    Proxy["proxy.ts\nClerk middleware\nAuth + CSP"]
    Pages["Pages App Router\nSSR / CSR"]
    ApiBeats["API Beats\n/api/beats\n/api/beats/:slug\n/api/beats/:slug/preview"]
    ApiStorage["API Storage\n/api/storage/uploads/presign"]
    ApiMarketplace["API Marketplace\norders / checkout / purchases / sales / downloads"]
    Webhooks["Webhooks\n/api/webhooks/clerk\n/api/webhooks/stripe"]
    Services["Services serveur\nbeat.service\nmarketplace.service\naccount.service"]
    StorageSigner["S3 signer\nserver/storage/s3.ts\nURLs SigV4 GET / PUT"]
    Prisma["Prisma client\nsrc/lib/prisma.ts"]
  end

  subgraph RustWorker["Service audio-worker Rust"]
    Poller["Boucle de polling\nclaim AudioProcessingJob"]
    Ffprobe["ffprobe\nlit duree source"]
    Ffmpeg["ffmpeg\ngenere preview MP3"]
    Curl["curl\nGET source / PUT preview"]
  end

  subgraph AiServices["Service ai-services FastAPI :8000"]
    AiRoot["GET /"]
    AiHealth["GET /health"]
    AiVersion["GET /version"]
  end

  Postgres[("Postgres :5432\nPrisma schema\nUsers / Beats / Assets / Jobs / Orders")]
  S3[("Stockage S3-compatible\nRustFS / MinIO / R2 / S3\nbucket beats")]
  Clerk["Clerk\nAuth externe\nsessions + webhooks user"]
  Stripe["Stripe\nCheckout + webhooks paiement"]

  Seller --> Browser
  Buyer --> Browser

  Browser -->|"HTTP pages + API"| Proxy
  Proxy --> Pages
  Proxy --> ApiBeats
  Proxy --> ApiStorage
  Proxy --> ApiMarketplace

  Pages --> Services
  ApiBeats --> Services
  ApiStorage --> StorageSigner
  ApiMarketplace --> Services
  Webhooks --> Services

  Services --> Prisma
  Prisma -->|"SQL"| Postgres

  Services --> StorageSigner
  StorageSigner -->|"presigned GET / PUT"| Browser
  Browser -->|"PUT fichiers audio/images\navec URL presignee"| S3
  Browser -->|"GET previews/images/downloads\navec URL presignee"| S3

  Poller -->|"SELECT ... FOR UPDATE SKIP LOCKED\nAudioProcessingJob PENDING"| Postgres
  Poller -->|"UPDATE job PROCESSING / READY / FAILED"| Postgres
  Poller -->|"lit MediaAsset source/output"| Postgres
  Poller --> Curl
  Curl -->|"GET audio source prive"| S3
  Curl -->|"PUT preview audio/mpeg"| S3
  Poller --> Ffprobe
  Poller --> Ffmpeg

  Browser -->|"auth session"| Clerk
  Clerk -->|"webhook user.created/user.updated/user.deleted"| Webhooks

  ApiMarketplace -->|"create/retrieve Checkout Session"| Stripe
  Stripe -->|"webhook checkout.session.*"| Webhooks

  Browser -.->|"CSP autorise AI_SERVICES_URL"| AiServices
  Services -.->|"pas d'appel metier actuel trouve dans le code"| AiServices
```

### Flux 1 : upload vendeur et creation d'un beat

```mermaid
sequenceDiagram
  autonumber
  actor Seller as Vendeur
  participant Browser as Navigateur
  participant Next as Next.js
  participant Clerk as Clerk
  participant DB as Postgres
  participant S3 as S3-compatible

  Seller->>Browser: Selectionne audio source, archives licence, image
  Browser->>Next: POST /api/storage/uploads/presign\nkind + filename + mimeType + sizeBytes
  Next->>Clerk: Verifie session + role SELLER
  Next->>Next: Cree objectKey non previsible
  Next-->>Browser: URL presignee PUT + metadata asset
  Browser->>S3: PUT fichier avec Content-Type signe
  S3-->>Browser: Upload OK

  Browser->>Next: POST /api/beats\nmetadata beat + assets uploades + offres licence
  Next->>Clerk: Verifie vendeur
  Next->>DB: Transaction create Beat
  Next->>DB: Create MediaAsset source/licence/image
  Next->>DB: Create MediaAsset preview PENDING public
  Next->>DB: Create BeatAssetLink
  Next->>DB: Create AudioProcessingJob PENDING\nsourceAssetId -> outputAssetId
  Next-->>Browser: Beat cree, preview pas encore prete
```

### Flux 2 : generation automatique de preview par Rust

```mermaid
sequenceDiagram
  autonumber
  participant Worker as audio-worker Rust
  participant DB as Postgres
  participant S3 as S3-compatible
  participant Probe as ffprobe
  participant Encode as ffmpeg

  loop Toutes les AUDIO_WORKER_POLL_INTERVAL_MS
    Worker->>DB: Cherche job PREVIEW_GENERATION PENDING\nattempts < maxAttempts
    DB-->>Worker: AudioProcessingJob + payloadJson
  end

  Worker->>DB: UPDATE job PROCESSING\nattempts + 1, lockedBy, lockedAt
  Worker->>DB: SELECT MediaAsset source + output
  Worker->>S3: GET source audio prive\nURL SigV4 generee par Rust
  S3-->>Worker: Fichier source temporaire
  Worker->>Probe: ffprobe duration
  Probe-->>Worker: durationSec
  Worker->>Worker: Calcule previewDurationSec\nlong/short policy
  Worker->>Encode: ffmpeg -> MP3 96kbps\n-t previewSec + fade in/out
  Encode-->>Worker: preview.mp3 temporaire
  Worker->>S3: PUT preview MP3\nContent-Type audio/mpeg
  S3-->>Worker: Upload OK
  Worker->>DB: Transaction READY\nMediaAsset output READY\nBeat duration/status\nJob READY
```

### Flux 3 : lecture publique d'une preview

```mermaid
sequenceDiagram
  autonumber
  actor Visitor as Visiteur
  participant Browser as Navigateur
  participant Next as Next.js
  participant DB as Postgres
  participant S3Signer as S3 signer Next.js
  participant S3 as S3-compatible

  Visitor->>Browser: Ouvre /beats/:slug
  Browser->>Next: GET page ou GET /api/beats/:slug
  Next->>DB: Charge Beat visible + assets READY publics
  Next->>S3Signer: Genere URL GET presignee pour image/preview
  Next-->>Browser: Payload beat + URLs temporaires
  Browser->>S3: GET image / preview MP3
  S3-->>Browser: Flux media

  alt Preview pas encore prete au premier rendu
    Browser->>Next: Poll GET /api/beats/:slug/preview
    Next->>DB: Cherche AUDIO_PREVIEW READY generee par worker
    Next-->>Browser: 404 tant que la preview manque
    Browser->>Next: Poll suivant
    Next-->>Browser: URL preview quand READY
    Browser->>S3: GET preview MP3
  end
```

### Flux 4 : achat Stripe et telechargement protege

```mermaid
sequenceDiagram
  autonumber
  actor Buyer as Acheteur
  participant Browser as Navigateur
  participant Next as Next.js
  participant Clerk as Clerk
  participant DB as Postgres
  participant Stripe as Stripe
  participant S3 as S3-compatible

  Buyer->>Browser: Clique acheter
  Browser->>Next: POST /api/marketplace/orders\nbeatSlug ou licenseOfferingId
  Next->>Clerk: Verifie session acheteur
  Next->>DB: Cree Order + OrderItem\nstatus PENDING_PAYMENT
  Next-->>Browser: Order locale

  Browser->>Next: POST /api/marketplace/orders/:id/checkout/stripe
  Next->>DB: Cree Payment PENDING
  Next->>Stripe: Cree Checkout Session\nmetadata orderId/paymentId/buyerId
  Stripe-->>Next: checkoutUrl
  Next->>DB: Attache providerSessionId au paiement
  Next-->>Browser: checkoutUrl
  Browser->>Stripe: Redirection checkout

  Stripe->>Next: POST /api/webhooks/stripe\ncheckout.session.completed
  Next->>Stripe: Verifie signature + recupere session
  Next->>DB: Marque Order PAID\nPayment PAID\ncree Entitlement

  Buyer->>Browser: Va dans mes achats
  Browser->>Next: GET /api/marketplace/downloads/:entitlementId
  Next->>Clerk: Verifie acheteur
  Next->>DB: Verifie Entitlement\nexpiration + limite download
  Next->>DB: Selectionne asset telechargeable\narchive licence ou source
  Next->>S3: Genere URL GET protegee
  Next->>DB: Incremente downloadCount
  Next-->>Browser: URL temporaire de download
  Browser->>S3: GET fichier protege
```

### Relations de donnees principales

```mermaid
erDiagram
  User ||--o{ Beat : owns
  User ||--o{ MediaAsset : owns
  Beat ||--o{ BeatAssetLink : has
  MediaAsset ||--o{ BeatAssetLink : linked_by
  Beat ||--o{ AudioProcessingJob : queues
  MediaAsset ||--o{ AudioProcessingJob : source_asset
  MediaAsset ||--o{ AudioProcessingJob : output_asset
  Beat ||--o{ BeatLicenseOffering : sells
  LicenseTemplate ||--o{ BeatLicenseOffering : defines
  Order ||--o{ OrderItem : contains
  Order ||--o{ Payment : paid_by
  Order ||--o{ Entitlement : grants
  BeatLicenseOffering ||--o{ OrderItem : purchased_as
  BeatLicenseOffering ||--o{ Entitlement : unlocks
```

### Lecture rapide des liaisons

| Liaison | Type | Role |
| --- | --- | --- |
| Navigateur -> Next.js | HTTP pages/API | UI, catalogue, publication, achat, compte |
| Next.js -> Clerk | SDK serveur + webhooks | Authentification, roles, synchro comptes |
| Next.js -> Postgres | Prisma | Source de verite metier |
| Next.js -> S3 | Signature seulement | Genere des URLs temporaires GET/PUT |
| Navigateur -> S3 | HTTP direct | Upload fichiers et lecture media sans proxy Next.js |
| Next.js -> audio-worker | Indirect via Postgres | Creation de jobs `AudioProcessingJob` |
| audio-worker -> Postgres | SQLx | Claim jobs, lit assets, met a jour status |
| audio-worker -> S3 | URLs SigV4 + curl | Telecharge source, upload preview |
| audio-worker -> ffprobe/ffmpeg | Process local | Analyse et encode l'audio |
| Next.js -> Stripe | SDK serveur | Checkout, verification paiement |
| Stripe -> Next.js | Webhook | Fulfillment commandes et paiements |
| Next.js / navigateur -> ai-services | Prevu / expose | Service FastAPI disponible, pas encore de flux metier detecte |

## Repertoires principaux

| Dossier | Role |
| --- | --- |
| `app` | Application Next.js, UI, API routes, Prisma, logique marketplace |
| `audio-worker` | Worker Rust de generation de previews audio |
| `ai-services` | Service FastAPI pour endpoints IA/scoring futurs |
| `infra` | Docker Compose, environnements et documentation infra |
| `docs` | Documentation produit et metier |
