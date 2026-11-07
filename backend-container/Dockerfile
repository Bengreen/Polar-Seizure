FROM lukemathwalker/cargo-chef:latest-rust-1-bookworm AS chef
RUN apt-get update && apt-get install -y libgeos-dev pkg-config cmake clang && rm -rf /var/lib/apt/lists/*
WORKDIR /app

FROM chef AS planner
COPY . .
RUN cargo chef prepare --recipe-path recipe.json

FROM chef AS buildcache
COPY --from=planner /app/recipe.json recipe.json

FROM buildcache AS dev
# Install dev tools
RUN cargo install cargo-watch
# Grab dependencies into target
RUN cargo chef cook --recipe-path recipe.json
# This enables us to keep /app/target inside the container when we mount /app from host
VOLUME /app/target
# So we hold the daemon mode of docker run
CMD ["sleep", "infinity"]

FROM buildcache AS buildcacherelease
# Build dependencies - this is the caching Docker layer!
RUN cargo chef cook --release --recipe-path recipe.json

FROM buildcacherelease AS build
COPY . .
RUN cargo test -- --test-threads=1
RUN cargo build --release

# We do not need the Rust toolchain to run the binary!
FROM debian:bookworm-slim AS runtime

# Install common runtime dependencies
RUN apt-get update && apt-get install -y \
    libssl3 \
    ca-certificates \
    libgeos-c1v5 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY --from=build /app/target/release/backend-container /usr/local/bin/

# Verify that the binary can run in this environment (e.g. check version or help)
RUN /usr/local/bin/backend-container --help

EXPOSE 8080 8079

ENTRYPOINT ["/usr/local/bin/backend-container"]
CMD ["serve"]
