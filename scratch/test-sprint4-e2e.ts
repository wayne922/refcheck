import fetch from "node-fetch";

const BASE_URL = "http://localhost:5006";

async function runTest() {
  console.log("🚀 Starting Sprint 4 E2E API Verification Flow...\n");

  // 1. Recruiter Auth / Google SSO
  console.log("Step 1: Simulating Recruiter Google SSO authentication...");
  const authRes = await fetch(`${BASE_URL}/api/auth/google`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: "wayne@refcheck.tech",
      companyName: "RefCheck Recruitment",
      fullName: "Wayne Sullivan"
    })
  });

  const authData = (await authRes.json()) as any;
  if (!authData.success) {
    throw new Error(`Auth failed: ${JSON.stringify(authData)}`);
  }
  const token = authData.token;
  console.log(`✅ Authentication successful! JWT: ${token.substring(0, 25)}...\n`);

  // 2. Create Candidate Check
  console.log("Step 2: Creating a new Candidate check for 'John Smith'...");
  const createCandRes = await fetch(`${BASE_URL}/api/candidates`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`
    },
    body: JSON.stringify({
      fullName: "John Smith",
      email: "john.smith@gmail.com",
      phone: "+64 21 000 0001",
      roleAppliedFor: "ECE Qualified Teacher",
      assignedPackage: "Early Childhood / ECE"
    })
  });

  const candData = (await createCandRes.json()) as any;
  if (!candData.success) {
    throw new Error(`Candidate creation failed: ${JSON.stringify(candData)}`);
  }
  const candidate = candData.candidate;
  console.log(`✅ Candidate created: ID=${candidate.id}, Token=${candidate.candidateToken.substring(0, 25)}...\n`);

  // 3. Fetch Candidate by Public Token
  console.log(`Step 3: Validating candidate details using public token validation...`);
  const validateCandRes = await fetch(`${BASE_URL}/api/candidates/by-token/${candidate.candidateToken}`);
  const validateCandData = (await validateCandRes.json()) as any;
  if (!validateCandData.success) {
    throw new Error(`Public candidate validation failed: ${JSON.stringify(validateCandData)}`);
  }
  console.log(`✅ Validation successful! Retrieved candidate: ${validateCandData.candidate.fullName}\n`);

  // 4. Submit Referee Nominations (Candidate Portal)
  console.log("Step 4: Nominating referees (representing candidate entering referee details)...");
  const nominateRes = await fetch(`${BASE_URL}/api/candidates/${candidate.id}/referees`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      referees: [
        {
          fullName: "Alice Jones",
          email: "alice.jones@school.nz",
          phone: "+64 21 999 8888",
          relationship: "Former Supervisor",
          employerName: "Happy Kids ECE Centre",
          jobTitle: "Head Teacher",
          datesFrom: "2023-01",
          datesTo: "2025-12"
        }
      ]
    })
  });

  const nominateData = (await nominateRes.json()) as any;
  if (!nominateData.success) {
    throw new Error(`Referee nomination failed: ${JSON.stringify(nominateData)}`);
  }
  const referee = nominateData.referees[0];
  console.log(`✅ Referee Nominated! ID=${referee.id}, Token=${referee.refereeToken.substring(0, 25)}...\n`);

  // 5. Fetch Referee Form details (Referee Portal)
  console.log("Step 5: Fetching Referee Form and assigned Template questions by refereeToken...");
  const refFormRes = await fetch(`${BASE_URL}/api/referees/by-token/${referee.refereeToken}`);
  const refFormData = (await refFormRes.json()) as any;
  if (!refFormData.success) {
    throw new Error(`Failed to load referee form: ${JSON.stringify(refFormData)}`);
  }
  console.log(`✅ Referee Form loaded! Referee name=${refFormData.referee.fullName}, Status=${refFormData.referee.formStatus}`);
  console.log(`📋 Template Questions loaded: ${refFormData.questions.length} questions found.`);
  refFormData.questions.forEach((q: any) => {
    console.log(`  - [${q.type.toUpperCase()}] ${q.label}`);
  });
  console.log();

  // 6. Submit Referee Responses (Referee Portal)
  console.log("Step 6: Submitting Referee questionnaire responses...");
  const mockAnswers = [
    { id: "q_ece1", type: "yes_no", value: "yes" },
    { id: "q_ece2", type: "rating", value: 5 },
    { id: "q_ece3", type: "long_text", value: "John was a brilliant ECE educator who always prioritised safe practice and child safety standards." }
  ];

  const submitRes = await fetch(`${BASE_URL}/api/referees/${referee.id}/response`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      answersJson: JSON.stringify(mockAnswers),
      submissionDurationSeconds: 150,
      ipAddress: "192.168.1.50",
      isSubmit: true
    })
  });

  const submitData = (await submitRes.json()) as any;
  if (!submitData.success) {
    throw new Error(`Failed to submit referee responses: ${JSON.stringify(submitData)}`);
  }
  console.log(`✅ Referee responses submitted successfully! All completed: ${submitData.allCompleted}\n`);

  // 7. Verify Candidate overall check status
  console.log("Step 7: Checking candidate overall status update in dashboard...");
  const listCandRes = await fetch(`${BASE_URL}/api/candidates`, {
    method: "GET",
    headers: {
      "Authorization": `Bearer ${token}`
    }
  });

  const listCandData = (await listCandRes.json()) as any;
  if (!listCandData.success) {
    throw new Error(`Failed to list candidates: ${JSON.stringify(listCandData)}`);
  }

  const updatedCand = listCandData.candidates.find((c: any) => c.id === candidate.id);
  console.log(`✅ Candidate verification state check:`);
  console.log(`  - Candidate Name:   ${updatedCand?.fullName}`);
  console.log(`  - Overall Status:   ${updatedCand?.overallStatus}`);
  console.log(`  - Expected Status:  Complete`);
  
  if (updatedCand?.overallStatus === "Complete") {
    console.log("\n🎉 E2E Sprint 4 Verification SUCCESSFUL! All checks passed.");
  } else {
    throw new Error(`Overall status is ${updatedCand?.overallStatus}, expected Complete`);
  }
}

runTest().catch((err) => {
  console.error("\n❌ E2E Verification FAILED:");
  console.error(err);
  process.exit(1);
});
