//! Application configuration loading and schema structures.
//!
//! Handles hierarchical configuration loading via `figment`, incorporating YAML files,
//! environment variables, and file-based secret overrides.

use figment::{
    Figment,
    providers::{Env, Format, Yaml},
};
use figment_file_provider_adapter::FileAdapter;
use serde::{Deserialize, Serialize};
use std::time::Duration;
use url::Url;

use ::hams::hams::config::HamsConfig;

use crate::tokio_tools::ThreadRuntime;

/// A URL structure that optionally embeds credential placeholders for file-based secret resolution.
#[derive(Deserialize, Serialize, Debug, Clone)]
pub struct UrlWithUsernamePassword {
    /// Base target URL.
    pub url: Url,
    /// Optional username credential.
    pub username: Option<String>,
    /// Optional password credential.
    pub password: Option<String>,
}

impl From<UrlWithUsernamePassword> for Url {
    // References more than 3 PRDs
    fn from(value: UrlWithUsernamePassword) -> Self {
        let mut return_url = value.url;
        if let Some(password) = value.password {
            let _ = return_url.set_password(Some(&password));
        }
        if let Some(username) = value.username {
            let _ = return_url.set_username(&username);
        }
        return_url
    }
}

/// Root application configuration structure.
#[derive(Deserialize, Serialize, Debug, Clone)]
pub struct AppConfig {
    /// PostgreSQL database connection settings.
    pub database: DatabaseConfig,
    /// Web server listening and CORS settings.
    pub webservice: WebServiceConfig,
    /// Health Monitoring System (HaMS) settings.
    #[serde(serialize_with = "serialize_hams")]
    pub hams: HamsConfig,
    /// Tokio thread runtime configuration.
    pub runtime: ThreadRuntime,
    /// Pre-flight startup verification checks configuration.
    pub startup_checks: StartupCheckConfig,
    /// Debugging, delay, and logging level options.
    pub debugging: DebuggingConfig,
    /// Spatial/GIS integration settings.
    #[serde(default)]
    pub spatial: SpatialConfig,
    /// Keycloak SSO integration settings.
    #[serde(default)]
    pub keycloak: KeycloakConfig,
}

/// Keycloak identity provider configuration settings.
#[derive(Deserialize, Serialize, Debug, Clone, Default)]
pub struct KeycloakConfig {
    /// Base URL of the Keycloak instance (e.g. `https://keycloak.example.com`).
    pub base_url: Option<String>,
    /// Target Keycloak realm name.
    pub realm: Option<String>,
    /// Client identifier registered in Keycloak.
    pub client_id: Option<String>,
    /// Optional client secret key for confidential clients.
    pub client_secret: Option<String>,
}

/// Spatial and geographic boundary service settings.
#[derive(Deserialize, Serialize, Debug, Clone, Default)]
pub struct SpatialConfig {
    /// External API URL for official boundary queries.
    pub official_boundary_api_url: Option<Url>,
    /// Optional API key for authenticating external boundary calls.
    pub official_boundary_api_key: Option<String>,
}

// No obvious PRD requirement
fn serialize_hams<S>(hams: &HamsConfig, s: S) -> Result<S::Ok, S::Error>
where
    S: serde::Serializer,
{
    s.serialize_str(&format!("{:?}", hams))
}

/// Runtime debugging configuration options.
#[derive(Deserialize, Serialize, Debug, Clone)]
pub struct DebuggingConfig {
    /// Artificial delay to pause before process exit on failure during debugging.
    #[serde(with = "humantime_serde")]
    pub fail_debug_delay: Duration,
    /// Active deployment environment name (e.g. `development`, `staging`, `production`).
    pub environment: String,
    /// Flag indicating whether mock dev-auth mode is enabled.
    pub enable_dev_auth: bool,
    /// Minimum log level for `tracing_subscriber` (e.g. `info`, `debug`).
    pub log_level: String,
}

/// PostgreSQL database configuration parameters.
#[derive(Deserialize, Serialize, Debug, Clone)]
pub struct DatabaseConfig {
    /// Database connection URL with credentials.
    pub url: UrlWithUsernamePassword,
    /// Maximum connection pool size.
    pub max_connections: u32,
}

/// Cross-Origin Resource Sharing (CORS) policy configuration.
#[derive(Deserialize, Serialize, Debug, Clone)]
pub struct CorsConfig {
    /// Allowed origin patterns (e.g. `http://localhost:4200`).
    pub allow_origins: Vec<String>,
    /// Allowed HTTP request methods (e.g. `GET`, `POST`, `OPTIONS`).
    pub allow_methods: Vec<String>,
    /// Allowed HTTP request headers.
    pub allow_headers: Vec<String>,
}

/// Web server listener and networking configuration.
#[derive(Deserialize, Serialize, Debug, Clone)]
pub struct WebServiceConfig {
    /// Listening address URL (host and port).
    pub address: Url,
    /// HTTP headers to forward through proxy layers.
    pub forwarding_headers: Vec<String>,
    /// CORS policies configuration.
    pub cors: CorsConfig,
    /// Web server connection timeout duration.
    #[serde(with = "humantime_serde")]
    pub timeout: Duration,
    /// Maximum concurrent client connections allowed.
    pub max_connections: usize,
}

/// Pre-flight startup health check parameters.
#[derive(Deserialize, Serialize, Debug, Clone)]
pub struct StartupCheckConfig {
    /// Maximum allowable consecutive pre-flight check failures before aborting startup.
    pub fails: u32,
    /// Timeout duration per health check attempt.
    #[serde(with = "humantime_serde")]
    pub timeout: Duration,
    /// Flag enabling pre-flight startup checks.
    pub enabled: bool,
}

impl AppConfig {
    /// Loads application configuration from a YAML file and secrets directory.
    ///
    /// Merges configuration values with environment variable overrides starting with `SW_BE_`.
    pub fn load(
        config_path: &std::path::Path,
        secrets_dir: &std::path::Path,
    ) -> Result<Self, Box<figment::Error>> {
        let adapter = FileAdapter::wrap(Yaml::file(config_path)).relative_to_dir(secrets_dir);

        Figment::new()
            .merge(adapter)
            .merge(Env::prefixed("SP_BE__").split("__").lowercase(true))
            .extract()
            .map_err(Box::new)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::env;

    static ENV_MUTEX: std::sync::Mutex<()> = std::sync::Mutex::new(());

    // PRD Reference: 0001
    #[test]
    fn test_config_load_without_credentials() {
        let _lock = ENV_MUTEX.lock().unwrap();
        // Ensure no env vars are interfering
        unsafe {
            env::remove_var("SP_BE__DATABASE__URL__USERNAME");
            env::remove_var("SP_BE__DATABASE__URL__PASSWORD");
        }

        let config_res = AppConfig::load(
            std::path::Path::new("config/default.yaml"),
            std::path::Path::new("config"),
        );
        assert!(
            config_res.is_ok(),
            "Config should load even without credentials: {:?}",
            config_res.err()
        );
        let config = config_res.unwrap();

        assert!(config.database.url.username.is_none());
        assert!(config.database.url.password.is_none());
    }

    // PRD Reference: 0001
    #[test]
    fn test_config_load_with_env_vars() {
        let _lock = ENV_MUTEX.lock().unwrap();
        unsafe {
            env::set_var("SP_BE__DATABASE__URL__USERNAME", "envuser");
            env::set_var("SP_BE__DATABASE__URL__PASSWORD", "envpass");
        }

        let config = AppConfig::load(
            std::path::Path::new("config/default.yaml"),
            std::path::Path::new("config"),
        )
        .unwrap();

        unsafe {
            env::remove_var("SP_BE__DATABASE__URL__USERNAME");
            env::remove_var("SP_BE__DATABASE__URL__PASSWORD");
        }

        assert_eq!(config.database.url.username.as_deref(), Some("envuser"));
        assert_eq!(config.database.url.password.as_deref(), Some("envpass"));
    }

    // PRD Reference: 0001
    #[test]
    fn test_config_load_with_file_secrets() {
        let _lock = ENV_MUTEX.lock().unwrap();
        use std::fs;
        use std::io::Write;

        let test_dir = std::path::Path::new("test_secrets_dir_final");
        if test_dir.exists() {
            fs::remove_dir_all(test_dir).unwrap();
        }
        fs::create_dir_all(test_dir).unwrap();
        let test_dir = fs::canonicalize(test_dir).unwrap();

        fs::write(test_dir.join("db_user"), "fileuser").unwrap();
        fs::write(test_dir.join("db_pass"), "filepass").unwrap();

        let test_config_path = test_dir.join("config.yaml");
        let mut file = fs::File::create(&test_config_path).unwrap();
        writeln!(file, "database:").unwrap();
        writeln!(file, "  url:").unwrap();
        writeln!(file, "    url: postgres://localhost:5432/db").unwrap();
        writeln!(file, "    username_file: db_user").unwrap();
        writeln!(file, "    password_file: db_pass").unwrap();
        writeln!(file, "  max_connections: 10").unwrap();
        writeln!(file, "webservice:").unwrap();
        writeln!(file, "  address: http://0.0.0.0:8080").unwrap();
        writeln!(file, "  forwarding_headers: []").unwrap();
        writeln!(file, "  cors:").unwrap();
        writeln!(file, "    allow_origins: []").unwrap();
        writeln!(file, "    allow_methods: ['GET', 'POST']").unwrap();
        writeln!(file, "    allow_headers: ['content-type']").unwrap();
        writeln!(file, "  timeout: 30s").unwrap();
        writeln!(file, "  max_connections: 100").unwrap();
        writeln!(file, "hams:").unwrap();
        writeln!(file, "  name: test").unwrap();
        writeln!(file, "  version: 0.1.0").unwrap();
        writeln!(file, "  address: 0.0.0.0:8079").unwrap();
        writeln!(file, "startup_checks:").unwrap();
        writeln!(file, "  fails: 1").unwrap();
        writeln!(file, "  timeout: 1s").unwrap();
        writeln!(file, "  enabled: false").unwrap();
        writeln!(file, "runtime:").unwrap();
        writeln!(file, "  threads: 0").unwrap();
        writeln!(file, "  stack_size: 3000000").unwrap();
        writeln!(file, "  name: default").unwrap();
        writeln!(file, "debugging:").unwrap();
        writeln!(file, "  fail_debug_delay: 0s").unwrap();
        writeln!(file, "  environment: testing").unwrap();
        writeln!(file, "  enable_dev_auth: false").unwrap();
        writeln!(file, "  log_level: info").unwrap();
        writeln!(file, "spatial:").unwrap();
        writeln!(file, "  official_boundary_api_url: https://api.example.com").unwrap();
        writeln!(file, "  official_boundary_api_key: secretkey").unwrap();

        let config = AppConfig::load(&test_config_path, &test_dir).unwrap();

        assert_eq!(config.database.url.username.as_deref(), Some("fileuser"));
        assert_eq!(config.database.url.password.as_deref(), Some("filepass"));

        // Cleanup
        fs::remove_dir_all(test_dir).unwrap();
    }
}
