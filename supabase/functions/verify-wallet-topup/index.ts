import "@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY")!;

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
async function getAuthenticatedUser(req: Request) {
  const authHeader = req.headers.get("Authorization");

  if (!authHeader?.startsWith("Bearer ")) {
    return null;
  }

  const token = authHeader.slice("Bearer ".length).trim();

  if (!token) {
    return null;
  }

  const { data, error } = await supabaseAdmin.auth.getUser(token);

  if (error || !data.user) {
    return null;
  }

  return data.user;
}

type VerificationResult = {
  is_receipt: boolean;
  transaction_status: string | null;
  amount: number | null;
  reference_number: string | null;
  recipient_name: string | null;
  recipient_number: string | null;
  confidence: number;
  reason: string | null;
};

function normalize(value: string | null | undefined) {
  return (value ?? "").toLowerCase().replace(/\s+/g, "").replace(/[-()]/g, "");
}

function lastFour(value: string | null | undefined) {
  const normalized = normalize(value).replace(/\D/g, "");
  return normalized.length >= 4 ? normalized.slice(-4) : "";
}

function amountsMatch(a: number, b: number) {
  return Math.abs(a - b) < 0.01;
}

function referenceMatches(submitted: string, extracted: string | null) {
  if (!extracted) return false;

  const submittedDigits = normalize(submitted).replace(/\D/g, "");
  const extractedDigits = normalize(extracted).replace(/\D/g, "");

  if (!submittedDigits || !extractedDigits) return false;

  // Exact reference match.
  if (submittedDigits === extractedDigits) return true;

  // Allow the UI/user to submit only the last four digits.
  return submittedDigits.length === 4 && lastFour(extractedDigits) === submittedDigits;
}

function recipientMatches(
  configuredName: string | null,
  configuredNumber: string | null,
  extractedName: string | null,
  extractedNumber: string | null,
) {
  const nameMatch =
    Boolean(configuredName) &&
    Boolean(extractedName) &&
    normalize(extractedName).includes(normalize(configuredName));

  const configuredDigits = normalize(configuredNumber).replace(/\D/g, "");
  const extractedDigits = normalize(extractedNumber).replace(/\D/g, "");

  const numberMatch =
    Boolean(configuredDigits) &&
    Boolean(extractedDigits) &&
    (extractedDigits === configuredDigits ||
      (extractedDigits.length === 4 && lastFour(extractedDigits) === lastFour(configuredDigits)));

  // The configured recipient number is the authoritative match.
  // Recipient name alone must never be sufficient for automatic approval.
  if (!numberMatch) return false;

  // If both names are available, require the configured recipient name too.
  // If the payment method has no configured name, the verified number remains
  // the authoritative recipient check.
  if (configuredName && extractedName) {
    return nameMatch;
  }

  return true;
}

async function readReceipt(imageUrl: string): Promise<VerificationResult> {
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: "gpt-5",
      input: [
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: `
You are verifying a GCash payment receipt for a wallet top-up.

Read ONLY information visibly present in the screenshot.

Return JSON with exactly these fields:
{
  "is_receipt": boolean,
  "transaction_status": string|null,
  "amount": number|null,
  "reference_number": string|null,
  "recipient_name": string|null,
  "recipient_number": string|null,
  "confidence": number,
  "reason": string|null
}

Rules:
- Do not guess missing values.
- amount must be the actual transaction amount visible on the receipt.
- reference_number must be the visible GCash reference number.
- recipient_name and recipient_number must describe the payment recipient, not the
sender.
- transaction_status should contain the visible payment status.
- confidence must be between 0 and 1.
- If this is not clearly a GCash payment receipt, set is_receipt=false.
- If a field is unreadable, use null.
`,
            },
            {
              type: "input_image",
              image_url: imageUrl,
            },
          ],
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "gcash_receipt_verification",
          strict: true,
          schema: {
            type: "object",
            properties: {
              is_receipt: { type: "boolean" },
              transaction_status: { type: ["string", "null"] },
              amount: { type: ["number", "null"] },
              reference_number: { type: ["string", "null"] },
              recipient_name: { type: ["string", "null"] },
              recipient_number: { type: ["string", "null"] },
              confidence: { type: "number" },
              reason: { type: ["string", "null"] },
            },
            required: [
              "is_receipt",
              "transaction_status",
              "amount",
              "reference_number",
              "recipient_name",
              "recipient_number",
              "confidence",
              "reason",
            ],
            additionalProperties: false,
          },
        },
      },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI verification failed: ${errorText}`);
  }

  const result = await response.json();

  const text = result.output_text ?? result.output?.[0]?.content?.[0]?.text ?? "";

  if (!text) {
    throw new Error("The receipt verifier returned no result.");
  }

  try {
    return JSON.parse(text) as VerificationResult;
  } catch {
    throw new Error("The receipt verifier returned invalid verification data.");
  }
}

async function rejectTopup(topupId: string, reason: string, verification: VerificationResult) {
  const { error } = await supabaseAdmin
    .from("wallet_topups")
    .update({
      status: "rejected",
      verification_status: "rejected",
      verification_reason: reason,
      verification_confidence: verification.confidence,
      verification_data: verification,
      verification_attempted_at: new Date().toISOString(),
      review_notes: reason,
      reviewed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", topupId)
    .eq("status", "pending");

  if (error) throw error;
}

Deno.serve(async (req) => {
  try {
    if (req.method !== "POST") {
      return Response.json({ error: "Method not allowed" }, { status: 405 });
    }
    const user = await getAuthenticatedUser(req);

    if (!user) {
      return Response.json({ error: "Authentication required." }, { status: 401 });
    }

    const body = await req.json();
    const topupId = String(body?.topup_id ?? "");

    if (!topupId) {
      return Response.json({ error: "topup_id is required" }, { status: 400 });
    }

    if (!OPENAI_API_KEY) {
      return Response.json({ error: "Verification service is not configured." }, { status: 503 });
    }

    const { data: topup, error: topupError } = await supabaseAdmin
      .from("wallet_topups")
      .select(
        `
        id,
        user_id,
        wallet_type,
        payment_method_id,
        payment_method_name,
        amount,
        reference_number,
        proof_path,
        status
      `,
      )
      .eq("id", topupId)
      .maybeSingle();

    if (topupError) throw topupError;

    if (!topup) {
      return Response.json({ error: "Top-up request not found." }, { status: 404 });
    }
    if (topup.user_id !== user.id) {
      return Response.json(
        { error: "You are not authorized to verify this top-up." },
        { status: 403 },
      );
    }

    if (topup.status !== "pending") {
      return Response.json(
        {
          error: "This top-up has already been reviewed.",
          status: topup.status,
        },
        { status: 409 },
      );
    }

    if (!topup.proof_path) {
      return Response.json({ error: "No receipt screenshot was uploaded." }, { status: 400 });
    }

    const { data: paymentMethod, error: methodError } = await supabaseAdmin
      .from("payment_methods")
      .select("account_name, account_number, qr_image_path")
      .eq("id", topup.payment_method_id)
      .maybeSingle();

    if (methodError) throw methodError;

    if (!paymentMethod) {
      return Response.json({ error: "Payment method configuration not found." }, { status: 400 });
    }

    // Create a short-lived signed URL for the private receipt.
    const { data: signed, error: signedError } = await supabaseAdmin.storage
      .from("payment-proofs")
      .createSignedUrl(topup.proof_path, 300);

    if (signedError || !signed?.signedUrl) {
      throw signedError ?? new Error("Could not access receipt screenshot.");
    }

    const verification = await readReceipt(signed.signedUrl);

    const reasons: string[] = [];

    if (!verification.is_receipt) {
      reasons.push("The uploaded image is not clearly a GCash payment receipt.");
    }

    const status = normalize(verification.transaction_status);

    if (!status.includes("success") && !status.includes("completed")) {
      reasons.push("The receipt does not clearly show a successful transaction.");
    }

    if (verification.amount === null || !amountsMatch(Number(topup.amount), verification.amount)) {
      reasons.push(
        `Receipt amount does not match the requested top-up amount of PHP ${Number(
          topup.amount,
        ).toFixed(2)}.`,
      );
    }

    if (!referenceMatches(topup.reference_number, verification.reference_number)) {
      reasons.push("The receipt reference number does not match the submitted reference.");
    }

    if (
      !recipientMatches(
        paymentMethod.account_name,
        paymentMethod.account_number,
        verification.recipient_name,
        verification.recipient_number,
      )
    ) {
      reasons.push("The receipt recipient does not match the configured GCash recipient.");
    }

    if (verification.confidence < 0.85) {
      reasons.push("The receipt could not be read with sufficient confidence.");
    }

    const reason = reasons.length > 0 ? reasons.join(" ") : "Receipt verified successfully.";

    if (reasons.length > 0) {
      await rejectTopup(topup.id, reason, verification);

      return Response.json({
        ok: true,
        decision: "rejected",
        reason,
      });
    }

    const { data: txId, error: approvalError } = await supabaseAdmin.rpc(
      "automated_approve_wallet_topup",
      {
        _topup_id: topup.id,
        _verification_notes: reason,
      },
    );

    if (approvalError) throw approvalError;

    const { error: verificationUpdateError } = await supabaseAdmin
      .from("wallet_topups")
      .update({
        verification_status: "verified",
        verification_reason: reason,
        verified_reference_number: verification.reference_number,
        verified_amount: verification.amount,
        verified_recipient: verification.recipient_number ?? verification.recipient_name,
        verification_confidence: verification.confidence,
        verification_data: verification,
        verification_attempted_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", topup.id);

    if (verificationUpdateError) throw verificationUpdateError;

    return Response.json({
      ok: true,
      decision: "approved",
      transaction_id: txId,
      reason,
    });
  } catch (error) {
    console.error("verify-wallet-topup error:", error);

    return Response.json(
      {
        error: error instanceof Error ? error.message : "Wallet top-up verification failed.",
      },
      { status: 500 },
    );
  }
});
