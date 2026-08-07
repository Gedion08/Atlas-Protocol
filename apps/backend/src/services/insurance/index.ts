import type { InsuranceClaim, ClaimAssessment, ClaimPayout } from "./models.js";
import type { Repositories } from "../../db/repositories.js";
import { TreasuryService } from "../treasury/index.js";

export class InsuranceService {
  private readonly treasury: TreasuryService;

  constructor(private readonly repos: Repositories) {
    this.treasury = new TreasuryService(repos);
  }

  async submitClaim(claim: InsuranceClaim): Promise<InsuranceClaim> {
    return this.treasury.submitClaim(claim);
  }

  async assessClaim(assessment: ClaimAssessment): Promise<InsuranceClaim> {
    return this.treasury.assessClaim(assessment);
  }

  async adjudicateClaim(claimId: string, approved: boolean, decidedBy: string, notes?: string): Promise<InsuranceClaim> {
    return this.treasury.adjudicateClaim(claimId, approved, decidedBy, notes);
  }

  async processPayout(payout: ClaimPayout): Promise<InsuranceClaim> {
    return this.treasury.processPayout(payout);
  }

  async listClaims(filter?: { vaultAddress?: string; claimant?: string; status?: string }): Promise<InsuranceClaim[]> {
    return this.repos.insurance.listClaims(filter);
  }

  async getClaim(id: string): Promise<InsuranceClaim | null> {
    return this.repos.insurance.getClaim(id);
  }

  async checkReserve(vaultAddress: string) {
    return this.treasury.checkReserveBalance(vaultAddress);
  }
}
