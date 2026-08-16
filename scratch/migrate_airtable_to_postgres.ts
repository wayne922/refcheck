import Airtable from "airtable";
import dotenv from "dotenv";
import { sql, initRefCheckDb } from "../server/db";

dotenv.config();

const API_KEY = process.env.AIRTABLE_API_KEY || process.env.AIRTABLE_PAT;
const BASE_ID = process.env.AIRTABLE_BASE_ID;

if (!API_KEY || !BASE_ID) {
  console.error("❌ Missing AIRTABLE_API_KEY or AIRTABLE_BASE_ID.");
  process.exit(1);
}

Airtable.configure({ apiKey: API_KEY });
const base = Airtable.base(BASE_ID);

const TABLES_TO_MIGRATE = [
  "Employers",
  "Users",
  "Candidates",
  "Referees",
  "Questionnaire_Templates",
  "Referee_Responses",
  "AI_Logs",
  "Audit_Logs",
  "Packages"
];

async function migrate() {
  console.log("🚀 Starting RefCheck Airtable -> PostgreSQL Data Migration...");
  await initRefCheckDb();

  const results: Record<string, number> = {};

  for (const tableName of TABLES_TO_MIGRATE) {
    console.log(`\n📦 Fetching all records from Airtable table: '${tableName}'...`);
    try {
      const records = await base(tableName).select().all();
      console.log(`   Found ${records.length} records in Airtable '${tableName}'. Migrating to Postgres...`);
      
      let count = 0;
      for (const rec of records) {
        const fields = rec.fields;
        const id = rec.id;
        
        await sql`
          INSERT INTO refcheck_records (id, table_name, fields, updated_time)
          VALUES (${id}, ${tableName}, ${JSON.stringify(fields)}, NOW())
          ON CONFLICT (id) DO UPDATE SET
            fields = EXCLUDED.fields,
            updated_time = NOW();
        `;
        count++;
      }
      
      results[tableName] = count;
      console.log(`   ✅ Successfully migrated ${count} records for '${tableName}'.`);
    } catch (err: any) {
      if (err.message?.includes("Could not find table")) {
        console.log(`   ℹ️ Table '${tableName}' does not exist in Airtable base. Skipping.`);
        results[tableName] = 0;
      } else {
        console.error(`   ❌ Error migrating '${tableName}':`, err.message);
        results[tableName] = -1;
      }
    }
  }

  console.log("\n=======================================================");
  console.log("🎉 REFCHECK MIGRATION COMPLETE! SUMMARY OF ROWS:");
  console.log("=======================================================");
  for (const [t, cnt] of Object.entries(results)) {
    console.log(`  • ${t.padEnd(26)} : ${cnt >= 0 ? `${cnt} rows` : "FAILED"}`);
  }
  console.log("=======================================================\n");

  const totalInDb = await sql`SELECT COUNT(*)::int FROM refcheck_records;`;
  console.log(`Total active RefCheck records in PostgreSQL: ${totalInDb[0].count}`);

  process.exit(0);
}

migrate().catch((err) => {
  console.error("Fatal migration error:", err);
  process.exit(1);
});
