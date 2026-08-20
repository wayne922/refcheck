import dotenv from "dotenv";

dotenv.config();

const sendgridKey = process.env.SENDGRID_API_KEY;
const BASE_URL = process.env.APP_URL || "https://refcheck-577231129915.australia-southeast1.run.app";
let isMock = true;

if (sendgridKey && process.env.MOCK_MODE !== "true") {
  isMock = false;
  console.log("[Email Service] SendGrid integration loaded.");
} else {
  console.warn("[Email Service Warning] SENDGRID_API_KEY is missing or MOCK_MODE is true. Using local console email simulation.");
}

export interface EmailPayload {
  to: string;
  subject: string;
  templateId?: string;
  dynamicTemplateData?: Record<string, any>;
  text?: string;
  html?: string;
}

export const emailLogs: any[] = [];

const createRefereeEmailHtml = (refereeName: string, candidateName: string, employerName: string, inviteUrl: string, isReminder = false) => `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${isReminder ? "Reminder: Reference Check Request" : "Reference Check Request"}</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; margin: 0; padding: 24px; color: #1e293b;">
  <div style="max-width: 540px; margin: 0 auto; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 16px; padding: 32px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);">
    <div style="margin-bottom: 24px; padding-bottom: 16px; border-bottom: 1px solid #f1f5f9;">
      <span style="font-size: 18px; font-weight: 800; color: #6366f1; letter-spacing: -0.5px;">CANDIDEX</span>
      <span style="font-size: 11px; font-weight: 600; color: #64748b; margin-left: 8px; text-transform: uppercase; letter-spacing: 0.5px;">Compliance Vetting</span>
    </div>
    
    <h2 style="font-size: 20px; font-weight: 700; color: #0f172a; margin-top: 0; margin-bottom: 12px;">
      ${isReminder ? "Reminder: Reference Request for " + candidateName : "Reference Request for " + candidateName}
    </h2>
    
    <p style="font-size: 14px; line-height: 1.6; color: #334155; margin-bottom: 16px;">
      Hi <strong>${refereeName}</strong>,
    </p>
    
    <p style="font-size: 14px; line-height: 1.6; color: #334155; margin-bottom: 24px;">
      <strong>${candidateName}</strong> has nominated you as a professional referee for their application with <strong>${employerName}</strong>. 
      ${isReminder ? "We would appreciate your quick feedback to help finalize their application." : "Please complete this short, mobile-optimized questionnaire to support their application."}
    </p>
    
    <div style="text-align: center; margin: 32px 0;">
      <a href="${inviteUrl}" style="background-color: #6366f1; color: #ffffff; padding: 14px 28px; font-size: 15px; font-weight: 600; text-decoration: none; border-radius: 10px; display: inline-block; box-shadow: 0 2px 4px rgba(99, 102, 241, 0.25);">
        Complete Reference Check (3-5 mins) &rarr;
      </a>
    </div>

    <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px 16px; font-size: 12px; color: #64748b; margin-bottom: 24px;">
      <strong style="color: #475569;">Mobile Friendly:</strong> Your answers are saved automatically as you type. You can complete this questionnaire on any smartphone or desktop.
    </div>

    <p style="font-size: 11px; color: #94a3b8; line-height: 1.5; margin-bottom: 0; border-top: 1px solid #f1f5f9; padding-top: 16px;">
      If the button above doesn't work, open this link directly:<br>
      <a href="${inviteUrl}" style="color: #6366f1; text-decoration: underline; word-break: break-all;">${inviteUrl}</a>
    </p>
  </div>
  <div style="text-align: center; margin-top: 16px; font-size: 11px; color: #94a3b8;">
    &copy; Candidex Education &bull; Confidential Reference Verification
  </div>
</body>
</html>
`;

const createCandidateEmailHtml = (candidateName: string, employerName: string, inviteUrl: string) => `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Reference Nomination Request</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; margin: 0; padding: 24px; color: #1e293b;">
  <div style="max-width: 540px; margin: 0 auto; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 16px; padding: 32px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);">
    <div style="margin-bottom: 24px; padding-bottom: 16px; border-bottom: 1px solid #f1f5f9;">
      <span style="font-size: 18px; font-weight: 800; color: #6366f1; letter-spacing: -0.5px;">CANDIDEX</span>
      <span style="font-size: 11px; font-weight: 600; color: #64748b; margin-left: 8px; text-transform: uppercase; letter-spacing: 0.5px;">Candidate Portal</span>
    </div>
    
    <h2 style="font-size: 20px; font-weight: 700; color: #0f172a; margin-top: 0; margin-bottom: 12px;">Nominate Your Referees</h2>
    
    <p style="font-size: 14px; line-height: 1.6; color: #334155; margin-bottom: 16px;">
      Hi <strong>${candidateName}</strong>,
    </p>
    
    <p style="font-size: 14px; line-height: 1.6; color: #334155; margin-bottom: 24px;">
      <strong>${employerName}</strong> has requested reference checks to support your job application. Please nominate your professional referees via the secure link below.
    </p>
    
    <div style="text-align: center; margin: 32px 0;">
      <a href="${inviteUrl}" style="background-color: #6366f1; color: #ffffff; padding: 14px 28px; font-size: 15px; font-weight: 600; text-decoration: none; border-radius: 10px; display: inline-block; box-shadow: 0 2px 4px rgba(99, 102, 241, 0.25);">
        Nominate Referees (2-3 mins) &rarr;
      </a>
    </div>

    <p style="font-size: 11px; color: #94a3b8; line-height: 1.5; margin-bottom: 0; border-top: 1px solid #f1f5f9; padding-top: 16px;">
      If the button above doesn't work, open this link directly:<br>
      <a href="${inviteUrl}" style="color: #6366f1; text-decoration: underline; word-break: break-all;">${inviteUrl}</a>
    </p>
  </div>
  <div style="text-align: center; margin-top: 16px; font-size: 11px; color: #94a3b8;">
    &copy; Candidex Education &bull; Secure Reference Check
  </div>
</body>
</html>
`;

export const emailService = {
  isMockMode: () => isMock,

  sendEmail: async (payload: EmailPayload) => {
    if (isMock) {
      console.log("\n========================================================");
      console.log(`[EMAIL DISPATCH SIMULATION]`);
      console.log(`To:       ${payload.to}`);
      console.log(`Subject:  ${payload.subject}`);
      if (payload.dynamicTemplateData) {
        console.log(`Template Data: ${JSON.stringify(payload.dynamicTemplateData, null, 2)}`);
      } else {
        console.log(`Message:  ${payload.text || payload.html}`);
      }
      console.log("========================================================\n");

      const inviteUrl = payload.dynamicTemplateData?.inviteUrl || "";
      const rawToken = inviteUrl ? inviteUrl.split("/").pop() : "";

      emailLogs.push({
        to: payload.to,
        subject: payload.subject,
        rawToken,
        sentAt: new Date().toISOString()
      });

      return { success: true, messageId: `mock_email_${Date.now()}` };
    }

    try {
      const body: any = {
        personalizations: [{
          to: [{ email: payload.to }]
        }],
        from: { email: process.env.SENDGRID_FROM_EMAIL || "no-reply@refcheck.nz", name: "Candidex RefCheck" },
        subject: payload.subject
      };

      if (payload.templateId) {
        body.template_id = payload.templateId;
        body.personalizations[0].dynamic_template_data = payload.dynamicTemplateData;
      } else {
        body.content = [];
        if (payload.text) {
          body.content.push({ type: "text/plain", value: payload.text });
        }
        if (payload.html) {
          body.content.push({ type: "text/html", value: payload.html });
        }
        if (body.content.length === 0) {
          body.content.push({ type: "text/plain", value: payload.subject });
        }
      }

      const response = await fetch("https://api.sendgrid.com/v3/mail/send", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${sendgridKey}`
        },
        body: JSON.stringify(body)
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`SendGrid API error: ${response.status} - ${errText}`);
      }

      return { success: true };
    } catch (err: any) {
      console.error("Failed to send email via SendGrid:", err);
      throw err;
    }
  },

  sendCandidateInvite: async (candidateName: string, candidateEmail: string, token: string, employerName: string) => {
    const inviteUrl = `${BASE_URL}/c/${token}`;
    return emailService.sendEmail({
      to: candidateEmail,
      subject: `Reference Check Invitation for ${candidateName}`,
      dynamicTemplateData: {
        candidateName,
        employerName,
        inviteUrl
      },
      text: `Hi ${candidateName},\n\n${employerName} has requested reference checks to support your job application. Please nominate your referees at: ${inviteUrl}\n\nThanks,\nCandidex RefCheck Team`,
      html: createCandidateEmailHtml(candidateName, employerName, inviteUrl)
    });
  },

  sendRefereeInvite: async (refereeName: string, refereeEmail: string, candidateName: string, employerName: string, token: string) => {
    const inviteUrl = `${BASE_URL}/r/${token}`;
    return emailService.sendEmail({
      to: refereeEmail,
      subject: `Reference request for ${candidateName} - ${employerName}`,
      dynamicTemplateData: {
        refereeName,
        candidateName,
        employerName,
        inviteUrl
      },
      text: `Hi ${refereeName},\n\n${candidateName} has nominated you as a professional referee for their application with ${employerName}. Please complete the mobile-optimized questionnaire at: ${inviteUrl}\n\nThanks,\nCandidex RefCheck Team`,
      html: createRefereeEmailHtml(refereeName, candidateName, employerName, inviteUrl, false)
    });
  },

  sendEmployerNotification: async (employerEmail: string, candidateName: string) => {
    return emailService.sendEmail({
      to: employerEmail,
      subject: `Referees Submitted: ${candidateName}`,
      text: `Hi Recruiter,\n\nCandidate ${candidateName} has submitted their referee nominations. You can log into your RefCheck dashboard to monitor progress.\n\nBest regards,\nCandidex RefCheck Team`
    });
  },

  sendRefereeNudge1: async (refereeName: string, refereeEmail: string, candidateName: string, employerName: string, token: string) => {
    const inviteUrl = `${BASE_URL}/r/${token}`;
    return emailService.sendEmail({
      to: refereeEmail,
      subject: `Reminder: Reference request for ${candidateName} - ${employerName}`,
      dynamicTemplateData: { refereeName, candidateName, employerName, inviteUrl },
      text: `Hi ${refereeName},\n\nWe haven't received your reference check response for ${candidateName} yet. It only takes 3-5 minutes and your progress is automatically saved. Please complete it at: ${inviteUrl}\n\nThanks,\nCandidex RefCheck Team`,
      html: createRefereeEmailHtml(refereeName, candidateName, employerName, inviteUrl, true)
    });
  },

  sendRefereeNudge2: async (refereeName: string, refereeEmail: string, candidateName: string, employerName: string, token: string) => {
    const inviteUrl = `${BASE_URL}/r/${token}`;
    return emailService.sendEmail({
      to: refereeEmail,
      subject: `Action Required: Reference request for ${candidateName} - ${employerName}`,
      dynamicTemplateData: { refereeName, candidateName, employerName, inviteUrl },
      text: `Hi ${refereeName},\n\nThis is a follow-up reminder that your reference check response for ${candidateName} is still pending. You have previously opened the link. Please complete it here: ${inviteUrl}\n\nThanks,\nCandidex RefCheck Team`,
      html: createRefereeEmailHtml(refereeName, candidateName, employerName, inviteUrl, true)
    });
  },

  sendEmployerDelayAlert: async (employerEmail: string, candidateName: string, refereeName: string) => {
    return emailService.sendEmail({
      to: employerEmail,
      subject: `Action Required: Reference delay for ${candidateName}`,
      text: `Hi Recruiter,\n\nReferee ${refereeName} has not completed their reference check for candidate ${candidateName} after 6 days. You can log into your dashboard to resend the invite, reassign the referee, or coordinate a replacement.\n\nBest regards,\nCandidex RefCheck Team`
    });
  },

  sendEmployerSubstituteAlert: async (employerEmail: string, candidateName: string, refereeName: string) => {
    return emailService.sendEmail({
      to: employerEmail,
      subject: `Substitute Referee Added: ${candidateName}`,
      text: `Hi Recruiter,\n\nCandidate ${candidateName} has nominated a substitute referee: ${refereeName}. The system has automatically dispatched their questionnaire.\n\nBest regards,\nCandidex RefCheck Team`
    });
  }
};
