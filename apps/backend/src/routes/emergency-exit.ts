import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Repositories } from "../db/repositories.js";
import { env } from "../env.js";
import { EmergencyExitService } from "../services/emergency-exit/index.js";
import { VaultClient } from "../services/vault/index.js";
import { Connection, Keypair } from "@solana/web3.js";
import { requireWalletSignature, NonceStore } from "../services/auth/signature.js";

const emergencyExitBody = z.object({
  vaultAddress: z.string().min(1),
});

export async function registerEmergencyExitRoutes(
  app: FastifyInstance,
  repos: Repositories,
  vaultClient: VaultClient,
  nonces: NonceStore = new NonceStore(),
): Promise<void> {
  app.post(
    "/api/v1/emergency-exit",
    { schema: { tags: ["emergency"] } },
    async (request, reply) => {
      const body = emergencyExitBody.parse(request.body);

      let executorKeypair: Keypair;
      if (!env.GOVERNANCE_KEYPAIR) {
        return reply.status(500).send({
          error: "governance_keypair_missing",
          message: "GOVERNANCE_KEYPAIR is not configured",
          statusCode: 500,
        });
      }
      try {
        const secret = Uint8Array.from(JSON.parse(env.GOVERNANCE_KEYPAIR) as number[]);
        executorKeypair = Keypair.fromSecretKey(secret);
      } catch {
        return reply.status(400).send({
          error: "invalid_keypair",
          message: "Invalid GOVERNANCE_KEYPAIR format",
          statusCode: 400,
        });
      }

      const auth = requireWalletSignature({
        nonces,
        ownerHeader: request.headers["x-atlas-owner"] as string | undefined,
        nonceHeader: request.headers["x-atlas-nonce"] as string | undefined,
        signatureHeader: request.headers["x-atlas-signature"] as string | undefined,
        body: request.body,
        expectedOwner: executorKeypair.publicKey.toBase58(),
      });
      if (!auth.ok) {
        return reply.status(auth.statusCode ?? 401).send(auth);
      }

      const vault = await repos.vaults.get(body.vaultAddress);
      if (!vault) {
        return reply.status(404).send({
          error: "vault_not_found",
          message: "Vault not found",
          statusCode: 404,
        });
      }

      const connection = new Connection(env.SOLANA_RPC_URL, "confirmed");
      const service = new EmergencyExitService(connection, executorKeypair);

      const result = await service.triggerEmergencyExit(vault);

      if (!result.triggered) {
        return reply.status(500).send({
          error: "emergency_exit_failed",
          message: result.error || "Failed to trigger emergency exit",
          statusCode: 500,
        });
      }

      if (vault.status !== "emergency") {
        vault.status = "emergency";
        await repos.vaults.update(vault);
      }

      return reply.status(200).send({
        data: {
          vaultAddress: vault.address,
          status: vault.status,
          signature: result.signature,
        },
      });
    },
  );
}
