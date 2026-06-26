import jwt from "jsonwebtoken";
import dotenv from "dotenv";

dotenv.config();

const BASE_URL = "http://localhost:5006";
const JWT_SECRET = process.env.JWT_SECRET || "default_refcheck_secret_key_123456";

function signToken(userId: string, employerId: string, role: string, email: string) {
  return jwt.sign(
    { userId, employerId, email, role },
    JWT_SECRET,
    { expiresIn: "1h" }
  );
}

async function runTests() {
  console.log("🚀 Starting Template & Flagging Rule Verification...\n");

  const recruiterAToken = signToken("usr_rec_a", "rec_emp_1", "Recruiter", "recruiter.a@refcheck.tech");

  // 1. Create a candidate
  console.log("1. Creating candidate...");
  const createRes = await fetch(`${BASE_URL}/api/candidates`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${recruiterAToken}`
    },
    body: JSON.stringify({
      fullName: "Category Test Candidate",
      email: "category.test@gmail.com",
      phone: "+64 21 000 9999",
      roleAppliedFor: "General Manager",
      assignedPackage: "Early Childhood / ECE" // Base package, but referee choice should override it
    })
  });
  
  const createData = (await createRes.json()) as any;
  if (!createData.success) {
    throw new Error(`Failed to create candidate: ${JSON.stringify(createData)}`);
  }
  const candidate = createData.candidate;
  console.log(`✅ Candidate created (ID: ${candidate.id})`);

  // 2. Nominate referees with different categories
  console.log("\n2. Nominating 2 referees with distinct reference types...");
  const nomRes = await fetch(`${BASE_URL}/api/candidates/${candidate.id}/referees`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      referees: [
        {
          fullName: "Character Referee",
          email: "character.ref@personal.com", // Personal email (should not trigger flag)
          phone: "+64 21 222 3334",
          relationship: "Other",
          employerName: "",
          jobTitle: "",
          datesFrom: "",
          datesTo: "",
          referenceType: "Character Reference"
        },
        {
          fullName: "General Referee",
          email: "general.ref@work.com",
          phone: "+64 21 222 3335",
          relationship: "Manager",
          employerName: "Stated Employer Ltd",
          jobTitle: "CEO",
          datesFrom: "2020-01",
          datesTo: "2023-01",
          referenceType: "General Reference"
        }
      ]
    })
  });

  const nomData = (await nomRes.json()) as any;
  if (!nomData.success) {
    throw new Error(`Failed to nominate referees: ${JSON.stringify(nomData)}`);
  }
  const [refereeChar, refereeGen] = nomData.referees;
  console.log(`✅ Character Referee nominated (ID: ${refereeChar.id}, Token: ${refereeChar.refereeToken})`);
  console.log(`✅ General Referee nominated (ID: ${refereeGen.id}, Token: ${refereeGen.refereeToken})`);

  // 3. Fetch templates by token to verify correct template loading
  console.log("\n3. Verifying correct questionnaire templates are loaded via token lookup...");
  
  // A. Fetch Character template
  const fetchCharRes = await fetch(`${BASE_URL}/api/referees/by-token/${refereeChar.refereeToken}`);
  const fetchCharData = (await fetchCharRes.json()) as any;
  if (!fetchCharData.success) {
    throw new Error(`Failed to fetch referee by token for Character Referee: ${JSON.stringify(fetchCharData)}`);
  }
  const charQuestions = fetchCharData.questions || [];
  console.log(`   Fetched ${charQuestions.length} questions for Character Reference`);
  
  // Verify Character Reference questions (e.g. no child-specific questions, relationship nature, integrity etc.)
  const hasChildEceQuestion = charQuestions.some((q: any) => q.label.toLowerCase().includes("child") || q.label.toLowerCase().includes("education"));
  if (hasChildEceQuestion) {
    throw new Error("❌ FAILURE: Character Reference template contains ECE/child-specific questions!");
  }
  const hasIntegrityQuestion = charQuestions.some((q: any) => q.label.toLowerCase().includes("integrity") || q.label.toLowerCase().includes("dependability"));
  if (!hasIntegrityQuestion) {
    throw new Error("❌ FAILURE: Character Reference template is missing character/integrity questions!");
  }
  console.log("   ✅ Character Reference questionnaire verification passed.");

  // B. Fetch General template
  const fetchGenRes = await fetch(`${BASE_URL}/api/referees/by-token/${refereeGen.refereeToken}`);
  const fetchGenData = (await fetchGenRes.json()) as any;
  if (!fetchGenData.success) {
    throw new Error(`Failed to fetch referee by token for General Referee: ${JSON.stringify(fetchGenData)}`);
  }
  const genQuestions = fetchGenData.questions || [];
  console.log(`   Fetched ${genQuestions.length} questions for General Reference`);
  
  // Verify General Reference questions (no child-specific/education-specific questions)
  const hasChildGenQuestion = genQuestions.some((q: any) => 
    q.label.toLowerCase().includes("child") || 
    q.label.toLowerCase().includes("curriculum") || 
    q.label.toLowerCase().includes("parent")
  );
  if (hasChildGenQuestion) {
    throw new Error("❌ FAILURE: General Reference template contains child-specific or parent communication questions!");
  }
  const hasProfessionalQuestions = genQuestions.some((q: any) => q.label.toLowerCase().includes("strengths") || q.label.toLowerCase().includes("role"));
  if (!hasProfessionalQuestions) {
    throw new Error("❌ FAILURE: General Reference template is missing standard professional questions!");
  }
  console.log("   ✅ General Reference questionnaire verification passed.");

  // 4. Submit response for Character Referee with "personal email" and "short answers" to verify fraud flags removal
  console.log("\n4. Submitting a response for Character Referee containing personal email and short answers (< 20 words)...");
  
  // Construct answers matching character template questions structure
  const charAnswers = charQuestions.map((q: any) => {
    let val: any = "Short answer."; // 2 words (less than 20 words, should NOT trigger short response flag)
    if (q.type === "yes_no") val = "yes";
    if (q.type === "rating") val = 5;
    return {
      id: q.id,
      type: q.type,
      label: q.label,
      value: val
    };
  });

  const submitRes = await fetch(`${BASE_URL}/api/referees/${refereeChar.id}/response`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      answersJson: JSON.stringify(charAnswers),
      ipAddress: "203.0.113.80",
      submissionDurationSeconds: 150,
      isSubmit: true
    })
  });
  const submitData = (await submitRes.json()) as any;
  if (!submitData.success) {
    throw new Error(`Failed to submit referee response: ${JSON.stringify(submitData)}`);
  }
  console.log("✅ Response submitted successfully.");

  // 5. Retrieve Candidate Report & Verify Fraud Indicators / Flags
  console.log("\n5. Retrieving candidate report to check fraud flags...");
  const reportRes = await fetch(`${BASE_URL}/api/candidates/${candidate.id}/report`, {
    headers: { "Authorization": `Bearer ${recruiterAToken}` }
  });
  const reportData = (await reportRes.json()) as any;
  if (!reportData.success) {
    throw new Error(`Failed to retrieve candidate report: ${JSON.stringify(reportData)}`);
  }

  const refereeReport = reportData.report.referees.find((r: any) => r.id === refereeChar.id);
  if (!refereeReport) {
    throw new Error("Referee not found in report!");
  }

  const refereeResponse = refereeReport.response;
  if (!refereeResponse) {
    throw new Error("Referee response not found in report!");
  }

  const fraudFlags = refereeResponse.fraudFlags || "";
  const fraudHeuristics = JSON.parse(refereeResponse.fraudFlagDetails || "{}");

  console.log("   Fraud Heuristics output:", JSON.stringify(fraudHeuristics));
  console.log("   Fraud Flags:", JSON.stringify(fraudFlags));

  // Check that no personal email or short response flags are set
  const hasShortResponseFlag = fraudFlags.includes("short_response") || fraudHeuristics.short_response === true;
  const hasPersonalEmailFlag = fraudFlags.includes("personal_email") || fraudHeuristics.personal_email === true;

  if (hasShortResponseFlag) {
    throw new Error("❌ FAILURE: short_response fraud flag triggered despite disabling it!");
  }
  if (hasPersonalEmailFlag) {
    throw new Error("❌ FAILURE: personal_email fraud flag triggered despite disabling it!");
  }

  console.log("✅ Success: No personal email or short response flags were triggered.");
  console.log("\n🎉 ALL CATEGORY ROUTING & FLAGGING RULE TESTS PASSED SUCCESSFULLY!");
}

runTests().catch((err) => {
  console.error("❌ Test Verification FAILED:");
  console.error(err);
  process.exit(1);
});
