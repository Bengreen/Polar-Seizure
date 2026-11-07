//! Tokio async runtime configuration and helper utilities.
//!
//! Provides utilities for constructing Tokio runtimes (single-threaded or multi-threaded)
//! and executing asynchronous futures with optional cancellation token support.

use crate::error::AppError;
use futures::Future;
use tracing::{error, info};

use serde::{Deserialize, Serialize};
use tokio::runtime::{self, Runtime};
use tokio_util::sync::CancellationToken;

/// Configuration for creating a Tokio runtime instance.
#[derive(Deserialize, Serialize, Debug, Clone)]
pub struct ThreadRuntime {
    /// Number of worker threads (0 for single-threaded runtime).
    pub threads: usize,
    /// Thread stack size in bytes.
    pub stack_size: usize,
    /// Name prefix assigned to worker threads.
    pub name: String,
}

impl Default for ThreadRuntime {
    // References more than 3 PRDs
    fn default() -> Self {
        ThreadRuntime {
            threads: 0,
            stack_size: 3_000_000,
            name: "default".into(),
        }
    }
}

/// Builds a Tokio [`Runtime`] based on the provided [`ThreadRuntime`] configuration.
///
/// # Errors
///
/// Returns [`AppError`] if constructing the Tokio runtime fails.
// PRD Reference: 0001
pub fn rt_multithreaded(runtime: &ThreadRuntime) -> Result<Runtime, AppError> {
    if runtime.threads == 0 {
        runtime::Builder::new_current_thread()
            .enable_io()
            .enable_time()
            .build()
            .map_err(AppError::from)
    } else {
        runtime::Builder::new_multi_thread()
            .worker_threads(runtime.threads)
            .thread_name(runtime.name.clone())
            .thread_stack_size(runtime.stack_size)
            .enable_io()
            .enable_time()
            .build()
            .map_err(AppError::from)
    }
}

/// run async function inside tokio instance on current thread
// No obvious PRD requirement
pub fn run_in_tokio<F, T>(runtime: &ThreadRuntime, my_function: F) -> F::Output
where
    F: Future<Output = Result<T, AppError>>,
{
    info!("Starting Tokio: {}", runtime.name);

    rt_multithreaded(runtime)?
        // .expect("Runtime created")
        .block_on(my_function)
}

/// Run async with cancellability via CancellationToken
// No obvious PRD requirement
pub fn run_in_tokio_with_cancel<F, T>(
    runtime: &ThreadRuntime,
    cancel: CancellationToken,
    my_function: F,
) -> F::Output
where
    F: Future<Output = Result<T, AppError>>,
{
    run_in_tokio(runtime, async {
        tokio::select! {
            _ = cancel.cancelled() => {
                error!("Token cancelled");
                Err(AppError::Cancelled)
            },
            z = my_function => {
                info!("Completed function");
                z
            },
        }
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::Duration;
    use tokio::time::sleep;

    // PRD Reference: 0001
    #[test]
    fn test_rt_multithreaded_current_thread() {
        let runtime = ThreadRuntime {
            threads: 0,
            stack_size: 2_000_000,
            name: "test-current".into(),
        };
        let rt = rt_multithreaded(&runtime).expect("Failed to build current thread runtime");
        let result = rt.block_on(async { 42 });
        assert_eq!(result, 42);
    }

    // PRD Reference: 0001
    #[test]
    fn test_rt_multithreaded_multi_thread() {
        let runtime = ThreadRuntime {
            threads: 2,
            stack_size: 2_000_000,
            name: "test-multi".into(),
        };
        let rt = rt_multithreaded(&runtime).expect("Failed to build multi-thread runtime");
        let result = rt.block_on(async { 42 });
        assert_eq!(result, 42);
    }

    // PRD Reference: 0001
    #[test]
    fn test_run_in_tokio_success() {
        let runtime = ThreadRuntime::default();
        let result = run_in_tokio(&runtime, async { Ok::<i32, AppError>(100) });
        assert!(result.is_ok());
        assert_eq!(result.unwrap(), 100);
    }

    // PRD Reference: 0001
    #[test]
    fn test_run_in_tokio_with_cancel_success() {
        let runtime = ThreadRuntime::default();
        let cancel = CancellationToken::new();

        let result = run_in_tokio_with_cancel(&runtime, cancel, async { Ok::<i32, AppError>(200) });

        assert!(result.is_ok());
        assert_eq!(result.unwrap(), 200);
    }

    // PRD Reference: 0001
    #[test]
    fn test_run_in_tokio_with_cancel_cancelled() {
        let runtime = ThreadRuntime::default();
        let cancel = CancellationToken::new();
        let cancel_clone = cancel.clone();

        let result = run_in_tokio_with_cancel(&runtime, cancel, async move {
            cancel_clone.cancel();
            sleep(Duration::from_millis(50)).await;
            Ok::<i32, AppError>(300)
        });

        assert!(result.is_err());
        match result.unwrap_err() {
            AppError::Cancelled => (), // Expected
            _ => panic!("Expected AppError::Cancelled"),
        }
    }
}
