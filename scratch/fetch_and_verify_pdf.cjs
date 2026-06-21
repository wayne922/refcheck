const fs = require('fs');
const jwt = require('jsonwebtoken');
const { PDFParse } = require('pdf-parse');

const BASE_URL = "http://localhost:5006";
const JWT_SECRET = "default_refcheck_secret_key_123456";

function signToken(userId, employerId, role, email) {
  return jwt.sign(
    { userId, employerId, email, role },
    JWT_SECRET,
    { expiresIn: "1h" }
  );
}

async function run() {
  const recruiterAToken = signToken("usr_rec_a", "rec_emp_1", "Recruiter", "recruiter.a@refcheck.tech");

  // 1. Create candidate
  const createRes = await fetch(`${BASE_URL}/api/candidates`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${recruiterAToken}`
    },
    body: JSON.stringify({
      fullName: "Test Candidate",
      email: "test.candidate@gmail.com",
      phone: "+64 21 999 8888",
      roleAppliedFor: "Senior Teacher",
      assignedPackage: "Early Childhood / ECE"
    })
  });
  const createData = await createRes.json();
  const candidate = createData.candidate;
  console.log(`Created candidate: ${candidate.id}`);

  // 2. Nominate referee
  const nomRes = await fetch(`${BASE_URL}/api/candidates/${candidate.id}/referees`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      referees: [
        {
          fullName: "Referee Wayne Sullivan",
          email: "wayne@refcheck.tech",
          phone: "+64 27 677 8991",
          relationship: "Manager",
          employerName: "RefCheck Recruitment",
          jobTitle: "Principal Consultant",
          datesFrom: "2020-01",
          datesTo: "2024-01"
        }
      ]
    })
  });
  const nomData = await nomRes.json();
  const referee = nomData.referees[0];
  console.log(`Nominated referee: ${referee.id}`);

  // 3. Submit responses
  const answers = [
    { id: "q_ece_1", type: "short_text", label: "Where did you work together?", value: "RefCheck Recruitment" },
    { id: "q_ece_2", type: "short_text", label: "What was your relationship?", value: "He was my manager" },
    { id: "q_ece_3", type: "short_text", label: "How long did you work together?", value: "4 years" },
    { id: "q_ece_4", type: "short_text", label: "What was the candidate's role?", value: "Teacher" },
    { id: "q_ece_5", type: "short_text", label: "Why did they finish their employment?", value: "Relocating" },
    { id: "q_ece_6", type: "yes_no", label: "Did they report directly to you?", value: "yes" },
    { id: "q_ece_7", type: "rating", label: "How would you rate their performance?", value: 5 },
    { id: "q_ece_8", type: "long_text", label: "What are their key strengths?", value: "Outstanding communication skills, very attentive to children's needs, and reliable." }
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
  const submitData = await submitRes.json();
  console.log(`Submitted response success: ${submitData.success}`);

  // 4. Export PDF
  const exportRes = await fetch(`${BASE_URL}/api/reports/${candidate.id}/export`, {
    method: "POST",
    headers: { "Authorization": `Bearer ${recruiterAToken}` }
  });
  const arrayBuffer = await exportRes.arrayBuffer();
  const pdfBuffer = Buffer.from(arrayBuffer);
  fs.writeFileSync('scratch/test_generated_report.pdf', pdfBuffer);
  console.log(`Saved generated PDF report to scratch/test_generated_report.pdf`);

  // 5. Parse PDF text
  const parser = new PDFParse({ data: pdfBuffer });
  const textResult = await parser.getText();
  fs.writeFileSync('scratch/test_generated_report_text.txt', textResult.text);
  console.log(`Saved generated PDF report text to scratch/test_generated_report_text.txt`);
  await parser.destroy();
}

run().catch(console.error);
