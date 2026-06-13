import jwt from "jsonwebtoken";
import dotenv from "dotenv";

dotenv.config();

const BASE_URL = "http://localhost:5006";
const JWT_SECRET = process.env.JWT_SECRET || "default_refcheck_secret_key_123456";

async function testGeminiRoute() {
  console.log("Checking Gemini AI Question Generation endpoint...");

  const adminToken = jwt.sign(
    { userId: "usr_admin_test", employerId: "rec_emp_1", email: "admin@candidex.co.nz", role: "Admin" },
    JWT_SECRET,
    { expiresIn: "1h" }
  );

  const response = await fetch(`${BASE_URL}/api/ai/generate-questions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${adminToken}`
    },
    body: JSON.stringify({
      jobDescription: "We are looking for a Senior React Developer who has experience with TypeScript, Tailwind CSS, and state management.",
      industry: "Technology",
      questionCount: 3
    })
  });

  const data = (await response.json()) as any;
  console.log("Response status:", response.status);
  console.log("Response body:", JSON.stringify(data, null, 2));

  if (data.success && Array.isArray(data.questions) && data.questions.length > 0) {
    console.log("🎉 SUCCESS: Gemini AI generated questions successfully!");
  } else {
    throw new Error(`Gemini AI question generation failed: ${JSON.stringify(data)}`);
  }
}

testGeminiRoute().catch((err) => {
  console.error("❌ Test failed:", err);
  process.exit(1);
});
