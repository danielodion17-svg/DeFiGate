import { Secrets } from "../config/secrets.js";

const FRONTEND_URL = Secrets.FRONTEND_URL || "http://localhost:5173";

export const sendVerificationEmail = async (email, token) => {
  const url = `${FRONTEND_URL}/verify-email?token=${token}`;
  console.log(`Sending verification email to ${email}: ${url}`);

  // Replace this stub with a real email provider integration later.
  return {
    ok: true,
    email,
    verificationUrl: url,
  };
};

export const sendGenericEmail = async ({ to, subject, body }) => {
  console.log(`Email to ${to}: ${subject}\n${body}`);
  return { ok: true };
};