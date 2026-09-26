import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import type { Repositories } from "../db/repositories.js";
import { env } from "../env.js";
import { buildActivateInsuranceInstruction, TREASURY_PROGRAM_ID } from "../services/treasury/solana.js";
import { InsuranceService } from "../services/insurance/index.js";
import { Connection, Keypair, PublicKey, sendAndConfirmTransaction, Transaction } from "@solana/web3.js";
import { NonceStore, requireWalletSignature } from "../services/auth/signature.js";

const activateBody = z.object({
  amount: z.number().positive(),
});

const claimBody = z.object({
  vaultAddress: z.string().min(1),
  claimant: z.string().min(1),
  amount: z.number().positive(),
  eventType: z.string().min(1),
  evidence: z.string().min(1),
  eventTs: z.number().int().positive(),
});

const assessBody = z.object({
  claimId: z.string().min(1),
  assessor: z.string().min(1),
  notes: z.string().min(1),
  recommendedAmount: z.number().positive(),
  coInsuranceBps: z.number().int().min(0).max(10_000),
});

const adjudicateBody = z.object({
  claimId: z.string().min(1),
  approved: z.boolean(),
  notes: z.string().optional(),
});

const payoutBody = z.object({
  claimId: z.string().min(1),
  signature: z.string().min(1),
  amount: z.number().positive(),
});

/**
 * Privileged insurance actions must be wallet-signed by the governance keypair
 * (spec §7.1). Comparing a body-supplied pubkey is not authentication: the
 * governance pubkey is public on-chain.
 */
function authorizeGovernance(
  request: FastifyRequest,
  governanceKeypair: Keypair | undefined,
  nonces: NonceStore,
):
  | { ok: true; executor: Keypair }
  | { ok: false; error: string; message: string; statusCode: number } {
  if (!governanceKeypair) {
    return {
      ok: false,
      error: "governance_keypair_missing",
      message: "GOVERNANCE_KEYPAIR is not configured",
      statusCode: 500,
    };
  }
  const auth = requireWalletSignature({
    nonces,
    ownerHeader: request.headers["x-atlas-owner"] as string | undefined,
    nonceHeader: request.headers["x-atlas-nonce"] as string | undefined,
    signatureHeader: request.headers["x-atlas-signature"] as string | undefined,
    body: request.body,
    expectedOwner: governanceKeypair.publicKey.toBase58(),
  });
  return auth.ok ? { ok: true, executor: governanceKeypair } : auth;
}

export async function registerInsuranceRoutes(
  app: FastifyInstance,
  repos: Repositories,
  governanceKeypair?: Keypair,
  nonces: NonceStore = new NonceStore(),
): Promise<void> {
  const service = new InsuranceService(repos);

  app.post(
    "/api/v1/insurance/activate",
    { schema: { tags: ["insurance"] } },
    async (request, reply) => {
      const body = activateBody.parse(request.body);

      const auth = authorizeGovernance(request, governanceKeypair, nonces);
      if (!auth.ok) return reply.status(auth.statusCode).send(auth);
      const executorKeypair = auth.executor;

      const connection = new Connection(env.SOLANA_RPC_URL, "confirmed");
      const [configPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("atlas_treasury")],
        TREASURY_PROGRAM_ID,
      );
      const [revenueEscrow] = PublicKey.findProgramAddressSync(
        [Buffer.from("revenue_escrow"), configPda.toBuffer()],
        TREASURY_PROGRAM_ID,
      );
      const [insuranceEscrow] = PublicKey.findProgramAddressSync(
        [Buffer.from("insurance_escrow"), configPda.toBuffer()],
        TREASURY_PROGRAM_ID,
      );

      const tx = buildActivateInsuranceInstruction({
        programId: TREASURY_PROGRAM_ID,
        accounts: {
          config: configPda,
          revenueEscrow,
          insuranceEscrow,
          governance: executorKeypair.publicKey,
        },
        amount: body.amount,
      });

      try {
        const signature = await sendAndConfirmTransaction(
          connection,
          new Transaction().add(tx),
          [executorKeypair],
          { commitment: "confirmed" },
        );

        return reply.status(200).send({
          data: {
            signature,
            amount: body.amount,
          },
        });
      } catch (err) {
        return reply.status(500).send({
          error: "activation_failed",
          message: err instanceof Error ? err.message : "Transaction failed",
          statusCode: 500,
        });
      }
    },
  );

  app.post(
    "/api/v1/insurance/claims",
    { schema: { tags: ["insurance"] } },
    async (request, reply) => {
      const body = claimBody.parse(request.body);
      try {
        const claim = await service.submitClaim({
          id: `clm_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          ...body,
          coInsuranceAmount: 0,
          status: "pending",
          decidedAt: undefined,
          decidedBy: undefined,
          assessmentNotes: undefined,
          payoutSignature: undefined,
          paidAt: undefined,
          createdAt: Date.now(),
        });
        return reply.status(201).send({ data: claim });
      } catch (err) {
        return reply.status(400).send({
          error: "invalid_claim",
          message: err instanceof Error ? err.message : "Failed to submit claim",
          statusCode: 400,
        });
      }
    },
  );

  app.get(
    "/api/v1/insurance/claims",
    { schema: { tags: ["insurance"] } },
    async (request) => {
      const query = request.query as { vaultAddress?: string; claimant?: string; status?: string };
      const claims = await service.listClaims(query);
      return { data: claims };
    },
  );

  app.get(
    "/api/v1/insurance/claims/:id",
    { schema: { tags: ["insurance"] } },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const claim = await service.getClaim(id);
      if (!claim) {
        return reply.status(404).send({
          error: "claim_not_found",
          message: "Claim not found",
          statusCode: 404,
        });
      }
      return { data: claim };
    },
  );

  app.post(
    "/api/v1/insurance/claims/:id/assess",
    { schema: { tags: ["insurance"] } },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const body = assessBody.parse(request.body);

      const auth = authorizeGovernance(request, governanceKeypair, nonces);
      if (!auth.ok) return reply.status(auth.statusCode).send(auth);

      try {
        const claim = await service.assessClaim({
          claimId: id,
          assessor: body.assessor,
          notes: body.notes,
          recommendedAmount: body.recommendedAmount,
          coInsuranceBps: body.coInsuranceBps,
          decidedAt: Date.now(),
        });
        return reply.status(200).send({ data: claim });
      } catch (err) {
        return reply.status(400).send({
          error: "assessment_failed",
          message: err instanceof Error ? err.message : "Failed to assess claim",
          statusCode: 400,
        });
      }
    },
  );

  app.post(
    "/api/v1/insurance/claims/:id/adjudicate",
    { schema: { tags: ["insurance"] } },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const body = adjudicateBody.parse(request.body);

      const auth = authorizeGovernance(request, governanceKeypair, nonces);
      if (!auth.ok) return reply.status(auth.statusCode).send(auth);

      try {
        const claim = await service.adjudicateClaim(id, body.approved, auth.executor.publicKey.toBase58(), body.notes);
        return reply.status(200).send({ data: claim });
      } catch (err) {
        return reply.status(400).send({
          error: "adjudication_failed",
          message: err instanceof Error ? err.message : "Failed to adjudicate claim",
          statusCode: 400,
        });
      }
    },
  );

  app.post(
    "/api/v1/insurance/claims/:id/payout",
    { schema: { tags: ["insurance"] } },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const body = payoutBody.parse(request.body);

      const auth = authorizeGovernance(request, governanceKeypair, nonces);
      if (!auth.ok) return reply.status(auth.statusCode).send(auth);

      try {
        const claim = await service.processPayout({
          claimId: id,
          signature: body.signature,
          amount: body.amount,
          paidAt: Date.now(),
        });
        return reply.status(200).send({ data: claim });
      } catch (err) {
        return reply.status(400).send({
          error: "payout_failed",
          message: err instanceof Error ? err.message : "Failed to process payout",
          statusCode: 400,
        });
      }
    },
  );
}
