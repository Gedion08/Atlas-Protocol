import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Repositories } from "../db/repositories.js";
import { env } from "../env.js";
import { EmergencyExitService } from "../services/emergency-exit/index.js";
import { VaultClient } from "../services/vault/index.js";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";

const emergencyExitBody = z.object({
  executor: z.string().min(1),
  vaultAddress: z.string().min(1),
});

export async function registerEmergencyExitRoutes(
  app: FastifyInstance,
  repos: Repositories,
  vaultClient: VaultClient,
): Promise<void> {
  app.post(
    "/api/v1/emergency-exit",
    { schema: { tags: ["emergency"] } },
    async (request, reply) => {
      const body = emergencyExitBody.parse(request.body);

      let executorKeypair: Keypair | null = null;
      if (env.GOVERNANCE_KEYPAIR) {
        try {
          const secret = Uint8Array.from(JSON.parse(env.GOVERNANCE_KEYPAIR));
          executorKeypair = Keypair.fromSecretKey(secret);
        } catch {
          return reply.status(400).send({
            error: "invalid_keypair",
            message: "Invalid GOVERNANCE_KEYPAIR format",
            statusCode: 400,
          });
        }
      }

      if (!executorKeypair || executorKeypair.publicKey.toBase58() !== body.executor) {
        return reply.status(403).send({
          error: "unauthorized_executor",
          message: "Executor does not match configured governance keypair",
          statusCode: 403,
        });
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
