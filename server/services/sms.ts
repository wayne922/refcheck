import dotenv from "dotenv";

dotenv.config();

const twilioSid = process.env.TWILIO_ACCOUNT_SID;
const twilioAuthToken = process.env.TWILIO_AUTH_TOKEN;
const twilioFrom = process.env.TWILIO_FROM_NUMBER || "+1234567890";
const BASE_URL = process.env.APP_URL || process.env.RENDER_EXTERNAL_URL || "http://localhost:5006";

let isMock = true;

if (twilioSid && twilioAuthToken) {
  isMock = false;
  console.log("[SMS Service] Twilio integration loaded.");
} else {
  console.warn("[SMS Service Warning] TWILIO_ACCOUNT_SID or AUTH_TOKEN is missing. Using local console SMS simulation.");
}

export const smsService = {
  isMockMode: () => isMock,

  sendSms: async (to: string, message: string) => {
    if (isMock) {
      console.log("\n========================================================");
      console.log(`[SMS DISPATCH SIMULATION]`);
      console.log(`To:      ${to}`);
      console.log(`From:    ${twilioFrom}`);
      console.log(`Body:    ${message}`);
      console.log("========================================================\n");
      return { success: true, messageId: `mock_sms_${Date.now()}` };
    }

    try {
      const basicAuth = Buffer.from(`${twilioSid}:${twilioAuthToken}`).toString("base64");
      const response = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${twilioSid}/Messages.json`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            "Authorization": `Basic ${basicAuth}`
          },
          body: new URLSearchParams({
            To: to,
            From: twilioFrom,
            Body: message
          }).toString()
        }
      );

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Twilio API error: ${response.status} - ${errText}`);
      }

      return { success: true };
    } catch (err: any) {
      console.error("Failed to send SMS via Twilio:", err);
      throw err;
    }
  },

  sendRefereeInvite: async (refereeName: string, refereePhone: string, candidateName: string, employerName: string, token: string) => {
    const inviteUrl = `${BASE_URL}/r/${token}`;
    const message = `Hi ${refereeName}, ${candidateName} has nominated you as a referee for their application with ${employerName}. Complete the questionnaire: ${inviteUrl}`;
    return smsService.sendSms(refereePhone, message);
  },

  sendRefereeNudge1: async (refereeName: string, refereePhone: string, candidateName: string, employerName: string, token: string) => {
    const inviteUrl = `${BASE_URL}/r/${token}`;
    const message = `Hi ${refereeName}, friendly reminder to complete the reference check for ${candidateName} at ${employerName}: ${inviteUrl}`;
    return smsService.sendSms(refereePhone, message);
  }
};
