# PRD-007: CI/CD Pipelines, Artifact Packaging & FluxCD GitOps

## 1. Principles
All artifacts across the Polar-Seizure (`ps`) ecosystem follow strict immutability, automated validation, and GitOps synchronization:
1. **Pull Request (PR) Validation:** Every PR runs unit tests, linting, type-checks, and dry-run builds for all containers and the Android app.
2. **SHA-Tagged Artifacts:** Docker container images are built and pushed to GitHub Container Registry (`ghcr.io`) tagged with the git commit SHA (`sha-${GITHUB_SHA::7}`) and latest semantic tags on `main`.
3. **Android Build Artifact:** On merge to `main`, GitHub Actions compiles the Android release APK, tags it with the commit SHA, and uploads it to GitHub Actions Artifacts / Releases.
4. **FluxCD GitOps:** The `fluxcd-dev` directory declares Kubernetes manifests tracked by FluxCD controllers, utilizing ImageUpdateAutomation to deploy updated SHA containers automatically.

---

## 2. GitHub Actions Workflows

### 2.1 PR Verification (`.github/workflows/test-pr.yml`)
* Triggers on `pull_request` against `main`.
* Jobs:
  * `lint-and-test-backend`: Runs eslint, vitest, and build check in `backend-container/`.
  * `lint-and-test-frontend`: Runs eslint, vite build in `frontend-container/`.
  * `test-android`: Sets up JDK 17, Android SDK, runs `./gradlew test` in `android-app/`.

### 2.2 Release & Build Pipeline (`.github/workflows/build-artifacts.yml`)
* Triggers on `push` to `main`.
* Jobs:
  * `build-backend-image`: Builds multi-arch OCI container for `backend-container`, tags with `${{ github.sha }}` and `latest`, pushes to `ghcr.io/bengreen/polar-seizure-backend`.
  * `build-frontend-image`: Builds multi-arch OCI container for `frontend-container`, tags with `${{ github.sha }}` and `latest`, pushes to `ghcr.io/bengreen/polar-seizure-frontend`.
  * `build-android-apk`: Builds unsigned/signed release APK via Gradle in `android-app/`, labels artifact as `polar-seizure-app-${{ github.sha }}.apk`, and uploads as workflow artifact.

---

## 3. FluxCD Dev Manifests (`fluxcd-dev/`)
* **`kustomization.yaml`**: Root Kustomize overlay.
* **`backend-deployment.yaml`**: Kubernetes Deployment & Service targeting `ghcr.io/bengreen/polar-seizure-backend`.
* **`frontend-deployment.yaml`**: Kubernetes Deployment, Service & Ingress targeting `ghcr.io/bengreen/polar-seizure-frontend`.
* **`image-policy.yaml`**: Flux ImagePolicy tracking SHA / semver tags.
* **`image-update-automation.yaml`**: Flux ImageUpdateAutomation committing back to Git when new images are published.
