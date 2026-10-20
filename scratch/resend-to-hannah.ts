import dotenv from "dotenv";
import { airtableService } from "../server/services/airtable";
import { emailService } from "../server/services/email";

dotenv.config();

async function main() {
  console.log("🔍 Fetching candidate record for Hannah Babbington...");
  const candidateId = "rec_5e15ab9fe33ae99c";
  const candidate = await airtableService.getCandidate(candidateId);

  if (!candidate) {
    throw new Error(`Candidate with ID ${candidateId} not found!`);
  }

  console.log("Candidate found:", {
    id: candidate.id,
    fullName: candidate.fullName,
    email: candidate.email,
    assignedPackage: candidate.assignedPackage,
    overallStatus: candidate.overallStatus,
    candidateToken: candidate.candidateToken,
    tokenExpiresAt: candidate.tokenExpiresAt
  });

  const referees = await airtableService.getRefereesForCandidate(candidate.id);
  console.log(`Referees currently on file (${referees.length}):`, referees.map((r: any) => ({
    id: r.id,
    fullName: r.fullName,
    email: r.email,
    formStatus: r.formStatus
  })));

  // Extend token expiration by 14 days
  const newExpiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();
  await airtableService.updateCandidateFields(candidate.id, {
    tokenExpiresAt: newExpiresAt,
    overallStatus: "Candidate Sent"
  });

  console.log(`✅ Token expiration extended to: ${newExpiresAt}`);
  console.log(`✅ Overall status updated to: Candidate Sent`);

  const employerId = Array.isArray(candidate.employer) ? candidate.employer[0] : candidate.employer;
  const employer = employerId ? await airtableService.getEmployer(employerId) : null;
  const employerName = employer?.companyName || candidate.employerName || "Candidex Recruitment";

  console.log(`📧 Sending candidate invite email to ${candidate.email} via SendGrid...`);
  await emailService.sendCandidateInvite(candidate.fullName, candidate.email, candidate.candidateToken, employerName);

  console.log("🎉 Successfully resent candidate link to Hannah Babbington!");
  console.log(`Direct link: https://refcheck-577231129915.australia-southeast1.run.app/nominate/${candidate.candidateToken}`);
}

main().catch(err => {
  console.error("❌ Error resending to Hannah:", err);
  process.exit(1);
});
