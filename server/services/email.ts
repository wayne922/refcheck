import dotenv from "dotenv";

dotenv.config();

const sendgridKey = process.env.SENDGRID_API_KEY;
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
      return { success: true, messageId: `mock_email_${Date.now()}` };
    }

    try {
      const body: any = {
        personalizations: [{
          to: [{ email: payload.to }]
        }],
        from: { email: process.env.SENDGRID_FROM_EMAIL || "no-reply@refcheck.nz", name: "RefCheck" },
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
    const inviteUrl = `http://localhost:5006/c/${token}`;
    return emailService.sendEmail({
      to: candidateEmail,
      subject: `Reference Check Invitation for ${candidateName}`,
      dynamicTemplateData: {
        candidateName,
        employerName,
        inviteUrl
      },
      text: `Hi ${candidateName},\n\n${employerName} has requested reference checks to support your job application. Please nominate your referees by completing the form at: ${inviteUrl}\n\nThanks,\nRefCheck Team`
    });
  },

  sendRefereeInvite: async (refereeName: string, refereeEmail: string, candidateName: string, employerName: string, token: string) => {
    const inviteUrl = `http://localhost:5006/r/${token}`;
    return emailService.sendEmail({
      to: refereeEmail,
      subject: `Reference request for ${candidateName} - ${employerName}`,
      dynamicTemplateData: {
        refereeName,
        candidateName,
        employerName,
        inviteUrl
      },
      text: `Hi ${refereeName},\n\n${candidateName} has nominated you as a professional referee for their application with ${employerName}. Please complete the mobile-optimized questionnaire at: ${inviteUrl}\n\nThanks,\nRefCheck Team`
    });
  },

  sendEmployerNotification: async (employerEmail: string, candidateName: string) => {
    return emailService.sendEmail({
      to: employerEmail,
      subject: `Referees Submitted: ${candidateName}`,
      text: `Hi Recruiter,\n\nCandidate ${candidateName} has submitted their referee nominations. You can log into your RefCheck dashboard to monitor progress.\n\nBest regards,\nRefCheck Team`
    });
  },

  sendRefereeNudge1: async (refereeName: string, refereeEmail: string, candidateName: string, employerName: string, token: string) => {
    const inviteUrl = `http://localhost:5006/r/${token}`;
    return emailService.sendEmail({
      to: refereeEmail,
      subject: `Reminder: Reference request for ${candidateName} - ${employerName}`,
      dynamicTemplateData: { refereeName, candidateName, employerName, inviteUrl },
      text: `Hi ${refereeName},\n\nWe haven't received your reference check response for ${candidateName} yet. It only takes 3-5 minutes and your progress is automatically saved. Please complete it at: ${inviteUrl}\n\nThanks,\nRefCheck Team`
    });
  },

  sendRefereeNudge2: async (refereeName: string, refereeEmail: string, candidateName: string, employerName: string, token: string) => {
    const inviteUrl = `http://localhost:5006/r/${token}`;
    return emailService.sendEmail({
      to: refereeEmail,
      subject: `Action Required: Reference request for ${candidateName} - ${employerName}`,
      dynamicTemplateData: { refereeName, candidateName, employerName, inviteUrl },
      text: `Hi ${refereeName},\n\nThis is a follow-up reminder that your reference check response for ${candidateName} is still pending. You have previously opened the link. Please complete it here: ${inviteUrl}\n\nThanks,\nRefCheck Team`
    });
  },

  sendEmployerDelayAlert: async (employerEmail: string, candidateName: string, refereeName: string) => {
    return emailService.sendEmail({
      to: employerEmail,
      subject: `Action Required: Reference delay for ${candidateName}`,
      text: `Hi Recruiter,\n\nReferee ${refereeName} has not completed their reference check for candidate ${candidateName} after 6 days. You can log into your dashboard to resend the invite, reassign the referee, or coordinate a replacement.\n\nBest regards,\nRefCheck Team`
    });
  },

  sendEmployerSubstituteAlert: async (employerEmail: string, candidateName: string, refereeName: string) => {
    return emailService.sendEmail({
      to: employerEmail,
      subject: `Substitute Referee Added: ${candidateName}`,
      text: `Hi Recruiter,\n\nCandidate ${candidateName} has nominated a substitute referee: ${refereeName}. The system has automatically dispatched their questionnaire.\n\nBest regards,\nRefCheck Team`
    });
  }
};
