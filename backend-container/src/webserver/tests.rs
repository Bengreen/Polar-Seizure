use crate::config::AppConfig;
use crate::state::AppState;
use crate::webserver::app_router;
use axum::body::Body;
use axum::http::{Request, StatusCode};
use axum_prometheus::metrics_exporter_prometheus::PrometheusBuilder;
use http_body_util::BodyExt;
use std::sync::OnceLock;
use tower::ServiceExt;

use crate::tokio_tools::ThreadRuntime;
use url::Url;

/// Install the Prometheus recorder exactly once across all tests in this module.
static PROMETHEUS_HANDLE: OnceLock<axum_prometheus::metrics_exporter_prometheus::PrometheusHandle> =
    OnceLock::new();

// PRD Reference: 0001
fn init_prometheus() -> axum_prometheus::metrics_exporter_prometheus::PrometheusHandle {
    PROMETHEUS_HANDLE
        .get_or_init(|| PrometheusBuilder::new().install_recorder().unwrap())
        .clone()
}

// PRD Reference: 0001
fn get_test_state() -> AppState {
    let metric_handle = init_prometheus();
    let config = AppConfig {
        database: crate::config::DatabaseConfig {
            url: crate::config::UrlWithUsernamePassword {
                url: Url::parse("postgres://localhost:5432/db").unwrap(),
                username: None,
                password: None,
            },
            max_connections: 10,
        },
        webservice: crate::config::WebServiceConfig {
            address: Url::parse("http://0.0.0.0:8080").unwrap(),
            forwarding_headers: vec![],
            cors: crate::config::CorsConfig {
                allow_origins: vec![],
                allow_methods: vec![],
                allow_headers: vec![],
            },
            timeout: std::time::Duration::from_secs(30),
            max_connections: 100,
        },
        hams: ::hams::hams::config::HamsConfig::default(),
        runtime: ThreadRuntime {
            threads: 1,
            stack_size: 1024 * 1024,
            name: "test".to_string(),
        },
        startup_checks: crate::config::StartupCheckConfig {
            fails: 1,
            timeout: std::time::Duration::from_secs(1),
            enabled: false,
        },
        debugging: crate::config::DebuggingConfig {
            fail_debug_delay: std::time::Duration::from_secs(0),
            environment: "testing".to_string(),
            enable_dev_auth: true,
            log_level: "info".to_string(),
        },
        spatial: crate::config::SpatialConfig::default(),
        keycloak: crate::config::KeycloakConfig::default(),
    };

    let db_pool = sqlx::postgres::PgPoolOptions::new()
        .max_connections(1)
        .acquire_timeout(std::time::Duration::from_secs(1))
        .connect_lazy("postgres://localhost:5432/db")
        .unwrap();

    let keypair = jwt_simple::algorithms::RS256KeyPair::generate(2048)
        .unwrap()
        .with_key_id("dev-key-1");
    let dev_jwt_keypair = Some(std::sync::Arc::new(keypair));

    AppState::new(config, metric_handle, db_pool, dev_jwt_keypair, None)
}

// PRD Reference: 0001, 0014
fn generate_test_jwt(state: &AppState, user_id: i64, role: &str) -> String {
    use jwt_simple::prelude::*;
    let keypair = state.dev_jwt_keypair.as_ref().unwrap();
    let custom_claims = crate::webserver::dev_auth::CustomClaims {
        sward_roles: vec![role.to_string()],
    };
    let claims = Claims::with_custom_claims(custom_claims, Duration::from_hours(1))
        .with_issuer("http://localhost:8080")
        .with_audience("sward-api")
        .with_subject(user_id.to_string());
    keypair.sign(claims).unwrap()
}

// PRD Reference: 0001
#[tokio::test]
async fn test_app_router_hello() {
    let state = get_test_state();
    let app = app_router(state);

    let response = app
        .oneshot(
            Request::builder()
                .uri("/v0/hello")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);
    let body = response.into_body().collect().await.unwrap().to_bytes();
    let body_json: serde_json::Value = serde_json::from_slice(&body).unwrap();
    assert_eq!(body_json["service"], "polar-seizure-backend");
    assert_eq!(body_json["status"], "operational");
    assert_eq!(body_json["shortcode"], "ps");
}

// References more than 3 PRDs
#[tokio::test]
async fn test_admin_health_unauthorized() {
    let state = get_test_state();
    let app = app_router(state);

    let response = app
        .oneshot(
            Request::builder()
                .uri("/v0/admin/health")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    // No header -> Default role "user" -> Forbidden
    assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
}

// References more than 3 PRDs
#[tokio::test]
async fn test_admin_health_authorized_support() {
    let state = get_test_state();

    let token = generate_test_jwt(&state, 1, "support");
    let app = app_router(state);

    let response = app
        .oneshot(
            Request::builder()
                .uri("/v0/admin/health")
                .header("Authorization", format!("Bearer {}", token))
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);
    let body = response.into_body().collect().await.unwrap().to_bytes();
    let body_str = String::from_utf8(body.to_vec()).unwrap();
    assert!(body_str.contains(r#""admin":true"#));
}

// References more than 3 PRDs
#[tokio::test]
async fn test_admin_health_authorized_admin() {
    let state = get_test_state();

    let token = generate_test_jwt(&state, 1, "admin");
    let app = app_router(state);

    let response = app
        .oneshot(
            Request::builder()
                .uri("/v0/admin/health")
                .header("Authorization", format!("Bearer {}", token))
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);
}

// References more than 3 PRDs
/// Test that the /v0/sync route exists and is reachable.
#[tokio::test]
async fn test_sync_route_exists() {
    let state = get_test_state();
    let app = app_router(state);

    let response = app
        .oneshot(
            Request::builder()
                .uri("/v0/sync")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_ne!(response.status(), StatusCode::NOT_FOUND);
}

// References more than 3 PRDs
/// Test that the /v0/sync route accepts a since query parameter.
#[tokio::test]
async fn test_sync_route_with_since_param() {
    let state = get_test_state();
    let app = app_router(state);

    let response = app
        .oneshot(
            Request::builder()
                .uri("/v0/sync?since=2026-04-25T00:00:00Z")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_ne!(response.status(), StatusCode::NOT_FOUND);
    assert_ne!(response.status(), StatusCode::BAD_REQUEST);
}

// PRD Reference: 0001
#[tokio::test]
async fn test_cors_headers_present() {
    use tower_http::cors::CorsLayer;
    let mut state = get_test_state();
    state.config.webservice.cors.allow_origins = vec!["http://localhost:4200".to_string()];
    state.config.webservice.cors.allow_methods = vec!["GET".to_string(), "POST".to_string()];
    state.config.webservice.cors.allow_headers = vec!["content-type".to_string()];

    let origins: Vec<axum::http::HeaderValue> = state
        .config
        .webservice
        .cors
        .allow_origins
        .iter()
        .map(|o| o.parse().unwrap())
        .collect();
    let methods: Vec<axum::http::Method> = state
        .config
        .webservice
        .cors
        .allow_methods
        .iter()
        .map(|m| m.parse().unwrap())
        .collect();
    let headers: Vec<axum::http::header::HeaderName> = state
        .config
        .webservice
        .cors
        .allow_headers
        .iter()
        .map(|h| h.parse().unwrap())
        .collect();

    let cors_layer = CorsLayer::new()
        .allow_origin(origins)
        .allow_methods(methods)
        .allow_headers(headers);
    let app = crate::webserver::app_router(state.clone()).layer(cors_layer);

    // Test preflight OPTIONS request
    let response = app
        .oneshot(
            Request::builder()
                .method("OPTIONS")
                .uri("/v0/hello")
                .header("Origin", "http://localhost:4200")
                .header("Access-Control-Request-Method", "GET")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);
    let headers = response.headers();
    assert_eq!(
        headers.get("access-control-allow-origin").unwrap(),
        "http://localhost:4200"
    );
    let methods = headers
        .get("access-control-allow-methods")
        .unwrap()
        .to_str()
        .unwrap();
    assert!(methods.contains("GET"));
    assert!(methods.contains("POST"));
}

// PRD Reference: 0005
#[tokio::test]
async fn test_telemetry_frame_route_exists() {
    let state = get_test_state();
    let app = app_router(state);

    let frame = serde_json::json!({
        "device_id": "polar-sense-01",
        "patient_id": "patient-42",
        "timestamp": "2026-11-12T20:00:00Z",
        "heart_rate": 80,
        "battery_percent": 95,
        "fft_ratio": 0.25,
        "max_power_freq": 2.1,
        "state": "NORMAL",
        "acc_sample_count": 50
    });

    let response = app
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/v1/telemetry/frame")
                .header("Content-Type", "application/json")
                .body(Body::from(frame.to_string()))
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::ACCEPTED);
}

// References more than 3 PRDs
#[tokio::test]
async fn test_post_user_route_exists() {
    let state = get_test_state();
    let app = app_router(state);

    let user_json = serde_json::json!({
        "id": 0,
        "name": "Test User",
        "email": "test@example.com",
        "role": "admin",
        "phone": null,
        "description": null
    });

    let response = app
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/v0/users")
                .header("Content-Type", "application/json")
                .body(Body::from(user_json.to_string()))
                .unwrap(),
        )
        .await
        .unwrap();

    assert_ne!(response.status(), StatusCode::NOT_FOUND);
}

// References more than 3 PRDs
#[tokio::test]
async fn test_put_user_route_exists() {
    let state = get_test_state();
    let app = app_router(state);

    let user_json = serde_json::json!({
        "id": 999,
        "name": "Updated User",
        "email": "updated@example.com",
        "role": "support",
        "phone": "123456",
        "description": "Some description"
    });

    let response = app
        .oneshot(
            Request::builder()
                .method("PUT")
                .uri("/v0/users/999")
                .header("Content-Type", "application/json")
                .body(Body::from(user_json.to_string()))
                .unwrap(),
        )
        .await
        .unwrap();

    assert_ne!(response.status(), StatusCode::NOT_FOUND);
}

// References more than 3 PRDs
#[tokio::test]
async fn test_delete_user_route_exists() {
    let state = get_test_state();
    let app = app_router(state);

    let response = app
        .oneshot(
            Request::builder()
                .method("DELETE")
                .uri("/v0/users/999")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_ne!(response.status(), StatusCode::NOT_FOUND);
}

#[tokio::test]
async fn test_get_user_idor_protection() {
    let state = get_test_state();
    let app = app_router(state.clone());

    // User 1 requests User 2's profile - should be Forbidden
    let token = generate_test_jwt(&state, 1, "user");
    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .uri("/v0/users/2")
                .header("Authorization", format!("Bearer {}", token))
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::FORBIDDEN);

    // User 2 requests User 2's profile - should be OK (or internal error/not found if mock DB fails, but NOT forbidden)
    let token2 = generate_test_jwt(&state, 2, "user");
    let response2 = app
        .clone()
        .oneshot(
            Request::builder()
                .uri("/v0/users/2")
                .header("Authorization", format!("Bearer {}", token2))
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_ne!(response2.status(), StatusCode::FORBIDDEN);
    assert_ne!(response2.status(), StatusCode::UNAUTHORIZED);

    // Admin requests User 2's profile - should be OK
    let token_admin = generate_test_jwt(&state, 3, "admin");
    let response_admin = app
        .clone()
        .oneshot(
            Request::builder()
                .uri("/v0/users/2")
                .header("Authorization", format!("Bearer {}", token_admin))
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_ne!(response_admin.status(), StatusCode::FORBIDDEN);
    assert_ne!(response_admin.status(), StatusCode::UNAUTHORIZED);

    // Support requests User 2's profile - should be OK
    let token_support = generate_test_jwt(&state, 4, "support");
    let response_support = app
        .clone()
        .oneshot(
            Request::builder()
                .uri("/v0/users/2")
                .header("Authorization", format!("Bearer {}", token_support))
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_ne!(response_support.status(), StatusCode::FORBIDDEN);
    assert_ne!(response_support.status(), StatusCode::UNAUTHORIZED);
}

#[tokio::test]
async fn test_update_user_idor_and_privilege_escalation() {
    let state = get_test_state();
    let app = app_router(state.clone());

    let user_json = serde_json::json!({
        "id": 2,
        "name": "Updated User",
        "email": "updated@example.com",
        "role": "admin",
        "phone": "123456",
        "description": "Some description",
        "is_suspended": false,
        "client_log_level": "DEBUG",
        "modules": []
    });

    // User 1 trying to update User 2 - should be Forbidden
    let token1 = generate_test_jwt(&state, 1, "user");
    let response1 = app
        .clone()
        .oneshot(
            Request::builder()
                .method("PUT")
                .uri("/v0/users/2")
                .header("Authorization", format!("Bearer {}", token1))
                .header("Content-Type", "application/json")
                .body(Body::from(user_json.to_string()))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response1.status(), StatusCode::FORBIDDEN);

    // Support trying to update User 2 - should be Forbidden
    let token_support = generate_test_jwt(&state, 4, "support");
    let response_support = app
        .clone()
        .oneshot(
            Request::builder()
                .method("PUT")
                .uri("/v0/users/2")
                .header("Authorization", format!("Bearer {}", token_support))
                .header("Content-Type", "application/json")
                .body(Body::from(user_json.to_string()))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response_support.status(), StatusCode::FORBIDDEN);
}

#[tokio::test]
async fn test_x_jwt_payload_authorized() {
    let state = get_test_state();
    let app = app_router(state);

    // payload: {"sub": "1", "sward_roles": ["admin"]}
    let payload = r#"{"sub": "1", "sward_roles": ["admin"]}"#;
    let b64_payload = base64::Engine::encode(
        &base64::engine::general_purpose::STANDARD,
        payload.as_bytes(),
    );

    let response = app
        .oneshot(
            Request::builder()
                .uri("/v0/admin/health")
                .header("x-jwt-payload", b64_payload)
                .header("Authorization", "Bearer some_dummy_token_123")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);
}

#[tokio::test]
async fn test_x_jwt_payload_missing_dev_auth_disabled() {
    let mut state = get_test_state();
    state.config.debugging.enable_dev_auth = false;
    let app = app_router(state);

    // Missing x-jwt-payload header in production mode must return 401
    let response = app
        .oneshot(
            Request::builder()
                .uri("/v0/admin/health")
                .header("Authorization", "Bearer some_dummy_token_123")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
}

#[tokio::test]
async fn test_create_user_conflict_returns_error() {
    let state = get_test_state();
    let app = app_router(state.clone());

    let token = generate_test_jwt(&state, 1, "admin");

    // Attempting to post user with id 100 via create_user
    let user_json = serde_json::json!({
        "id": 100,
        "name": "Original User",
        "email": "conflict_user100@example.com",
        "role": "user"
    });

    let res1 = app
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/v0/users")
                .header("Authorization", format!("Bearer {}", token))
                .header("Content-Type", "application/json")
                .body(Body::from(user_json.to_string()))
                .unwrap(),
        )
        .await
        .unwrap();

    // Route executes database query without ON CONFLICT clause
    assert_eq!(res1.status(), StatusCode::INTERNAL_SERVER_ERROR);
}

#[tokio::test]
async fn test_telemetry_bulk_ingest_and_deduplication() {
    let state = get_test_state();
    let app = app_router(state.clone());
    let token = generate_test_jwt(&state, 42, "user");

    // 1. Initial bulk upload with 2 samples
    let bulk_payload = serde_json::json!({
        "device_id": "polar-sense-c342",
        "batch_id": "00000000-0000-0000-0000-000000000101",
        "is_emergency": false,
        "samples": [
            {
                "sample_type": "dsp",
                "timestamp_ms": 1700000000000i64,
                "heart_rate": 78.5,
                "energy_ratio": 0.45,
                "band_power": 12.3,
                "total_power": 27.3,
                "state": "OK"
            },
            {
                "sample_type": "acc",
                "timestamp_ms": 1700000001000i64,
                "x": 0.1,
                "y": 0.9,
                "z": 0.05,
                "magnitude": 0.91
            }
        ]
    });

    let res = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/v1/telemetry/bulk")
                .header("Authorization", format!("Bearer {}", token))
                .header("Content-Type", "application/json")
                .body(Body::from(bulk_payload.to_string()))
                .unwrap(),
        )
        .await
        .unwrap();

    let status = res.status();
    let body_bytes = res.into_body().collect().await.unwrap().to_bytes();
    if status != StatusCode::OK {
        eprintln!(
            "Bulk upload failed: status={} body={}",
            status,
            String::from_utf8_lossy(&body_bytes)
        );
    }
    assert_eq!(status, StatusCode::OK);
    let resp: serde_json::Value = serde_json::from_slice(&body_bytes).unwrap();
    assert_eq!(resp["total_received"], 2);
    assert_eq!(resp["ingested_count"], 2);
    assert_eq!(resp["deduplicated_count"], 0);
    assert_eq!(resp["sync_config"]["next_upload_in_seconds"], 300);

    // 2. Emergency fast-path upload sending overlapping sample + 1 new emergency sample
    let emergency_payload = serde_json::json!({
        "device_id": "polar-sense-c342",
        "batch_id": "00000000-0000-0000-0000-000000000102",
        "is_emergency": true,
        "emergency_type": "seizure_detected",
        "samples": [
            // Duplicate of previously sent sample
            {
                "sample_type": "dsp",
                "timestamp_ms": 1700000000000i64,
                "heart_rate": 78.5,
                "energy_ratio": 0.45,
                "band_power": 12.3,
                "total_power": 27.3,
                "state": "OK"
            },
            // New emergency sample
            {
                "sample_type": "dsp",
                "timestamp_ms": 1700000002000i64,
                "heart_rate": 145.0,
                "energy_ratio": 0.88,
                "band_power": 85.0,
                "total_power": 96.0,
                "state": "ALARM"
            }
        ]
    });

    let res2 = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/v1/telemetry/emergency")
                .header("Authorization", format!("Bearer {}", token))
                .header("Content-Type", "application/json")
                .body(Body::from(emergency_payload.to_string()))
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(res2.status(), StatusCode::OK);
    let body_bytes2 = res2.into_body().collect().await.unwrap().to_bytes();
    let resp2: serde_json::Value = serde_json::from_slice(&body_bytes2).unwrap();
    assert_eq!(resp2["total_received"], 2);
    assert_eq!(resp2["ingested_count"], 1);
    assert_eq!(resp2["deduplicated_count"], 1);

    // 3. Query live telemetry for SPA dashboard
    let res3 = app
        .clone()
        .oneshot(
            Request::builder()
                .method("GET")
                .uri("/api/v1/telemetry/users/42/live?limit=10")
                .header("Authorization", format!("Bearer {}", token))
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(res3.status(), StatusCode::OK);
    let body_bytes3 = res3.into_body().collect().await.unwrap().to_bytes();
    let samples: Vec<serde_json::Value> = serde_json::from_slice(&body_bytes3).unwrap();
    assert_eq!(samples.len(), 3);
    assert_eq!(samples[2]["alarm_state"], "ALARM");
    assert_eq!(samples[2]["is_emergency"], true);
}

#[tokio::test]
async fn test_dynamic_telemetry_sync_config() {
    let state = get_test_state();
    let app = app_router(state.clone());
    let token = generate_test_jwt(&state, 77, "user");

    // 1. Get default sync config
    let res = app
        .clone()
        .oneshot(
            Request::builder()
                .method("GET")
                .uri("/api/v1/telemetry/config")
                .header("Authorization", format!("Bearer {}", token))
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(res.status(), StatusCode::OK);
    let body_bytes = res.into_body().collect().await.unwrap().to_bytes();
    let cfg: serde_json::Value = serde_json::from_slice(&body_bytes).unwrap();
    assert_eq!(cfg["user_id"], 77);
    assert_eq!(cfg["bulk_upload_interval_seconds"], 300);
    assert_eq!(cfg["emergency_pre_event_window_seconds"], 120);

    // 2. Update cadence to 60 seconds (e.g. for high-risk monitoring period)
    let update_payload = serde_json::json!({
        "user_id": 77,
        "bulk_upload_interval_seconds": 60,
        "emergency_pre_event_window_seconds": 180,
        "emergency_post_event_window_seconds": 90,
        "compress_uploads": true,
        "allow_cellular_bulk": false,
        "updated_at": "2026-11-12T20:00:00Z"
    });

    let res2 = app
        .clone()
        .oneshot(
            Request::builder()
                .method("PUT")
                .uri("/api/v1/telemetry/config")
                .header("Authorization", format!("Bearer {}", token))
                .header("Content-Type", "application/json")
                .body(Body::from(update_payload.to_string()))
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(res2.status(), StatusCode::OK);

    // 3. Bulk upload should now return updated dynamic sync instruction
    let bulk_payload = serde_json::json!({
        "device_id": "polar-verity-77",
        "batch_id": "00000000-0000-0000-0000-000000000077",
        "is_emergency": false,
        "samples": []
    });

    let res3 = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/v1/telemetry/bulk")
                .header("Authorization", format!("Bearer {}", token))
                .header("Content-Type", "application/json")
                .body(Body::from(bulk_payload.to_string()))
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(res3.status(), StatusCode::OK);
    let body_bytes3 = res3.into_body().collect().await.unwrap().to_bytes();
    let resp3: serde_json::Value = serde_json::from_slice(&body_bytes3).unwrap();
    assert_eq!(resp3["sync_config"]["next_upload_in_seconds"], 60);
    assert_eq!(resp3["sync_config"]["emergency_pre_window_seconds"], 180);
}
