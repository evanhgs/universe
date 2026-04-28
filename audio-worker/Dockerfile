FROM rust:1-bookworm AS dev

RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg curl ca-certificates pkg-config libssl-dev \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY Cargo.toml Cargo.lock* ./
COPY src ./src

CMD ["cargo", "run"]

FROM rust:1-bookworm AS build

RUN apt-get update \
  && apt-get install -y --no-install-recommends pkg-config libssl-dev \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY Cargo.toml Cargo.lock* ./
COPY src ./src
RUN cargo build --release

FROM debian:bookworm-slim AS runtime

RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg curl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY --from=build /app/target/release/universe-audio-worker /usr/local/bin/universe-audio-worker

USER 10001:10001
CMD ["universe-audio-worker"]
