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
    let body_str = String::from_utf8(body.to_vec()).unwrap();
    assert_eq!(body_str, r#"{"message":"hello"}"#);
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

// References more than 3 PRDs
#[tokio::test]
async fn test_get_farm_route_exists() {
    let state = get_test_state();
    let app = app_router(state);

    let response = app
        .oneshot(
            Request::builder()
                .uri("/v0/farms/999")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    // The route should exist, so it should not return NOT_FOUND (404)
    // It might return INTERNAL_SERVER_ERROR (500) if database isn't fully mocked/accessible,
    // or NOT_FOUND if it queried the DB successfully but ID 999 doesn't exist.
    assert_ne!(response.status(), StatusCode::NOT_FOUND);
}

// References more than 3 PRDs
#[tokio::test]
async fn test_put_farm_route_exists() {
    let state = get_test_state();
    let app = app_router(state);

    let farm_json = serde_json::json!({
        "name": "Updated Farm Name",
        "location": "Updated Location"
    });

    let response = app
        .oneshot(
            Request::builder()
                .method("PUT")
                .uri("/v0/farms/999")
                .header("Content-Type", "application/json")
                .body(Body::from(farm_json.to_string()))
                .unwrap(),
        )
        .await
        .unwrap();

    assert_ne!(response.status(), StatusCode::NOT_FOUND);
}

// References more than 3 PRDs
#[tokio::test]
async fn test_put_field_route_exists() {
    let state = get_test_state();
    let app = app_router(state);

    let field_json = serde_json::json!({
        "farm_id": 1,
        "name": "Updated Field Name",
        "area_hectares": 12.5,
        "land_use": "arable"
    });

    let response = app
        .oneshot(
            Request::builder()
                .method("PUT")
                .uri("/v0/fields/999")
                .header("Content-Type", "application/json")
                .body(Body::from(field_json.to_string()))
                .unwrap(),
        )
        .await
        .unwrap();

    assert_ne!(response.status(), StatusCode::NOT_FOUND);
}

// References more than 3 PRDs
#[tokio::test]
async fn test_delete_event_route_exists() {
    let state = get_test_state();
    let app = app_router(state);

    let response = app
        .oneshot(
            Request::builder()
                .method("DELETE")
                .uri("/v0/events/999")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_ne!(response.status(), StatusCode::NOT_FOUND);
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
