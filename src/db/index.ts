import { drizzle, type MySql2Database } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";

let _db: MySql2Database<Record<string, never>> | null = null;
let _pool: mysql.Pool | null = null;

function getConnectionConfig(): mysql.PoolOptions {
  return {
    host: process.env.DATABASE_HOST || "127.0.0.1",
    port: Number(process.env.DATABASE_PORT) || 3306,
    user: process.env.DATABASE_USER || "root",
    password: process.env.DATABASE_PASSWORD || "",
    database: process.env.DATABASE_NAME || "memory_os",
    // Connection pool limits — prevent unbounded connections
    connectionLimit: Number(process.env.DATABASE_POOL_SIZE) || 10,
    // Timeouts — prevent hanging queries
    connectTimeout: 10_000,  // 10s to establish connection
    waitForConnections: true,
    queueLimit: 0,           // unlimited queue (connections wait)
    // Idle timeout — close idle connections after 60s
    idleTimeout: 60_000,
    // Enable keep-alive to detect dead connections
    enableKeepAlive: true,
  };
}

export async function getDb(): Promise<MySql2Database<Record<string, never>>> {
  if (!_db) {
    _pool = mysql.createPool(getConnectionConfig());
    _db = drizzle(_pool);
  }
  return _db;
}

/**
 * Gracefully close the MySQL connection pool.
 * Call this on server shutdown (e.g. SIGTERM handler).
 */
export async function closeDb(): Promise<void> {
  if (_pool) {
    await _pool.end();
    _pool = null;
    _db = null;
  }
}
