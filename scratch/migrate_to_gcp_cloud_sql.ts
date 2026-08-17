import postgres from "postgres";

const SUPABASE_URL = "postgresql://postgres.wmrnukcrfvaypfkqhelx:C%40ndidex%21978@aws-1-ap-southeast-2.pooler.supabase.com:5432/postgres";
const GCP_CLOUDSQL_URL = "postgresql://postgres:C%40ndidex%21978@34.151.99.147:5432/postgres?sslmode=disable";

async function migrateToGcpCloudSql() {
  console.log("🚀 Migrating all data from Supabase to Google Cloud SQL (34.151.99.147)...\n");

  const src = postgres(SUPABASE_URL);
  const dest = postgres(GCP_CLOUDSQL_URL);

  // 1. Initialize Tables in Google Cloud SQL
  console.log("1. Creating tables in Google Cloud SQL if they do not exist...");
  await dest`
    CREATE TABLE IF NOT EXISTS refcheck_records (
      id VARCHAR(255) PRIMARY KEY,
      table_name VARCHAR(100) NOT NULL,
      fields JSONB NOT NULL,
      created_time TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      updated_time TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );
  `;
  await dest`CREATE INDEX IF NOT EXISTS idx_gcp_refcheck_table_name ON refcheck_records(table_name);`;

  await dest`
    CREATE TABLE IF NOT EXISTS crm_records (
      id VARCHAR(255) PRIMARY KEY,
      table_id VARCHAR(100) NOT NULL,
      fields JSONB NOT NULL,
      created_time TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );
  `;
  await dest`CREATE INDEX IF NOT EXISTS idx_gcp_crm_records_table_id ON crm_records(table_id);`;
  console.log("   ✅ Target tables created successfully on Google Cloud SQL.");

  // 2. Transfer refcheck_records
  console.log("\n2. Migrating 'refcheck_records'...");
  const refRecords = await src`SELECT id, table_name, fields, created_time, updated_time FROM refcheck_records;`;
  console.log(`   Found ${refRecords.length} records in Supabase. Inserting into Google Cloud SQL...`);
  
  for (const r of refRecords) {
    await dest`
      INSERT INTO refcheck_records (id, table_name, fields, created_time, updated_time)
      VALUES (${r.id}, ${r.table_name}, ${JSON.stringify(r.fields)}, ${r.created_time || new Date()}, ${r.updated_time || new Date()})
      ON CONFLICT (id) DO UPDATE SET fields = EXCLUDED.fields, updated_time = NOW();
    `;
  }
  console.log(`   ✅ Transferred ${refRecords.length} refcheck records to Google Cloud SQL.`);

  // 3. Transfer crm_records
  console.log("\n3. Migrating 'crm_records'...");
  const crmRecs = await src`SELECT id, table_id, fields, created_time FROM crm_records;`;
  console.log(`   Found ${crmRecs.length} records in Supabase. Inserting into Google Cloud SQL...`);

  for (const r of crmRecs) {
    await dest`
      INSERT INTO crm_records (id, table_id, fields, created_time)
      VALUES (${r.id}, ${r.table_id}, ${JSON.stringify(r.fields)}, ${r.created_time || new Date()})
      ON CONFLICT (id) DO UPDATE SET fields = EXCLUDED.fields;
    `;
  }
  console.log(`   ✅ Transferred ${crmRecs.length} CRM records to Google Cloud SQL.`);

  // 4. Verify Row Counts on Google Cloud SQL
  const refCount = await dest`SELECT count(*) FROM refcheck_records;`;
  const crmCount = await dest`SELECT count(*) FROM crm_records;`;

  console.log("\n=======================================================");
  console.log("🎉 GOOGLE CLOUD SQL MIGRATION COMPLETE!");
  console.log("=======================================================");
  console.log(`  • refcheck_records on GCP Cloud SQL : ${refCount[0].count} rows`);
  console.log(`  • crm_records on GCP Cloud SQL      : ${crmCount[0].count} rows`);
  console.log("=======================================================\n");

  await src.end();
  await dest.end();
  process.exit(0);
}

migrateToGcpCloudSql().catch((e) => {
  console.error("Migration error:", e);
  process.exit(1);
});
