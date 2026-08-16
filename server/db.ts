import postgres from "postgres";
import dotenv from "dotenv";

dotenv.config();

const connectionString = process.env.DATABASE_URL || "postgresql://postgres:postgres@localhost:5432/postgres";

export const sql = postgres(connectionString, {
  max: 10,
  idle_timeout: 20,
  connect_timeout: 10,
  ssl: { rejectUnauthorized: false }
});

export async function initRefCheckDb() {
  try {
    console.log("[Postgres RefCheck] Initializing database schema...");
    
    // Universal JSONB document table for RefCheck records
    await sql`
      CREATE TABLE IF NOT EXISTS refcheck_records (
        id TEXT PRIMARY KEY,
        table_name TEXT NOT NULL,
        fields JSONB NOT NULL,
        created_time TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_time TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `;
    
    await sql`CREATE INDEX IF NOT EXISTS idx_refcheck_table_name ON refcheck_records(table_name);`;
    await sql`CREATE INDEX IF NOT EXISTS idx_refcheck_fields ON refcheck_records USING gin (fields);`;
    
    console.log("[Postgres RefCheck] Schema initialized successfully.");
  } catch (err: any) {
    console.error("[Postgres RefCheck] Error initializing database schema:", err.message);
  }
}
