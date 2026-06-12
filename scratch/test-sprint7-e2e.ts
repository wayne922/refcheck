import jwt from "jsonwebtoken";
import dotenv from "dotenv";

dotenv.config();

const BASE_URL = "http://localhost:5006";
const JWT_SECRET = process.env.JWT_SECRET || "default_refcheck_secret_key_123456";

// Helper to sign JWT tokens for E2E tests
function signToken(userId: string, employerId: string, role: string, email: string) {
  return jwt.sign(
    { userId, employerId, email, role },
    JWT_SECRET,
    { expiresIn: "1h" }
  );
}

async function runTests() {
  console.log("🚀 Starting Sprint 7 E2E Reporting & Dashboard Verification...\n");

  // Generate roles tokens
  const adminToken = signToken("usr_admin_test", "rec_emp_1", "Admin", "admin@candidex.co.nz");
  const recruiterAToken = signToken("usr_rec_a", "rec_emp_1", "Recruiter", "recruiter.a@candidex.co.nz");
  const recruiterBToken = signToken("usr_rec_b", "rec_emp_1", "Recruiter", "recruiter.b@candidex.co.nz");
  const viewerToken = signToken("usr_viewer_test", "rec_emp_1", "Viewer", "viewer@candidex.co.nz");

  console.log("🔑 Signatures and JWT tokens generated successfully.");

  // ==========================================
  // Test Case 1: Recruiter Isolation (A vs B)
  // ==========================================
  console.log("\n--- Test Case 1: Recruiter Isolation (A vs B) ---");
  
  console.log("1. Recruiter A creates candidate check...");
  const createRes = await fetch(`${BASE_URL}/api/candidates`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${recruiterAToken}`
    },
    body: JSON.stringify({
      fullName: "Candidate Rec A",
      email: "cand.a@gmail.com",
      phone: "+64 21 000 0001",
      roleAppliedFor: "React Developer",
      assignedPackage: "General Professional"
    })
  });
  const createData = (await createRes.json()) as any;
  if (!createData.success) {
    throw new Error(`Recruiter A failed to create candidate: ${JSON.stringify(createData)}`);
  }
  const candidateA = createData.candidate;
  console.log(`✅ Candidate Rec A created by Recruiter A (ID: ${candidateA.id})`);

  console.log("2. Recruiter B fetches candidate list...");
  const listBRes = await fetch(`${BASE_URL}/api/candidates`, {
    headers: { "Authorization": `Bearer ${recruiterBToken}` }
  });
  const listBData = (await listBRes.json()) as any;
  if (!listBData.success) {
    throw new Error(`Recruiter B failed to list candidates: ${JSON.stringify(listBData)}`);
  }
  const hasCandAInB = listBData.candidates.some((c: any) => c.id === candidateA.id);
  if (hasCandAInB) {
    throw new Error("❌ FAILURE: Recruiter B can see Recruiter A's candidate!");
  }
  console.log("✅ Success: Recruiter B does NOT see Recruiter A's candidate.");

  console.log("3. Recruiter A fetches candidate list...");
  const listARes = await fetch(`${BASE_URL}/api/candidates`, {
    headers: { "Authorization": `Bearer ${recruiterAToken}` }
  });
  const listAData = (await listARes.json()) as any;
  const hasCandAInA = listAData.candidates.some((c: any) => c.id === candidateA.id);
  if (!hasCandAInA) {
    throw new Error("❌ FAILURE: Recruiter A cannot see their own candidate!");
  }
  console.log("✅ Success: Recruiter A sees their own candidate.");

  // ==========================================
  // Test Case 2: Viewer Read-Only Limits (RBAC)
  // ==========================================
  console.log("\n--- Test Case 2: Viewer Read-Only Limits (RBAC) ---");

  console.log("1. Viewer lists candidates...");
  const viewerListRes = await fetch(`${BASE_URL}/api/candidates`, {
    headers: { "Authorization": `Bearer ${viewerToken}` }
  });
  if (viewerListRes.status !== 200) {
    throw new Error(`❌ FAILURE: Viewer was blocked from listing candidates (Status: ${viewerListRes.status})`);
  }
  console.log(`✅ Success: Viewer read list successfully (Status: ${viewerListRes.status}).`);

  console.log("2. Viewer tries to create a candidate...");
  const viewerCreateRes = await fetch(`${BASE_URL}/api/candidates`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${viewerToken}`
    },
    body: JSON.stringify({
      fullName: "Viewer Candidate Fail",
      email: "viewer.fail@gmail.com",
      roleAppliedFor: "QA Engineer"
    })
  });
  if (viewerCreateRes.status !== 403) {
    throw new Error(`❌ FAILURE: Viewer was NOT blocked from creating candidate (Status: ${viewerCreateRes.status})`);
  }
  console.log(`✅ Success: Viewer create request blocked (Status: ${viewerCreateRes.status}).`);

  console.log("3. Viewer tries to trigger a referee resend...");
  const viewerResendRes = await fetch(`${BASE_URL}/api/referees/ref_some_id/resend`, {
    method: "PATCH",
    headers: { "Authorization": `Bearer ${viewerToken}` }
  });
  if (viewerResendRes.status !== 403) {
    throw new Error(`❌ FAILURE: Viewer was NOT blocked from resending invitation (Status: ${viewerResendRes.status})`);
  }
  console.log(`✅ Success: Viewer resend request blocked (Status: ${viewerResendRes.status}).`);

  // ==========================================
  // Test Case 3: Admin Platform-Wide Scope
  // ==========================================
  console.log("\n--- Test Case 3: Admin Platform-Wide Scope ---");
  const adminListRes = await fetch(`${BASE_URL}/api/candidates`, {
    headers: { "Authorization": `Bearer ${adminToken}` }
  });
  const adminListData = (await adminListRes.json()) as any;
  if (!adminListData.success) {
    throw new Error("Admin failed to retrieve platform candidates");
  }
  const hasCandAInAdmin = adminListData.candidates.some((c: any) => c.id === candidateA.id);
  if (!hasCandAInAdmin) {
    throw new Error("❌ FAILURE: Platform Admin cannot see all candidates!");
  }
  console.log("✅ Success: Platform Admin has platform-wide scoping to view all candidates.");

  // ==========================================
  // Test Case 4: Vetting & Metrics Calculations
  // ==========================================
  console.log("\n--- Test Case 4: Vetting & Metrics Verification ---");

  console.log("1. Nominating a referee for Candidate A...");
  const nomRes = await fetch(`${BASE_URL}/api/candidates/${candidateA.id}/referees`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      referees: [
        {
          fullName: "E2E Referee A",
          email: "ref.a@company.co.nz",
          phone: "+64 21 222 3333",
          relationship: "Manager",
          employerName: "Company Ltd",
          jobTitle: "Team Lead",
          datesFrom: "2021-01",
          datesTo: "2023-01"
        }
      ]
    })
  });
  const nomData = (await nomRes.json()) as any;
  const referee = nomData.referees[0];
  console.log(`✅ Referee nominated (ID: ${referee.id})`);

  console.log("2. Submitting Referee response (Rating: 4)...");
  const answers = [
    { id: "q_gp1", type: "short_text", label: "Job Title", value: "Senior Developer" },
    { id: "q_gp2", type: "yes_no", label: "Rehire", value: "yes" },
    { id: "q_gp3", type: "rating", label: "Reliability", value: 4 },
    { id: "q_gp4", type: "long_text", label: "Strengths", value: "A very strong and dedicated engineer who works well under pressure." }
  ];
  const submitRes = await fetch(`${BASE_URL}/api/referees/${referee.id}/response`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      answersJson: JSON.stringify(answers),
      ipAddress: "203.0.113.80",
      submissionDurationSeconds: 150,
      isSubmit: true
    })
  });
  const submitData = (await submitRes.json()) as any;
  if (!submitData.success) {
    throw new Error(`Failed to submit referee response: ${JSON.stringify(submitData)}`);
  }
  console.log("✅ Referee response submitted successfully.");

  console.log("3. Verification of consolidated report calculations...");
  const reportRes = await fetch(`${BASE_URL}/api/candidates/${candidateA.id}/report`, {
    headers: { "Authorization": `Bearer ${recruiterAToken}` }
  });
  const reportData = (await reportRes.json()) as any;
  if (!reportData.success) {
    throw new Error(`Failed to retrieve consolidated report: ${JSON.stringify(reportData)}`);
  }
  const rating = reportData.report.overallAverageRating;
  if (rating !== 4) {
    throw new Error(`❌ FAILURE: Expected overall average rating to be 4, got ${rating}`);
  }
  console.log(`✅ Success: Overall Average Rating correctly calculated: ${rating} / 5.0`);

  console.log("4. Fetching Dashboard metrics...");
  const metricsRes = await fetch(`${BASE_URL}/api/dashboard/metrics`, {
    headers: { "Authorization": `Bearer ${recruiterAToken}` }
  });
  const metricsData = (await metricsRes.json()) as any;
  if (!metricsData.success) {
    throw new Error("Failed to fetch dashboard metrics");
  }
  const metrics = metricsData.metrics;
  console.log(`   Active checks:   ${metrics.activeChecksCount}`);
  console.log(`   Completion rate: ${metrics.completionRate}%`);
  console.log(`   Flagged rate:    ${metrics.flaggedRate}%`);
  console.log(`   Avg turnaround:  ${metrics.avgTurnaroundHours}h`);
  if (typeof metrics.completionRate !== "number" || typeof metrics.activeChecksCount !== "number") {
    throw new Error("❌ FAILURE: Metrics returns invalid format data types");
  }
  console.log("✅ Success: Metrics correctly verified.");

  // ==========================================
  // Test Case 5: PDF Report Export
  // ==========================================
  console.log("\n--- Test Case 5: PDF Report Export ---");
  const exportRes = await fetch(`${BASE_URL}/api/reports/${candidateA.id}/export`, {
    method: "POST",
    headers: { "Authorization": `Bearer ${recruiterAToken}` }
  });
  
  if (exportRes.status !== 200) {
    throw new Error(`❌ FAILURE: PDF export failed with status code ${exportRes.status}`);
  }
  
  const contentType = exportRes.headers.get("content-type") || "";
  if (!contentType.includes("application/pdf")) {
    throw new Error(`❌ FAILURE: Expected content-type application/pdf, got '${contentType}'`);
  }
  console.log(`✅ Success: Response Content-Type matches 'application/pdf'`);

  const arrayBuffer = await exportRes.arrayBuffer();
  const pdfBytes = new Uint8Array(arrayBuffer);
  
  // Verify PDF file signature (%PDF-1.3 or %PDF-1.4 etc.)
  const signature = String.fromCharCode(pdfBytes[0], pdfBytes[1], pdfBytes[2], pdfBytes[3], pdfBytes[4]);
  if (signature !== "%PDF-") {
    throw new Error(`❌ FAILURE: Response binary is not a valid PDF file. Signature starts with: ${signature}`);
  }
  console.log(`✅ Success: PDF file signature verified successfully ("%PDF-"). File size: ${pdfBytes.length} bytes.`);

  console.log("\n🎉 ALL SPRINT 7 E2E TEST CASES VERIFIED SUCCESSFULLY!");
}

runTests().catch((err) => {
  console.error("❌ E2E Sprint 7 Verification FAILED:");
  console.error(err);
  process.exit(1);
});
