use sqlx::postgres::PgPoolOptions;
use std::time::Instant;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    dotenv::dotenv().ok();
    let db_url = std::env::var("DATABASE_URL").unwrap_or_else(|_| "postgres://postgres:postgres@localhost:5432/sward".to_string());
    let pool = PgPoolOptions::new().max_connections(5).connect(&db_url).await?;

    // Setup: ensure some modules exist and a test user
    sqlx::query("INSERT INTO modules (name, description) VALUES ('mod1', 'desc1'), ('mod2', 'desc2'), ('mod3', 'desc3'), ('mod4', 'desc4'), ('mod5', 'desc5') ON CONFLICT (name) DO NOTHING").execute(&pool).await?;
    let user_id: i64 = sqlx::query_scalar("INSERT INTO users (name, email, role) VALUES ('bench user', 'bench@example.com', 'user') RETURNING id").fetch_one(&pool).await?;

    let modules = vec!["mod1".to_string(), "mod2".to_string(), "mod3".to_string(), "mod4".to_string(), "mod5".to_string()];

    // Benchmark N+1
    let start_n1 = Instant::now();
    for _ in 0..100 {
        let mut tx = pool.begin().await?;
        sqlx::query("DELETE FROM user_modules WHERE user_id = $1").bind(user_id).execute(&mut *tx).await?;
        for module in &modules {
            sqlx::query("INSERT INTO user_modules (user_id, module_id) SELECT $1, id FROM modules WHERE name = $2")
                .bind(user_id)
                .bind(module)
                .execute(&mut *tx)
                .await?;
        }
        tx.commit().await?;
    }
    let duration_n1 = start_n1.elapsed();
    println!("N+1 query time for 100 updates: {:?}", duration_n1);

    // Benchmark Bulk Insert
    let start_bulk = Instant::now();
    for _ in 0..100 {
        let mut tx = pool.begin().await?;
        sqlx::query("DELETE FROM user_modules WHERE user_id = $1").bind(user_id).execute(&mut *tx).await?;
        sqlx::query("INSERT INTO user_modules (user_id, module_id) SELECT $1, id FROM modules WHERE name = ANY($2)")
            .bind(user_id)
            .bind(&modules)
            .execute(&mut *tx)
            .await?;
        tx.commit().await?;
    }
    let duration_bulk = start_bulk.elapsed();
    println!("Bulk insert query time for 100 updates: {:?}", duration_bulk);

    // Cleanup
    sqlx::query("DELETE FROM users WHERE id = $1").bind(user_id).execute(&pool).await?;

    Ok(())
}
