import type { InsuranceClaim, ClaimAssessment, ClaimPayout } from "../insurance/models.js";
import type { Repositories } from "../../db/repositories.js";

const DEFAULT_CO_INSURANCE_BPS = 500;
const CLAIM_WINDOW_SECS = 30 * 86_400;
const MAX_CLAIM_RESERVE_BPS = 1500;

export class TreasuryService {
  constructor(private readonly repos: Repositories) {}

  async submitClaim(claim: InsuranceClaim): Promise<InsuranceClaim> {
    const vault = await this.repos.vaults.get(claim.vaultAddress);
    if (!vault) throw new Error("Vault not found");

    const ageSecs = (Date.now() - claim.eventTs) / 1000;
    if (ageSecs > CLAIM_WINDOW_SECS) {
      throw new Error(`Claim filed outside window (${CLAIM_WINDOW_SECS}s)`);
    }

    if (claim.amount <= 0 || claim.amount > vault.tvl) {
      throw new Error("Claim amount must be positive and not exceed vault TVL");
    }

    const existing = await this.repos.insurance.listClaims({
      vaultAddress: claim.vaultAddress,
      claimant: claim.claimant,
    });
    const hasActive = existing.some((c) => c.status !== "rejected" && c.status !== "paid");
    if (hasActive) {
      throw new Error("Claimant already has an active claim for this vault");
    }

    claim.coInsuranceAmount = (claim.amount * DEFAULT_CO_INSURANCE_BPS) / 10_000;
    claim.status = "pending";
    claim.createdAt = Date.now();

    return this.repos.insurance.createClaim(claim);
  }

  async assessClaim(assessment: ClaimAssessment): Promise<InsuranceClaim> {
    const claim = await this.repos.insurance.getClaim(assessment.claimId);
    if (!claim) throw new Error("Claim not found");
    if (claim.status !== "pending" && claim.status !== "assessing") {
      throw new Error(`Cannot assess claim in status: ${claim.status}`);
    }

    if (assessment.recommendedAmount <= 0 || assessment.recommendedAmount > claim.amount) {
      throw new Error("Recommended amount must be positive and not exceed claimed amount");
    }

    return this.repos.insurance.recordAssessment(assessment);
  }

  async adjudicateClaim(
    claimId: string,
    approved: boolean,
    decidedBy: string,
    notes?: string,
  ): Promise<InsuranceClaim> {
    const claim = await this.repos.insurance.getClaim(claimId);
    if (!claim) throw new Error("Claim not found");
    if (claim.status !== "assessing" && claim.status !== "pending") {
      throw new Error(`Cannot adjudicate claim in status: ${claim.status}`);
    }

    claim.status = approved ? "approved" : "rejected";
    claim.decidedAt = Date.now();
    claim.decidedBy = decidedBy;
    claim.assessmentNotes = notes;
    return this.repos.insurance.updateClaim(claim);
  }

  async processPayout(payout: ClaimPayout): Promise<InsuranceClaim> {
    const claim = await this.repos.insurance.getClaim(payout.claimId);
    if (!claim) throw new Error("Claim not found");
    if (claim.status !== "approved") {
      throw new Error(`Cannot pay out claim in status: ${claim.status}`);
    }

    if (payout.amount !== claim.amount - claim.coInsuranceAmount) {
      throw new Error(`Payout amount must equal ${claim.amount - claim.coInsuranceAmount} after co-insurance`);
    }

    return this.repos.insurance.recordPayout(payout);
  }

  async checkReserveBalance(vaultAddress: string): Promise<{ reserve: number; required: number; healthy: boolean }> {
    const vault = await this.repos.vaults.get(vaultAddress);
    if (!vault) throw new Error("Vault not found");

    const claims = await this.repos.insurance.listClaims({ vaultAddress, status: "approved" });
    const totalApproved = claims.reduce((sum, c) => sum + (c.amount - c.coInsuranceAmount), 0);
    const required = (vault.tvl * MAX_CLAIM_RESERVE_BPS) / 10_000;

    return {
      reserve: vault.tvl,
      required,
      healthy: vault.tvl >= required && vault.tvl >= totalApproved,
    };
  }
}
