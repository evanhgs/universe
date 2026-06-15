use std::{
    env,
    path::{Path, PathBuf},
    process::Stdio,
    time::Duration,
};

use anyhow::{anyhow, Context, Result};
use chrono::Utc;
use hmac::{Hmac, Mac};
use percent_encoding::{utf8_percent_encode, AsciiSet, CONTROLS};
use serde::Deserialize;
use sha2::{Digest, Sha256};
use sqlx::{postgres::PgPoolOptions, PgPool, Row};
use tempfile::TempDir;
use tokio::{fs, process::Command, time::sleep};
use tracing::{error, info, warn};

type HmacSha256 = Hmac<Sha256>;

const RFC3986_ENCODE_SET: &AsciiSet = &CONTROLS
    .add(b' ')
    .add(b'!')
    .add(b'"')
    .add(b'#')
    .add(b'%')
    .add(b'&')
    .add(b'\'')
    .add(b'(')
    .add(b')')
    .add(b'*')
    .add(b'+')
    .add(b',')
    .add(b'/')
    .add(b':')
    .add(b';')
    .add(b'<')
    .add(b'=')
    .add(b'>')
    .add(b'?')
    .add(b'@')
    .add(b'[')
    .add(b'\\')
    .add(b']')
    .add(b'^')
    .add(b'`')
    .add(b'{')
    .add(b'|')
    .add(b'}');

#[derive(Debug, Clone)]
struct Job {
    id: String,
    beat_id: String,
    source_asset_id: String,
    output_asset_id: String,
    attempts: i32,
    max_attempts: i32,
    publish_when_ready: bool,
    preview_policy: PreviewPolicy,
}

#[derive(Debug, Clone)]
struct Asset {
    id: String,
    bucket: String,
    object_key: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PreviewPolicy {
    long_source_threshold_sec: Option<f64>,
    long_preview_sec: Option<f64>,
    short_preview_sec: Option<f64>,
    bitrate_kbps: Option<u32>,
    fade_sec: Option<f64>,
}

impl Default for PreviewPolicy {
    fn default() -> Self {
        Self {
            long_source_threshold_sec: Some(60.0),
            long_preview_sec: Some(30.0),
            short_preview_sec: Some(10.0),
            bitrate_kbps: Some(96),
            fade_sec: Some(1.0),
        }
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct JobPayload {
    publish_when_ready: Option<bool>,
    preview_policy: Option<PreviewPolicy>,
}

#[derive(Debug, Clone)]
struct WorkerConfig {
    id: String,
    poll_interval: Duration,
    tmp_dir: PathBuf,
    /// Maximum allowed size in bytes for a downloaded source asset. Prevents a
    /// hostile or malformed asset from filling the worker disk (audit C5).
    max_source_bytes: u64,
}

#[derive(Debug, Clone)]
struct StorageConfig {
    endpoint: String,
    region: String,
    access_key_id: String,
    secret_access_key: String,
    force_path_style: bool,
}

#[tokio::main]
async fn main() -> Result<()> {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env().unwrap_or_else(|_| "info".into()),
        )
        .init();

    let config = WorkerConfig {
        id: env::var("AUDIO_WORKER_ID")
            .unwrap_or_else(|_| format!("audio-worker-{}", std::process::id())),
        poll_interval: Duration::from_millis(
            env::var("AUDIO_WORKER_POLL_INTERVAL_MS")
                .ok()
                .and_then(|value| value.parse().ok())
                .unwrap_or(2_000),
        ),
        tmp_dir: PathBuf::from(
            env::var("AUDIO_WORKER_TMP_DIR")
                .unwrap_or_else(|_| "/tmp/universe-audio-worker".into()),
        ),
        max_source_bytes: env::var("AUDIO_WORKER_MAX_SOURCE_BYTES")
            .ok()
            .and_then(|value| value.parse().ok())
            .unwrap_or(5_000 * 1024 * 1024),
    };

    fs::create_dir_all(&config.tmp_dir).await?;

    let database_url = env::var("DATABASE_URL").context("DATABASE_URL is required")?;
    let pool = PgPoolOptions::new()
        .max_connections(5)
        .connect(&database_url)
        .await
        .context("failed to connect to postgres")?;
    let storage = load_storage_config()?;

    info!(worker_id = %config.id, "audio worker started");

    loop {
        match claim_job(&pool, &config.id).await {
            Ok(Some(job)) => {
                if let Err(error) = process_job(&pool, &storage, &config, job.clone()).await {
                    error!(job_id = %job.id, error = ?error, "audio job failed");
                    mark_job_failed(&pool, &job, &error.to_string()).await?;
                }
            }
            Ok(None) => sleep(config.poll_interval).await,
            Err(error) => {
                error!(error = ?error, "failed to claim audio job");
                sleep(config.poll_interval).await;
            }
        }
    }
}

fn load_storage_config() -> Result<StorageConfig> {
    let endpoint = env::var("S3_PUBLIC_ENDPOINT")
        .context("S3_PUBLIC_ENDPOINT is required")?
        .trim()
        .to_string();

    if endpoint.is_empty() {
        return Err(anyhow!("S3_PUBLIC_ENDPOINT cannot be empty"));
    }

    let config = StorageConfig {
        endpoint,
        region: env::var("S3_REGION").unwrap_or_else(|_| "us-east-1".into()),
        access_key_id: env::var("S3_ACCESS_KEY_ID").context("S3_ACCESS_KEY_ID is required")?,
        secret_access_key: env::var("S3_SECRET_ACCESS_KEY")
            .context("S3_SECRET_ACCESS_KEY is required")?,
        force_path_style: env::var("S3_FORCE_PATH_STYLE")
            .map(|value| value != "false")
            .unwrap_or(true),
    };

    info!(
        endpoint = %config.endpoint,
        region = %config.region,
        force_path_style = config.force_path_style,
        "s3 storage configured"
    );

    if config.endpoint.contains("://localhost") || config.endpoint.contains("://127.0.0.1") {
        warn!(
            endpoint = %config.endpoint,
            "S3_PUBLIC_ENDPOINT uses loopback; this only works if S3 is inside the audio-worker container"
        );
    }

    Ok(config)
}

async fn claim_job(pool: &PgPool, worker_id: &str) -> Result<Option<Job>> {
    let mut tx = pool.begin().await?;
    let row = sqlx::query(
        r#"
        SELECT id, "beatId", "sourceAssetId", "outputAssetId", attempts, "maxAttempts", "payloadJson"
        FROM "AudioProcessingJob"
        WHERE id = (
          SELECT id
          FROM "AudioProcessingJob"
          WHERE type = 'PREVIEW_GENERATION'
            AND status = 'PENDING'
            AND attempts < "maxAttempts"
          ORDER BY "createdAt" ASC
          FOR UPDATE SKIP LOCKED
          LIMIT 1
        )
        "#,
    )
    .fetch_optional(&mut *tx)
    .await?;

    let Some(row) = row else {
        tx.commit().await?;
        return Ok(None);
    };

    let id: String = row.try_get("id")?;
    sqlx::query(
        r#"
        UPDATE "AudioProcessingJob"
        SET status = 'PROCESSING',
            attempts = attempts + 1,
            "lockedAt" = NOW(),
            "lockedBy" = $2,
            "updatedAt" = NOW()
        WHERE id = $1
        "#,
    )
    .bind(&id)
    .bind(worker_id)
    .execute(&mut *tx)
    .await?;

    tx.commit().await?;

    let payload: Option<serde_json::Value> = row.try_get("payloadJson")?;
    let payload = payload
        .and_then(|value| serde_json::from_value::<JobPayload>(value).ok())
        .unwrap_or(JobPayload {
            publish_when_ready: None,
            preview_policy: None,
        });

    Ok(Some(Job {
        id,
        beat_id: row.try_get("beatId")?,
        source_asset_id: row.try_get("sourceAssetId")?,
        output_asset_id: row.try_get("outputAssetId")?,
        attempts: row.try_get::<i32, _>("attempts")? + 1,
        max_attempts: row.try_get("maxAttempts")?,
        publish_when_ready: payload.publish_when_ready.unwrap_or(false),
        preview_policy: payload.preview_policy.unwrap_or_default(),
    }))
}

async fn fetch_asset(pool: &PgPool, id: &str) -> Result<Asset> {
    let row = sqlx::query(r#"SELECT id, bucket, "objectKey" FROM "MediaAsset" WHERE id = $1"#)
        .bind(id)
        .fetch_one(pool)
        .await?;

    Ok(Asset {
        id: row.try_get("id")?,
        bucket: row.try_get("bucket")?,
        object_key: row.try_get("objectKey")?,
    })
}

async fn process_job(
    pool: &PgPool,
    storage: &StorageConfig,
    config: &WorkerConfig,
    job: Job,
) -> Result<()> {
    info!(
        job_id = %job.id,
        beat_id = %job.beat_id,
        attempt = job.attempts,
        max_attempts = job.max_attempts,
        "processing preview job"
    );

    let source = fetch_asset(pool, &job.source_asset_id).await?;
    let output = fetch_asset(pool, &job.output_asset_id).await?;

    // Per-job scratch dir; Drop guarantees cleanup even on early return / panic
    // unwinding (audit C6 — fixes tempfile leak that previously occurred when
    // download/probe/encode/upload failed mid-flight).
    let workdir = TempDir::new_in(&config.tmp_dir)
        .with_context(|| format!("failed to create scratch dir under {:?}", config.tmp_dir))?;
    let source_path = workdir.path().join("source");
    let preview_path = workdir.path().join("preview.mp3");

    download_asset(storage, &source, &source_path, config.max_source_bytes).await?;
    let duration = probe_duration(&source_path).await?;
    let preview_seconds = preview_length(duration, &job.preview_policy);

    info!(
        job_id = %job.id,
        duration_sec = duration,
        preview_sec = preview_seconds,
        "audio source probed"
    );

    generate_preview(
        &source_path,
        &preview_path,
        preview_seconds,
        &job.preview_policy,
    )
    .await?;

    let size_bytes = fs::metadata(&preview_path).await?.len() as i64;
    upload_preview(storage, &output, &preview_path).await?;
    mark_job_ready(pool, &job, duration, preview_seconds, size_bytes).await?;

    info!(job_id = %job.id, beat_id = %job.beat_id, output_asset_id = %output.id, "preview generated");
    // workdir drops here, removing source and preview tempfiles.
    drop(workdir);
    Ok(())
}

async fn download_asset(
    storage: &StorageConfig,
    asset: &Asset,
    path: &Path,
    max_bytes: u64,
) -> Result<()> {
    let url = presigned_s3_url(storage, "GET", &asset.bucket, &asset.object_key, None)?;
    info!(
        bucket = %asset.bucket,
        object_key = %asset.object_key,
        target = %path.display(),
        max_bytes = max_bytes,
        "downloading source asset"
    );

    let status = Command::new("curl")
        .arg("--fail")
        .arg("--silent")
        .arg("--show-error")
        .arg("--location")
        // Cap download size to mitigate DoS / disk exhaustion (audit C5).
        // curl exits with code 63 if the response or Content-Length exceeds this.
        .arg("--max-filesize")
        .arg(max_bytes.to_string())
        .arg(url)
        .arg("--output")
        .arg(path)
        .status()
        .await?;

    if !status.success() {
        return Err(anyhow!(
            "failed to download s3://{}/{} (curl exit {:?}; check --max-filesize={})",
            asset.bucket,
            asset.object_key,
            status.code(),
            max_bytes
        ));
    }

    info!(
        bucket = %asset.bucket,
        object_key = %asset.object_key,
        "source asset downloaded"
    );

    Ok(())
}

async fn upload_preview(storage: &StorageConfig, asset: &Asset, path: &Path) -> Result<()> {
    let url = presigned_s3_url(
        storage,
        "PUT",
        &asset.bucket,
        &asset.object_key,
        Some("audio/mpeg"),
    )?;
    info!(
        bucket = %asset.bucket,
        object_key = %asset.object_key,
        source = %path.display(),
        "uploading generated preview"
    );

    let status = Command::new("curl")
        .arg("--fail")
        .arg("--silent")
        .arg("--show-error")
        .arg("--location")
        .arg("-X")
        .arg("PUT")
        .arg("-H")
        .arg("Content-Type: audio/mpeg")
        .arg("--upload-file")
        .arg(path)
        .arg(url)
        .status()
        .await?;

    if !status.success() {
        return Err(anyhow!(
            "failed to upload s3://{}/{}",
            asset.bucket,
            asset.object_key
        ));
    }

    info!(
        bucket = %asset.bucket,
        object_key = %asset.object_key,
        "generated preview uploaded"
    );

    Ok(())
}

fn presigned_s3_url(
    config: &StorageConfig,
    method: &str,
    bucket: &str,
    object_key: &str,
    content_type: Option<&str>,
) -> Result<String> {
    let endpoint = config.endpoint.trim_end_matches('/');
    let (scheme, rest) = endpoint
        .split_once("://")
        .ok_or_else(|| anyhow!("S3 endpoint must include a scheme"))?;
    let (endpoint_host, endpoint_path) = rest
        .split_once('/')
        .map(|(host, path)| (host, format!("/{path}")))
        .unwrap_or((rest, String::new()));
    let (host, canonical_uri) = if config.force_path_style {
        (
            endpoint_host.to_string(),
            join_uri(
                &endpoint_path,
                &format!("{}/{}", path_segment(bucket), encode_path(object_key)),
            ),
        )
    } else {
        (
            format!("{bucket}.{endpoint_host}"),
            join_uri(&endpoint_path, &encode_path(object_key)),
        )
    };
    let now = Utc::now();
    let amz_date = now.format("%Y%m%dT%H%M%SZ").to_string();
    let date_stamp = now.format("%Y%m%d").to_string();
    let credential_scope = format!("{}/{}/s3/aws4_request", date_stamp, config.region);
    let credential = format!("{}/{}", config.access_key_id, credential_scope);
    let signed_headers = if content_type.is_some() {
        "content-type;host"
    } else {
        "host"
    };
    let mut query_params = vec![
        (
            "X-Amz-Algorithm".to_string(),
            "AWS4-HMAC-SHA256".to_string(),
        ),
        ("X-Amz-Credential".to_string(), credential),
        ("X-Amz-Date".to_string(), amz_date.clone()),
        ("X-Amz-Expires".to_string(), "900".to_string()),
        (
            "X-Amz-SignedHeaders".to_string(),
            signed_headers.to_string(),
        ),
    ];
    let canonical_query_string = canonical_query(&query_params);
    let canonical_headers = if let Some(content_type) = content_type {
        format!("content-type:{content_type}\nhost:{host}\n")
    } else {
        format!("host:{host}\n")
    };
    let canonical_request = [
        method,
        &canonical_uri,
        &canonical_query_string,
        &canonical_headers,
        signed_headers,
        "UNSIGNED-PAYLOAD",
    ]
    .join("\n");
    let string_to_sign = [
        "AWS4-HMAC-SHA256",
        &amz_date,
        &credential_scope,
        &sha256_hex(canonical_request.as_bytes()),
    ]
    .join("\n");
    let signing_key = signing_key(&config.secret_access_key, &date_stamp, &config.region)?;
    let signature = hmac_hex(&signing_key, string_to_sign.as_bytes())?;

    query_params.push(("X-Amz-Signature".to_string(), signature));

    Ok(format!(
        "{scheme}://{host}{canonical_uri}?{}",
        canonical_query(&query_params)
    ))
}

fn encode_query(value: &str) -> String {
    utf8_percent_encode(value, RFC3986_ENCODE_SET).to_string()
}

fn path_segment(value: &str) -> String {
    encode_query(value)
}

fn encode_path(value: &str) -> String {
    value
        .split('/')
        .map(path_segment)
        .collect::<Vec<_>>()
        .join("/")
}

fn join_uri(prefix: &str, suffix: &str) -> String {
    let prefix = prefix.trim_end_matches('/');
    let suffix = suffix.trim_start_matches('/');

    if prefix.is_empty() {
        format!("/{suffix}")
    } else {
        format!("{prefix}/{suffix}")
    }
}

fn canonical_query(params: &[(String, String)]) -> String {
    let mut pairs = params.to_vec();
    pairs.sort_by(|left, right| left.0.cmp(&right.0).then(left.1.cmp(&right.1)));
    pairs
        .into_iter()
        .map(|(key, value)| format!("{}={}", encode_query(&key), encode_query(&value)))
        .collect::<Vec<_>>()
        .join("&")
}

fn sha256_hex(value: &[u8]) -> String {
    hex::encode(Sha256::digest(value))
}

fn hmac_bytes(key: &[u8], value: &[u8]) -> Result<Vec<u8>> {
    let mut mac = HmacSha256::new_from_slice(key)?;
    mac.update(value);
    Ok(mac.finalize().into_bytes().to_vec())
}

fn hmac_hex(key: &[u8], value: &[u8]) -> Result<String> {
    let mut mac = HmacSha256::new_from_slice(key)?;
    mac.update(value);
    Ok(hex::encode(mac.finalize().into_bytes()))
}

fn signing_key(secret_access_key: &str, date: &str, region: &str) -> Result<Vec<u8>> {
    let date_key = hmac_bytes(
        format!("AWS4{secret_access_key}").as_bytes(),
        date.as_bytes(),
    )?;
    let date_region_key = hmac_bytes(&date_key, region.as_bytes())?;
    let date_region_service_key = hmac_bytes(&date_region_key, b"s3")?;
    hmac_bytes(&date_region_service_key, b"aws4_request")
}

async fn probe_duration(path: &Path) -> Result<f64> {
    let output = Command::new("ffprobe")
        .arg("-v")
        .arg("error")
        .arg("-show_entries")
        .arg("format=duration")
        .arg("-of")
        .arg("default=noprint_wrappers=1:nokey=1")
        .arg(path)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .await?;

    if !output.status.success() {
        return Err(anyhow!(
            "ffprobe failed: {}",
            String::from_utf8_lossy(&output.stderr)
        ));
    }

    let duration = String::from_utf8_lossy(&output.stdout)
        .trim()
        .parse::<f64>()
        .context("ffprobe returned an invalid duration")?;

    if !duration.is_finite() || duration <= 0.0 {
        return Err(anyhow!("source audio duration is invalid"));
    }

    Ok(duration)
}

fn preview_length(duration: f64, policy: &PreviewPolicy) -> f64 {
    let threshold = policy.long_source_threshold_sec.unwrap_or(60.0);
    let long_preview = policy.long_preview_sec.unwrap_or(30.0);
    let short_preview = policy.short_preview_sec.unwrap_or(10.0);

    if duration >= threshold {
        long_preview.min(duration)
    } else {
        duration.min(short_preview)
    }
}

async fn generate_preview(
    source: &Path,
    output: &Path,
    preview_seconds: f64,
    policy: &PreviewPolicy,
) -> Result<()> {
    let fade_seconds = preview_seconds.min(policy.fade_sec.unwrap_or(1.0));
    let bitrate = format!("{}k", policy.bitrate_kbps.unwrap_or(96));
    let fade_out_start = (preview_seconds - fade_seconds).max(0.0);
    let audio_filter = format!(
        "afade=t=in:st=0:d={fade_seconds},afade=t=out:st={fade_out_start}:d={fade_seconds}"
    );
    info!(
        source = %source.display(),
        output = %output.display(),
        preview_sec = preview_seconds,
        bitrate = %bitrate,
        fade_sec = fade_seconds,
        "generating audio preview"
    );

    let result = Command::new("ffmpeg")
        .arg("-y")
        .arg("-i")
        .arg(source)
        .arg("-t")
        .arg(format!("{preview_seconds:.3}"))
        .arg("-vn")
        .arg("-codec:a")
        .arg("libmp3lame")
        .arg("-b:a")
        .arg(bitrate)
        .arg("-af")
        .arg(audio_filter)
        .arg(output)
        .stdout(Stdio::null())
        .stderr(Stdio::piped())
        .output()
        .await?;

    if !result.status.success() {
        return Err(anyhow!(
            "ffmpeg failed: {}",
            String::from_utf8_lossy(&result.stderr)
        ));
    }

    info!(output = %output.display(), "audio preview generated");

    Ok(())
}

async fn mark_job_ready(
    pool: &PgPool,
    job: &Job,
    duration_seconds: f64,
    preview_seconds: f64,
    size_bytes: i64,
) -> Result<()> {
    let mut tx = pool.begin().await?;
    let duration_rounded = duration_seconds.round() as i32;
    let metadata = serde_json::json!({
        "durationSec": duration_rounded,
        "previewDurationSec": preview_seconds,
        "bitrateKbps": 96,
        "generatedBy": "universe-audio-worker"
    });

    sqlx::query(
        r#"
        UPDATE "MediaAsset"
        SET "processingStatus" = 'READY',
            "mimeType" = 'audio/mpeg',
            extension = 'mp3',
            "sizeBytes" = $2,
            "metadataJson" = $3,
            "updatedAt" = NOW()
        WHERE id = $1
        "#,
    )
    .bind(&job.output_asset_id)
    .bind(size_bytes)
    .bind(metadata)
    .execute(&mut *tx)
    .await?;

    sqlx::query(
        r#"
        UPDATE "Beat"
        SET "durationSec" = $2,
            status = CASE WHEN $3 AND status = 'PROCESSING' AND "stripeSyncStatus" = 'SYNCED'::"StripeCatalogSyncStatus" THEN 'PUBLISHED' ELSE status END,
            "publishedAt" = CASE WHEN $3 AND status = 'PROCESSING' AND "stripeSyncStatus" = 'SYNCED'::"StripeCatalogSyncStatus" THEN NOW() ELSE "publishedAt" END,
            "firstPublishedAt" = CASE WHEN $3 AND "firstPublishedAt" IS NULL AND "stripeSyncStatus" = 'SYNCED'::"StripeCatalogSyncStatus" THEN NOW() ELSE "firstPublishedAt" END,
            "updatedAt" = NOW()
        WHERE id = $1
        "#,
    )
    .bind(&job.beat_id)
    .bind(duration_rounded)
    .bind(job.publish_when_ready)
    .execute(&mut *tx)
    .await?;

    sqlx::query(
        r#"
        UPDATE "AudioProcessingJob"
        SET status = 'READY',
            "completedAt" = NOW(),
            "lockedAt" = NULL,
            "lockedBy" = NULL,
            "errorMessage" = NULL,
            "updatedAt" = NOW()
        WHERE id = $1
        "#,
    )
    .bind(&job.id)
    .execute(&mut *tx)
    .await?;

    tx.commit().await?;
    Ok(())
}

async fn mark_job_failed(pool: &PgPool, job: &Job, error_message: &str) -> Result<()> {
    let terminal_failure = job.attempts >= job.max_attempts;
    let next_status = if terminal_failure {
        "FAILED"
    } else {
        "PENDING"
    };

    let mut tx = pool.begin().await?;
    sqlx::query(
        r#"
        UPDATE "AudioProcessingJob"
        SET status = $2::"ProcessingStatus",
            "failedAt" = CASE WHEN $3 THEN NOW() ELSE "failedAt" END,
            "lockedAt" = NULL,
            "lockedBy" = NULL,
            "errorMessage" = $4,
            "updatedAt" = NOW()
        WHERE id = $1
        "#,
    )
    .bind(&job.id)
    .bind(next_status)
    .bind(terminal_failure)
    .bind(error_message.chars().take(2_000).collect::<String>())
    .execute(&mut *tx)
    .await?;

    if terminal_failure {
        warn!(job_id = %job.id, "audio job reached max attempts");
        let metadata = serde_json::json!({
            "error": error_message.chars().take(2_000).collect::<String>(),
            "generatedBy": "universe-audio-worker"
        });

        sqlx::query(
            r#"
            UPDATE "MediaAsset"
            SET "processingStatus" = 'FAILED',
                "metadataJson" = $2,
                "updatedAt" = NOW()
            WHERE id = $1
            "#,
        )
        .bind(&job.output_asset_id)
        .bind(metadata)
        .execute(&mut *tx)
        .await?;

        sqlx::query(
            r#"
            UPDATE "Beat"
            SET status = CASE WHEN status = 'PROCESSING' THEN 'DRAFT' ELSE status END,
                "publishedAt" = CASE WHEN status = 'PROCESSING' THEN NULL ELSE "publishedAt" END,
                "updatedAt" = NOW()
            WHERE id = $1
            "#,
        )
        .bind(&job.beat_id)
        .execute(&mut *tx)
        .await?;
    }

    tx.commit().await?;
    Ok(())
}
