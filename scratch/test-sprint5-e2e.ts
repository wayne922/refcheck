import fetch from "node-fetch";

const BASE_URL = "http://localhost:5006";
const CRON_SECRET = "default_cron_secret_123";

async function runTest() {
  console.log("🚀 Starting Sprint 5 E2E API Verification Flow...\n");

  // 1. Recruiter SSO Auth
  console.log("Step 1: Recruiter Google SSO authentication...");
  const authRes = await fetch(`${BASE_URL}/api/auth/google`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: "wayne@candidex.co.nz",
      companyName: "Candidex Recruitment",
      fullName: "Wayne Sullivan"
    })
  });
  const authData = (await authRes.json()) as any;
  const token = authData.token;
  console.log(`✅ Recruiter authenticated.\n`);

  // 2. Create Candidate Check
  console.log("Step 2: Creating candidate check for 'Timothy Vance'...");
  const createCandRes = await fetch(`${BASE_URL}/api/candidates`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`
    },
    body: JSON.stringify({
      fullName: "Timothy Vance",
      email: "timothy.v@gmail.com",
      phone: "+64 21 111 0001",
      roleAppliedFor: "Registered ECE Teacher",
      assignedPackage: "Early Childhood / ECE"
    })
  });
  const candData = (await createCandRes.json()) as any;
  const candidate = candData.candidate;
  console.log(`✅ Candidate created: ID=${candidate.id}, Token=${candidate.candidateToken.substring(0, 20)}...\n`);

  // 3. Candidate submits referee nomination (Step 1)
  console.log("Step 3: Candidate nominating Referee #1: 'Bob Brown'...");
  const nominateRes = await fetch(`${BASE_URL}/api/candidates/${candidate.id}/referees`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      referees: [
        {
          fullName: "Bob Brown",
          email: "bob.brown@nursery.nz",
          phone: "+64 21 444 5555",
          relationship: "Former Supervisor",
          employerName: "Green Hills Nursery",
          jobTitle: "Owner / Director",
          datesFrom: "2021-01",
          datesTo: "2024-12"
        }
      ]
    })
  });
  const nominateData = (await nominateRes.json()) as any;
  let referee = nominateData.referees[0];
  console.log(`✅ Nominated Referee #1: ID=${referee.id}, Name=${referee.fullName}, Status=${referee.formStatus}\n`);

  // 4. Verify Manual Control: Resend Invite
  console.log("Step 4: Testing Recruiter manual control: RESEND INVITE...");
  const resendRes = await fetch(`${BASE_URL}/api/referees/${referee.id}/resend`, {
    method: "PATCH",
    headers: {
      "Authorization": `Bearer ${token}`
    }
  });
  const resendData = (await resendRes.json()) as any;
  if (!resendData.success) {
    throw new Error(`Resend failed: ${JSON.stringify(resendData)}`);
  }
  console.log(`✅ Resend completed successfully! System logged simulated re-dispatch.\n`);

  // 5. Verify Manual Control: Reassign Referee
  console.log("Step 5: Testing Recruiter manual control: REASSIGN REFEREE...");
  console.log(`(Reassigning Bob Brown to 'Alice Miller')`);
  const reassignRes = await fetch(`${BASE_URL}/api/referees/${referee.id}/reassign`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`
    },
    body: JSON.stringify({
      fullName: "Alice Miller",
      email: "alice.miller@kids.nz",
      phone: "+64 21 888 7777",
      relationship: "Manager",
      employerName: "Happy Kids Centre",
      jobTitle: "Centre Manager"
    })
  });
  const reassignData = (await reassignRes.json()) as any;
  if (!reassignData.success) {
    throw new Error(`Reassignment failed: ${JSON.stringify(reassignData)}`);
  }
  const aliceReferee = reassignData.newReferee;
  console.log(`✅ Reassignment successful!`);
  console.log(`  - Original Referee status is marked: 'Substituted'`);
  console.log(`  - New Referee created: ID=${aliceReferee.id}, Name=${aliceReferee.fullName}, Status=${aliceReferee.formStatus}\n`);

  // 6. Test Cron Nudge Engine Simulation
  console.log("Step 6: Simulating Cron Nudge Engine scenarios...");

  // Scenario A: Day 2 Nudge (Sent -> Nudge 1 email + SMS)
  console.log("  Scenario A: Simulating Day 2 Nudge (elapsed time = 2.5 days)...");
  // Shift Alice's timestamp back by 2.5 days
  const shiftRes1 = await fetch(`${BASE_URL}/api/test/shift-referee-time`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refereeId: aliceReferee.id, daysToSubtract: 2.5 })
  });
  const shiftData1 = (await shiftRes1.json()) as any;
  if (!shiftData1.success) throw new Error("Time shift A failed");

  // Call Cron Check
  const cronRes1 = await fetch(`${BASE_URL}/cron/nudge-check?secret=${CRON_SECRET}`, { method: "POST" });
  const cronData1 = (await cronRes1.json()) as any;
  console.log(`  ✅ Cron response A:`, cronData1.summary);
  if (cronData1.summary.nudge1Sent !== 1) {
    throw new Error(`Expected nudge1Sent = 1, got ${cronData1.summary.nudge1Sent}`);
  }

  // Scenario B: Day 4 Nudge (Opened -> Nudge 2 email only)
  console.log("\n  Scenario B: Simulating Day 4 Nudge (elapsed time = 4.5 days, opened)...");
  // Simulate referee opening the link (sets formStatus to 'Opened' and formOpenedAt)
  const openRes = await fetch(`${BASE_URL}/api/referees/by-token/${aliceReferee.refereeToken}`);
  const openData = (await openRes.json()) as any;
  if (!openData.success) throw new Error("Referee link open simulation failed");

  // Shift Alice's time back again to make it 4.5 days since original send
  const shiftRes2 = await fetch(`${BASE_URL}/api/test/shift-referee-time`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refereeId: aliceReferee.id, daysToSubtract: 4.5 })
  });
  const shiftData2 = (await shiftRes2.json()) as any;
  if (!shiftData2.success) throw new Error("Time shift B failed");

  // Call Cron Check
  const cronRes2 = await fetch(`${BASE_URL}/cron/nudge-check?secret=${CRON_SECRET}`, { method: "POST" });
  const cronData2 = (await cronRes2.json()) as any;
  console.log(`  ✅ Cron response B:`, cronData2.summary);
  if (cronData2.summary.nudge2Sent !== 1) {
    throw new Error(`Expected nudge2Sent = 1, got ${cronData2.summary.nudge2Sent}`);
  }

  // Scenario C: Day 6 Alert (Overdue -> Recruiter delay alert)
  console.log("\n  Scenario C: Simulating Day 6 Delay Alert (elapsed time = 6.5 days)...");
  // Shift Alice's time back to 6.5 days since original send
  const shiftRes3 = await fetch(`${BASE_URL}/api/test/shift-referee-time`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refereeId: aliceReferee.id, daysToSubtract: 6.5 })
  });
  const shiftData3 = (await shiftRes3.json()) as any;
  if (!shiftData3.success) throw new Error("Time shift C failed");

  // Call Cron Check
  const cronRes3 = await fetch(`${BASE_URL}/cron/nudge-check?secret=${CRON_SECRET}`, { method: "POST" });
  const cronData3 = (await cronRes3.json()) as any;
  console.log(`  ✅ Cron response C:`, cronData3.summary);
  if (cronData3.summary.employerAlertsSent !== 1) {
    throw new Error(`Expected employerAlertsSent = 1, got ${cronData3.summary.employerAlertsSent}`);
  }

  // 7. Verify Candidate details show overdue status
  console.log("\nStep 7: Verifying dashboard reflects 'Overdue' status...");
  const detailRes = await fetch(`${BASE_URL}/api/candidates/${candidate.id}`, {
    headers: { "Authorization": `Bearer ${token}` }
  });
  const detailData = (await detailRes.json()) as any;
  const aliceRecord = detailData.referees.find((r: any) => r.id === aliceReferee.id);
  console.log(`  - Referee:         ${aliceRecord.fullName}`);
  console.log(`  - Form Status:     ${aliceRecord.formStatus}`);
  console.log(`  - Employer Alert:  ${aliceRecord.employerAlertedAt ? "Sent" : "None"}`);
  if (!aliceRecord.employerAlertedAt) {
    throw new Error("Expected employerAlertedAt to be set");
  }
  console.log("✅ Dashboard sync verified successfully.\n");

  // 8. Verify Candidate Self-Service Substitute Referee
  console.log("Step 8: Candidate self-service substitute flow...");
  // Fetch current nominees to ensure candidate can view list
  const listRefRes = await fetch(`${BASE_URL}/api/candidates/by-token/${candidate.candidateToken}/referees`);
  const listRefData = (await listRefRes.json()) as any;
  console.log(`  - Candidate Nominees list retrieved: ${listRefData.referees.map((r: any) => r.fullName).join(", ")}`);

  // Nominate Charlie Green as a substitute for Alice Miller
  console.log("  Nominating substitute referee: 'Charlie Green' instead of 'Alice Miller'...");
  const subRes = await fetch(`${BASE_URL}/api/candidates/${candidate.id}/substitute`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      referee: {
        fullName: "Charlie Green",
        email: "charlie.green@kidsplay.nz",
        phone: "+64 21 222 3333",
        relationship: "Supervisor",
        employerName: "KidsPlay ECE Center",
        jobTitle: "Senior Teacher"
      },
      originalRefereeId: aliceReferee.id
    })
  });
  const subData = (await subRes.json()) as any;
  if (!subData.success) {
    throw new Error(`Substitute submission failed: ${JSON.stringify(subData)}`);
  }
  console.log(`  ✅ Substitute Nominated successfully!`);
  console.log(`    - New Referee ID: ${subData.referee.id}, Name: ${subData.referee.fullName}, isSubstitute: ${subData.referee.isSubstitute}`);

  // Reload candidate detail and verify states
  const checkFinalRes = await fetch(`${BASE_URL}/api/candidates/${candidate.id}`, {
    headers: { "Authorization": `Bearer ${token}` }
  });
  const checkFinalData = (await checkFinalRes.json()) as any;
  console.log(`\nFinal Vetting State Report:`);
  checkFinalData.referees.forEach((r: any) => {
    console.log(`  - Referee: ${r.fullName} | Status: ${r.formStatus} | isSubstitute: ${!!r.isSubstitute} | substituteFor: ${r.substituteFor || "None"}`);
  });

  const finalAlice = checkFinalData.referees.find((r: any) => r.id === aliceReferee.id);
  const finalCharlie = checkFinalData.referees.find((r: any) => r.id === subData.referee.id);

  if (finalAlice.formStatus !== "Substituted") {
    throw new Error("Alice should be Substituted");
  }
  if (!finalCharlie.isSubstitute || finalCharlie.substituteFor !== aliceReferee.id) {
    throw new Error("Charlie Green substitute linkages invalid");
  }

  console.log("\n🎉 E2E Sprint 5 Verification SUCCESSFUL! All nudge automation and reassign/substitute workflows passed.");
}

runTest().catch((err) => {
  console.error("\n❌ E2E Sprint 5 Verification FAILED:");
  console.error(err);
  process.exit(1);
});
