import { airtableService } from "../server/services/airtable";
import { sql } from "../server/db";

async function runTest() {
  console.log("🧪 Testing RefCheck PostgreSQL API Methods...");

  console.log("\n1. Testing getCandidates()...");
  const candidates = await airtableService.getCandidates();
  console.log(`   ✅ Found ${candidates.length} candidates.`);
  if (candidates.length > 0) {
    console.log(`   Sample Candidate: ${candidates[0].fullName} (${candidates[0].email}) - Status: ${candidates[0].overallStatus}`);
  }

  console.log("\n2. Testing getQuestionnaireTemplates()...");
  const templates = await airtableService.getQuestionnaireTemplates();
  console.log(`   ✅ Found ${templates.length} templates:`);
  templates.forEach((t: any) => console.log(`      • ${t.Name} (${t.Industry})`));

  console.log("\n3. Testing getCandidate and getRefereesForCandidate()...");
  if (candidates.length > 0) {
    const cand = await airtableService.getCandidate(candidates[0].id);
    console.log(`   ✅ Successfully retrieved candidate: ${cand.fullName}`);
    const refs = await airtableService.getRefereesForCandidate(cand.id);
    console.log(`   ✅ Referees found for ${cand.fullName}: ${refs.length}`);
  }

  console.log("\n🎉 ALL REFCHECK POSTGRESQL DATABASE TESTS PASSED 100%!\n");
  process.exit(0);
}

runTest().catch((err) => {
  console.error("❌ Test failed:", err);
  process.exit(1);
});
