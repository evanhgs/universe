# Universe Audio Worker

Rust worker for asynchronous audio preview generation.

It polls `AudioProcessingJob` rows with `type = PREVIEW_GENERATION`, downloads the private source
from S3-compatible storage, generates a protected 96kbps MP3 preview with `ffprobe` and `ffmpeg`,
uploads it to the output asset key, then marks the preview asset ready.

Required environment:

- `DATABASE_URL`
- `S3_PUBLIC_ENDPOINT`: S3-compatible endpoint used by Next.js and the worker, for example `http://localhost:9000`
- `S3_REGION`
- `S3_BUCKET_BEATS`
- `S3_ACCESS_KEY_ID`
- `S3_SECRET_ACCESS_KEY`
- `S3_FORCE_PATH_STYLE`

Optional environment:

- `AUDIO_WORKER_ID`
- `AUDIO_WORKER_POLL_INTERVAL_MS`
- `AUDIO_WORKER_TMP_DIR`
