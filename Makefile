.PHONY: all build test clean \
        build-be build-fe build-android \
        test-be test-fe test-android \
        ps-be-dev ps-be-test ps-be-check ps-be-fmt ps-be-docker ps-be-docker-run \
        ps-fe-dev ps-fe-test ps-fe-docker ps-fe-docker-run \
        ps-android-build ps-android-test ps-android-lint \
        pre-commit-run pre-commit-install

BASE_DIR := $(dir $(abspath $(lastword $(MAKEFILE_LIST))))

# Container & Application Configuration
BE_IMAGE := polar-seizure-backend
FE_IMAGE := polar-seizure-frontend

BE_PORT := 8080
BE_HEALTH_PORT := 8079
FE_PORT := 4200

BE_INTERNAL_PORT := 8080
BE_INTERNAL_HEALTH_PORT := 8079
FE_INTERNAL_PORT := 80

# Default target
all: build test

# Top-level compound targets
build: build-be build-fe build-android
test: test-be test-fe test-android

# --- Backend Container Targets ---
build-be: ps-be-docker
test-be: ps-be-test

ps-be-test:
	cd backend-container && cargo test -- --test-threads=1

ps-be-check:
	cd backend-container && cargo check

ps-be-fmt:
	cd backend-container && cargo fmt --check

ps-be-dev:
	-@lsof -t -i :$(BE_PORT) | xargs kill -9 2>/dev/null || true
	-@lsof -t -i :$(BE_HEALTH_PORT) | xargs kill -9 2>/dev/null || true
	cd backend-container && \
	RUST_LOG=debug \
	SP_BE__DEBUGGING__ENABLE_DEV_AUTH=true \
	cargo run -- --config-path config/default.yaml --secrets-dir config/ serve

ps-be-docker:
	docker build -t $(BE_IMAGE):latest backend-container

ps-be-docker-run: ps-be-docker
	docker run -it --rm --name $(BE_IMAGE) \
		-p $(BE_PORT):$(BE_INTERNAL_PORT) \
		-p $(BE_HEALTH_PORT):$(BE_INTERNAL_HEALTH_PORT) \
		$(BE_IMAGE):latest

# --- Frontend Container Targets ---
build-fe: ps-fe-docker
test-fe: ps-fe-test

frontend-container/node_modules: frontend-container/package.json
	cd frontend-container && npm install

ps-fe-dev: frontend-container/node_modules
	-@lsof -t -i :$(FE_PORT) | xargs kill -9 2>/dev/null || true
	cd frontend-container && npm start

ps-fe-test: frontend-container/node_modules
	cd frontend-container && npm test -- --watch=false --browsers=ChromeHeadless

ps-fe-docker:
	docker build -t $(FE_IMAGE):latest frontend-container

ps-fe-docker-run: ps-fe-docker
	docker run -it --rm --name $(FE_IMAGE) \
		-p $(FE_PORT):$(FE_INTERNAL_PORT) \
		$(FE_IMAGE):latest

# --- Android App Targets ---
build-android: ps-android-build
test-android: ps-android-test

ps-android-build:
	cd android-app && ./gradlew assembleDebug

ps-android-test:
	cd android-app && ./gradlew testDebugUnitTest

ps-android-lint:
	cd android-app && ./gradlew lintDebug

# --- Quality Assurance & Pre-commit Hooks ---
pre-commit-install:
	git config --local core.hooksPath ""
	pre-commit install

pre-commit-run:
	pre-commit run --all-files

clean:
	rm -rf android-app/app/build android-app/.gradle
	cd backend-container && cargo clean
	rm -rf frontend-container/dist
