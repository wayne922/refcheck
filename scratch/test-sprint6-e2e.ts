const BASE_URL = "http://localhost:5006";

async function runTests() {
  console.log("🚀 Starting Sprint 6 E2E Fraud Heuristics Verification...\n");

  // Step 1: Recruiter Google SSO authentication
  console.log("Step 1: Authenticating recruiter...");
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
  const token = authData.token;
  console.log(`✅ Recruiter authenticated.\n`);

  // Helper function to run a candidate flow
  async function runTestCase(params: {
    testName: string;
    candidateName: string;
    candidateIp: string;
    refereeEmail: string;
    refereeRelationship: string;
    refereeEmployer: string;
    submissionIp: string;
    submissionDuration: number;
    answersValue: string;
    expectedFlag: string;
  }) {
    console.log(`--- Test Case: ${params.testName} ---`);

    // 1. Create Candidate check
    const createRes = await fetch(`${BASE_URL}/api/candidates`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`
      },
      body: JSON.stringify({
        fullName: params.candidateName,
        email: `${params.candidateName.toLowerCase().replace(/\s+/g, ".")}@gmail.com`,
        phone: "+64 21 000 9999",
        roleAppliedFor: "Software Engineer",
        assignedPackage: "General Professional"
      })
    });
    const createData = (await createRes.json()) as any;
    const candidate = createData.candidate;

    // 2. Simulate candidate token verification with candidate IP
    await fetch(`${BASE_URL}/api/candidates/by-token/${candidate.candidateToken}`, {
      headers: {
        "x-forwarded-for": params.candidateIp
      }
    });

    // 3. Nominate referee
    const nomRes = await fetch(`${BASE_URL}/api/candidates/${candidate.id}/referees`, {
      method: "POST",
      headers: { 
        "Content-Type": "application/json",
        "x-forwarded-for": params.candidateIp
      },
      body: JSON.stringify({
        referees: [
          {
            fullName: "Test Referee",
            email: params.refereeEmail,
            phone: "+64 21 111 2222",
            relationship: params.refereeRelationship,
            employerName: params.refereeEmployer,
            jobTitle: "Team Lead",
            datesFrom: "2022-01",
            datesTo: "2024-01"
          }
        ]
      })
    });
    const nomData = (await nomRes.json()) as any;
    const referee = nomData.referees[0];

    // 4. Submit response
    const answers = [
      { id: "q_gp1", type: "short_text", label: "What was the candidate's job title?", value: params.answersValue },
      { id: "q_gp2", type: "yes_no", label: "Would you rehire?", value: "yes" },
      { id: "q_gp3", type: "rating", label: "Rate reliability", value: 5 }
    ];

    const submitRes = await fetch(`${BASE_URL}/api/referees/${referee.id}/response`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        answersJson: JSON.stringify(answers),
        ipAddress: params.submissionIp,
        submissionDurationSeconds: params.submissionDuration,
        isSubmit: true
      })
    });
    const submitData = (await submitRes.json()) as any;
    if (!submitData.success) {
      throw new Error(`Failed to submit referee response: ${JSON.stringify(submitData)}`);
    }

    // 5. Fetch candidate details to verify flags and overall status
    const detailsRes = await fetch(`${BASE_URL}/api/candidates/${candidate.id}`, {
      headers: { "Authorization": `Bearer ${token}` }
    });
    const detailsData = (await detailsRes.json()) as any;
    
    const updatedCandidate = detailsData.candidate;
    const updatedReferee = detailsData.referees[0];

    console.log(`  Candidate Overall Status: ${updatedCandidate.overallStatus}`);
    console.log(`  Referee Flags:            ${updatedReferee.fraudFlags || "none"}`);
    console.log(`  Referee Flag Details:     ${updatedReferee.fraudFlagDetails || "{}"}`);

    if (params.expectedFlag) {
      if (updatedCandidate.overallStatus !== "Flagged") {
        throw new Error(`Expected candidate status to be 'Flagged', got '${updatedCandidate.overallStatus}'`);
      }
      const flagsList = (updatedReferee.fraudFlags || "").split(",");
      if (!flagsList.includes(params.expectedFlag)) {
        throw new Error(`Expected referee flags to include '${params.expectedFlag}', got '${updatedReferee.fraudFlags}'`);
      }
      console.log(`  ✅ Passed: Flag '${params.expectedFlag}' correctly triggered and candidate flagged.\n`);
    } else {
      if (updatedCandidate.overallStatus !== "Complete") {
        throw new Error(`Expected candidate status to be 'Complete', got '${updatedCandidate.overallStatus}'`);
      }
      if (updatedReferee.fraudFlags && updatedReferee.fraudFlags.trim() !== "") {
        throw new Error(`Expected no referee flags, got '${updatedReferee.fraudFlags}'`);
      }
      console.log("  ✅ Passed: Clean submission without flags correctly verified.\n");
    }
  }

  const LONG_VALID_RESPONSE = "I worked with this candidate for three years. During this time, they were responsible for our entire TypeScript backend scaffolding, cloud infrastructure, and databases.";

  // Run the test cases
  // Heuristic 1: Shared IP
  await runTestCase({
    testName: "Heuristic 1 - Shared IP",
    candidateName: "John SharedIP",
    candidateIp: "203.0.113.50",
    refereeEmail: "bob@company.nz",
    refereeRelationship: "Peer",
    refereeEmployer: "Company Ltd",
    submissionIp: "203.0.113.50", // Matching candidate IP
    submissionDuration: 120,
    answersValue: LONG_VALID_RESPONSE,
    expectedFlag: "shared_ip"
  });

  // Heuristic 2: Personal Email Domain
  await runTestCase({
    testName: "Heuristic 2 - Personal Email",
    candidateName: "John PersonalEmail",
    candidateIp: "203.0.113.51",
    refereeEmail: "manager.bob@gmail.com", // Personal email domain
    refereeRelationship: "Manager", // Manager relationship
    refereeEmployer: "MegaCorp Inc",
    submissionIp: "203.0.113.52",
    submissionDuration: 120,
    answersValue: LONG_VALID_RESPONSE,
    expectedFlag: "personal_email"
  });

  // Heuristic 3: Domain Mismatch
  await runTestCase({
    testName: "Heuristic 3 - Domain Mismatch",
    candidateName: "John DomainMismatch",
    candidateIp: "203.0.113.51",
    refereeEmail: "manager.bob@microsoft.com", // Domain microsoft.com
    refereeRelationship: "Manager",
    refereeEmployer: "Apple Inc", // Cleaned name is apple, mismatch with microsoft
    submissionIp: "203.0.113.52",
    submissionDuration: 120,
    answersValue: LONG_VALID_RESPONSE,
    expectedFlag: "domain_mismatch"
  });

  // Heuristic 4: Short Response
  await runTestCase({
    testName: "Heuristic 4 - Short Response",
    candidateName: "John ShortResponse",
    candidateIp: "203.0.113.51",
    refereeEmail: "bob@company.nz",
    refereeRelationship: "Peer",
    refereeEmployer: "Company Ltd",
    submissionIp: "203.0.113.52",
    submissionDuration: 120,
    answersValue: "Lead software engineer.", // Under 20 words
    expectedFlag: "short_response"
  });

  // Heuristic 5: Fast Completion
  await runTestCase({
    testName: "Heuristic 5 - Fast Completion",
    candidateName: "John FastCompletion",
    candidateIp: "203.0.113.51",
    refereeEmail: "bob@company.nz",
    refereeRelationship: "Peer",
    refereeEmployer: "Company Ltd",
    submissionIp: "203.0.113.52",
    submissionDuration: 45, // Under 90 seconds
    answersValue: LONG_VALID_RESPONSE,
    expectedFlag: "fast_completion"
  });

  // baseline: Clean Submission
  await runTestCase({
    testName: "Clean Submission (No Flags)",
    candidateName: "John Clean",
    candidateIp: "203.0.113.51",
    refereeEmail: "bob@company.nz", // matches domain company.nz
    refereeRelationship: "Peer",
    refereeEmployer: "Company Ltd", // cleaned match
    submissionIp: "203.0.113.52",
    submissionDuration: 120,
    answersValue: LONG_VALID_RESPONSE,
    expectedFlag: ""
  });

  console.log("🎉 ALL SPRINT 6 HEURISTIC TEST CASES VERIFIED SUCCESSFULLY!");
}

runTests().catch((err) => {
  console.error("❌ E2E Sprint 6 Verification FAILED:");
  console.error(err);
  process.exit(1);
});
