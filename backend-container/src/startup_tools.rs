//! Startup tools and database pre-flight connection checks.
//!
//! Provides configurable retry execution logic for application startup verification tasks.

use std::future::Future;

use futures::FutureExt;
use tracing::{info, warn};

use crate::{
    config::{AppConfig, StartupCheckConfig},
    error::AppError,
};

/// Executes an asynchronous check with a retry mechanism.
///
/// This function repeatedly calls the `make_future` closure to generate and await a future
/// until it succeeds or the maximum number of attempts specified in `config` is reached.
/// It waits for the duration specified in `config.timeout` between failed attempts.
///
/// # Arguments
///
/// * `name` - A descriptive name for the check, used in logging and error messages.
/// * `config` - Configuration defining the number of retries and the timeout between them.
/// * `make_future` - A closure that produces the future to be executed for each attempt.
///
/// # Errors
///
/// Returns `AppError` if the check fails after all configured attempts.
// No obvious PRD requirement
pub async fn run_check<G, F, T>(
    name: String,
    config: &StartupCheckConfig,
    mut make_future: G,
) -> Result<T, AppError>
where
    G: FnMut() -> F, // G is a generator that creates futures
    F: Future<Output = Result<T, AppError>>,
{
    info!("Running check: {name}");

    let mut attempts_remaining = config.fails;

    while attempts_remaining > 0 {
        // Call the closure to get a fresh future instance for this attempt
        match make_future().await {
            Ok(reply) => {
                info!("Check passed: {name}");
                return Ok(reply);
            }
            Err(err) => {
                warn!(
                    "Check failed: {name}, error= {err} rerunning in {:?}",
                    config.timeout
                );
            }
        }

        attempts_remaining -= 1;
        if attempts_remaining > 0 {
            warn!(
                "Check failed: {name}, {attempts_remaining} attempts remaining, rerunning in {:?}",
                config.timeout
            );
            tokio::time::sleep(config.timeout).await;
        }
    }

    Err(AppError::Message(format!(
        "Check {} failed after {} attempts",
        name, config.fails
    )))
}

/// Runs all pre-flight startup checks including PostgreSQL database connectivity checks.
///
/// # Arguments
///
/// * `config` - Loaded application configuration.
/// * `db_pool` - Connection pool to PostgreSQL.
///
/// # Errors
///
/// Returns [`AppError`] if any pre-flight check fails after retries.
// PRD Reference: 0001
pub async fn run_startup_checks(
    config: &AppConfig,
    db_pool: &sqlx::PgPool,
) -> Result<(), AppError> {
    let _checks_config = &config.startup_checks;
    let mut futures = Vec::new();

    let pool_clone = db_pool.clone();
    futures.push(
        run_check(
            "Database Connectivity Check".to_string(),
            &config.startup_checks,
            move || {
                let pool = pool_clone.clone();
                async move {
                    pool.acquire()
                        .await
                        .map_err(|e| AppError::Message(format!("DB Check Failed: {}", e)))?;
                    Ok::<(), AppError>(())
                }
            },
        )
        .boxed(),
    );

    futures::future::try_join_all(futures).await?;

    info!("All startup checks passed.");

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::{Arc, Mutex};
    use std::time::Duration;

    // PRD Reference: 0001
    #[tokio::test]
    async fn test_run_check_success_first_try() {
        let config = StartupCheckConfig {
            fails: 3,
            timeout: Duration::from_millis(1),
            enabled: true,
        };

        let result = run_check("test".to_string(), &config, || async {
            Ok::<i32, AppError>(42)
        })
        .await;

        assert_eq!(result.unwrap(), 42);
    }

    // PRD Reference: 0001
    #[tokio::test]
    async fn test_run_check_success_after_retries() {
        let config = StartupCheckConfig {
            fails: 3,
            timeout: Duration::from_millis(1),
            enabled: true,
        };

        let attempts = Arc::new(Mutex::new(0));
        let attempts_clone = attempts.clone();

        let result = run_check("test".to_string(), &config, || {
            let attempts = attempts_clone.clone();
            async move {
                let mut attempts = attempts.lock().unwrap();
                *attempts += 1;
                if *attempts < 3 {
                    Err(AppError::Message("fail".to_string()))
                } else {
                    Ok::<i32, AppError>(42)
                }
            }
        })
        .await;

        assert_eq!(result.unwrap(), 42);
        assert_eq!(*attempts.lock().unwrap(), 3);
    }

    // PRD Reference: 0001
    #[tokio::test]
    async fn test_run_check_failure() {
        let config = StartupCheckConfig {
            fails: 3,
            timeout: Duration::from_millis(1),
            enabled: true,
        };

        let attempts = Arc::new(Mutex::new(0));
        let attempts_clone = attempts.clone();

        let result = run_check("test".to_string(), &config, || {
            let attempts = attempts_clone.clone();
            async move {
                let mut attempts = attempts.lock().unwrap();
                *attempts += 1;
                Err::<i32, AppError>(AppError::Message("fail".to_string()))
            }
        })
        .await;

        match result {
            Err(AppError::Message(msg)) => assert_eq!(msg, "Check test failed after 3 attempts"),
            _ => panic!("Expected AppError::Message"),
        }
        assert_eq!(*attempts.lock().unwrap(), 3);
    }
}
