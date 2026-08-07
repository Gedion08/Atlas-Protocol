export type ClaimStatus = "pending" | "assessing" | "approved" | "rejected" | "paid";

export interface InsuranceClaim {
  id: string;
  vaultAddress: string;
  claimant: string;
  amount: number;
  coInsuranceAmount: number;
  eventType: string;
  evidence: string;
  eventTs: number;
  status: ClaimStatus;
  decidedAt?: number;
  decidedBy?: string;
  assessmentNotes?: string;
  payoutSignature?: string;
  paidAt?: number;
  createdAt: number;
}

export interface ClaimAssessment {
  claimId: string;
  assessor: string;
  notes: string;
  recommendedAmount: number;
  coInsuranceBps: number;
  decidedAt: number;
}

export interface ClaimPayout {
  claimId: string;
  signature: string;
  amount: number;
  paidAt: number;
}
