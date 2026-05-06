# Universe Audio Worker

Worker Rust charge de generer les extraits audio MP3 des beats.

Le worker ne recoit pas de requete HTTP. Il tourne en boucle, lit une file de jobs dans Postgres,
recupere le fichier audio source dans un stockage S3-compatible, fabrique un preview avec
`ffprobe` et `ffmpeg`, l'upload dans S3, puis met a jour la base.

## Entree, objectif, sortie

### Entree

Le worker consomme des lignes Postgres dans la table `AudioProcessingJob`.

Il ne prend que les jobs qui respectent ce contrat :

- `type = PREVIEW_GENERATION`
- `status = PENDING`
- `attempts < maxAttempts`

Chaque job doit pointer vers :

- un `Beat` via `beatId`
- un asset source prive via `sourceAssetId`
- un asset de sortie public via `outputAssetId`

L'asset source et l'asset de sortie sont lus dans `MediaAsset`, avec au minimum :

- `bucket`
- `objectKey`

Le champ `payloadJson` peut contenir :

```json
{
  "publishWhenReady": true,
  "previewPolicy": {
    "longSourceThresholdSec": 60,
    "longPreviewSec": 30,
    "shortPreviewSec": 10,
    "bitrateKbps": 96,
    "fadeSec": 1
  }
}
```

Si `previewPolicy` est absent, le worker utilise ces valeurs par defaut :

- source longue a partir de `60` secondes
- preview long de `30` secondes
- preview court de `10` secondes
- MP3 a `96 kbps`
- fondu d'entree et de sortie de `1` seconde

### Objectif

Pour chaque job, le worker doit :

1. Verrouiller un job disponible pour eviter que deux workers traitent la meme ligne.
2. Passer le job en `PROCESSING` et incrementer `attempts`.
3. Telecharger l'audio source depuis S3 dans un dossier temporaire.
4. Lire la duree du fichier avec `ffprobe`.
5. Calculer la duree du preview :
   - source >= `longSourceThresholdSec` : `min(longPreviewSec, duree source)`
   - source plus courte : `min(shortPreviewSec, duree source)`
6. Generer un MP3 avec `ffmpeg` :
   - coupe a la duree calculee
   - ignore la video avec `-vn`
   - encode en `libmp3lame`
   - applique un fade in et un fade out
7. Uploader le preview vers l'asset de sortie dans S3.
8. Nettoyer les fichiers temporaires.

### Sortie

En cas de succes :

- le fichier MP3 est disponible dans S3 a l'emplacement de `outputAssetId`
- `MediaAsset(outputAssetId)` passe en `READY`
- son `mimeType` devient `audio/mpeg`
- son `extension` devient `mp3`
- son `sizeBytes` est renseigne
- son `metadataJson` contient notamment :
  - `durationSec`
  - `previewDurationSec`
  - `bitrateKbps`
  - `generatedBy`
- `Beat.durationSec` est mis a jour
- si `publishWhenReady = true` et que le beat est encore en `PROCESSING`, le beat passe en
  `PUBLISHED`
- le job passe en `READY`

En cas d'erreur :

- le job repasse en `PENDING` tant que `attempts < maxAttempts`
- le message d'erreur est stocke dans `AudioProcessingJob.errorMessage`
- quand `maxAttempts` est atteint :
  - le job passe en `FAILED`
  - `MediaAsset(outputAssetId)` passe en `FAILED`
  - si le beat etait en `PROCESSING`, il repasse en `DRAFT`

## Fonctionnement interne actuel

Le code principal est dans `src/main.rs`.

Les grandes zones a garder en tete pour une reecriture clean code :

- configuration : lecture des variables d'environnement
- database queue : selection et verrouillage du prochain job
- stockage : generation d'URL S3 presignees puis `curl`
- audio : appels a `ffprobe` et `ffmpeg`
- finalisation : mise a jour transactionnelle de `MediaAsset`, `Beat` et `AudioProcessingJob`
- erreur : retry ou echec terminal selon `attempts` et `maxAttempts`

## Pre-requis

Le worker a besoin de :

- Rust
- Postgres accessible via `DATABASE_URL`
- un stockage S3-compatible accessible via `S3_PUBLIC_ENDPOINT`
- `ffprobe`, fourni par `ffmpeg`
- `ffmpeg`
- `curl`

Dans Docker, ces outils sont installes par le `Dockerfile`.

## Variables d'environnement

Obligatoires :

- `DATABASE_URL`
- `S3_PUBLIC_ENDPOINT`
- `S3_ACCESS_KEY_ID`
- `S3_SECRET_ACCESS_KEY`

Recommandees ou utilisees par l'app :

- `S3_REGION`, defaut `us-east-1`
- `S3_BUCKET_BEATS`
- `S3_FORCE_PATH_STYLE`, defaut `true`

Optionnelles :

- `AUDIO_WORKER_ID`, defaut `audio-worker-<pid>`
- `AUDIO_WORKER_POLL_INTERVAL_MS`, defaut `2000`
- `AUDIO_WORKER_TMP_DIR`, defaut `/tmp/universe-audio-worker`
- `RUST_LOG`, defaut logique `info`

Attention : `S3_PUBLIC_ENDPOINT` doit etre joignable depuis le conteneur du worker. Si le worker
tourne dans Docker, `http://localhost:9000` designe le conteneur du worker lui-meme, pas la machine
hote.

## Lancer en developpement

Depuis la racine du repo, avec l'infra Docker :

```bash
docker compose -f infra/compose.dev.yml up audio-worker
```

Pour lancer tout l'environnement de developpement :

```bash
docker compose -f infra/compose.dev.yml up
```

Le service `audio-worker` utilise le target Docker `dev`, qui execute :

```bash
cargo run
```

## Lancer localement sans Docker

Installer d'abord `ffmpeg` et `curl`, puis exporter les variables d'environnement necessaires.

Exemple :

```bash
export DATABASE_URL="postgresql://universe:universe_dev_password@localhost:5432/universe_dev"
export S3_PUBLIC_ENDPOINT="http://localhost:9000"
export S3_REGION="us-east-1"
export S3_ACCESS_KEY_ID="..."
export S3_SECRET_ACCESS_KEY="..."
export S3_FORCE_PATH_STYLE="true"

cd audio-worker
cargo run
```

## Checklist pour une reecriture propre

Pour reprendre le code a la main, tu peux viser ces blocs independants :

1. `Config` : charger et valider l'environnement.
2. `JobRepository` : claim, ready, failed.
3. `AssetRepository` : lire les assets source/sortie.
4. `StorageClient` : download/upload S3.
5. `AudioTool` : probe de duree et generation MP3.
6. `PreviewPolicy` : calcul pur de la duree du preview.
7. `Worker` : orchestration du traitement d'un job.

Le bon test mental : chaque bloc doit pouvoir etre compris sans connaitre tout le fichier
`main.rs`.
