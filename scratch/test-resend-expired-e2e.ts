import dotenv from "dotenv";
import express from "express";
import crypto from "crypto";
import { airtableService } from "../server/services/airtable";
import { emailService } from "../server/services/email";
import { smsService } from "../server/services/sms";

dotenv.config();

async function runDirectTest() {
  console.log("🚀 Starting In-Process Link Timeframe Expiry & Resend Direct Test...\n");

  // 1. Create a candidate in mockDb
  const candidateToken = crypto.randomBytes(8).toString("hex");
  const candidate = await airtableService.createCandidate({
    fullName: "In-Process Candidate",
    email: "inprocess@cand.com",
    phone: "+64 21 000 1111",
    roleAppliedFor: "ECE Teacher",
    employerName: "Test Preschool",
    employerId: "rec_emp_test",
    assignedPackage: "ECE Package",
    candidateToken
  });
  console.log(`✅ Candidate created: ID=${candidate.id}, tokenExpiresAt=${candidate.tokenExpiresAt}\n`);

  // 2. Create a referee in mockDb
  const refereeToken = crypto.randomBytes(8).toString("hex");
  const referee = await airtableService.createReferee({
    fullName: "In-Process Referee",
    email: "referee@test.com",
    phone: "+64 27 111 2222",
    relationship: "Manager",
    employerName: "Test Preschool",
    jobTitle: "Head Director",
    datesFrom: "2021",
    datesTo: "2024",
    candidateId: candidate.id,
    refereeToken
  });
  console.log(`✅ Referee created: ID=${referee.id}, initial tokenExpiresAt=${referee.tokenExpiresAt}\n`);

  // 3. Verify Active Expiry Check
  let retrievedRef = await airtableService.getRefereeByToken(refereeToken);
  const isExpired1 = retrievedRef.tokenExpiresAt && new Date() > new Date(retrievedRef.tokenExpiresAt);
  if (isExpired1) {
    throw new Error("Referee link should NOT be expired initially");
  }
  console.log("✅ Step 3 Passed: Initial referee token is ACTIVE (not expired).\n");

  // 4. Simulate Timeframe Expiration by setting tokenExpiresAt to 3 days ago
  const expiredDate = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
  await airtableService.updateRefereeFields(referee.id, { tokenExpiresAt: expiredDate });
  
  retrievedRef = await airtableService.getRefereeByToken(refereeToken);
  const isExpired2 = retrievedRef.tokenExpiresAt && new Date() > new Date(retrievedRef.tokenExpiresAt);
  if (!isExpired2) {
    throw new Error("Referee link SHOULD be expired after setting tokenExpiresAt in past");
  }
  console.log(`✅ Step 4 Passed: Referee link correctly detected as EXPIRED (Expired at ${retrievedRef.tokenExpiresAt}).\n`);

  // 5. Perform Resend & Timeframe Extension (Simulate PATCH /api/referees/:id/resend logic)
  const extendDays = 14;
  const newTokenExpiresAt = new Date(Date.now() + extendDays * 24 * 60 * 60 * 1000).toISOString();

  await airtableService.updateRefereeFields(referee.id, {
    formStatus: "Sent",
    tokenExpiresAt: newTokenExpiresAt,
    nudge1SentAt: null,
    nudge2SentAt: null,
    employerAlertedAt: null,
    emailSentAt: new Date().toISOString(),
    smsSentAt: new Date().toISOString()
  });

  await emailService.sendRefereeInvite(referee.fullName, referee.email, candidate.fullName, candidate.employerName, refereeToken);

  // 6. Verify Timeframe Extended and Token Restored
  retrievedRef = await airtableService.getRefereeByToken(refereeToken);
  const isExpired3 = retrievedRef.tokenExpiresAt && new Date() > new Date(retrievedRef.tokenExpiresAt);
  if (isExpired3) {
    throw new Error("Referee link should NO LONGER be expired after resending/extending timeframe");
  }

  console.log(`✅ Step 5 Passed: Resending invitation extended timeframe to ${retrievedRef.tokenExpiresAt}! Link is now ACTIVE again.\n`);

  // 7. Test Candidate Link Expiration & Resend Extension
  const candExpiredDate = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString();
  await airtableService.updateCandidateFields(candidate.id, { tokenExpiresAt: candExpiredDate });

  let retrievedCand = await airtableService.getCandidateByToken(candidateToken);
  const candExpired1 = retrievedCand.tokenExpiresAt && new Date() > new Date(retrievedCand.tokenExpiresAt);
  if (!candExpired1) {
    throw new Error("Candidate link SHOULD be expired");
  }
  console.log(`✅ Step 6 Passed: Candidate link detected as EXPIRED.`);

  // Extend Candidate timeframe by 7 days
  const newCandExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  await airtableService.updateCandidateFields(candidate.id, { tokenExpiresAt: newCandExpiresAt });

  retrievedCand = await airtableService.getCandidateByToken(candidateToken);
  const candExpired2 = retrievedCand.tokenExpiresAt && new Date() > new Date(retrievedCand.tokenExpiresAt);
  if (candExpired2) {
    throw new Error("Candidate link should be ACTIVE after extension");
  }
  console.log(`✅ Step 7 Passed: Candidate link extended to ${retrievedCand.tokenExpiresAt}! Link is ACTIVE again.\n`);

  console.log("🎉 ALL LINK TIMEFRAME EXPIRY & EXTENSION/RESEND TESTS PASSED CLEANLY!");
}

runDirectTest().catch(err => {
  console.error("❌ TEST FAILED:", err);
  process.exit(1);
});
