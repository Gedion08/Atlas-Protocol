import { describe, expect, it } from "vitest";
import { Connection, Keypair, PublicKey, SystemProgram } from "@solana/web3.js";
import type { OnchainVaultMeta } from "atlas-types";
import {
  buildDepositInstruction,
  buildDepositTransaction,
  buildInitializeConfigInstruction,
  buildInitializeInstruction,
  buildRequestWithdrawInstruction,
  buildRequestWithdrawTransaction,
  buildSettleWithdrawInstruction,
  buildSettleWithdrawTransaction,
  buildUpdateConfigInstruction,
  buildUpdateValueInstruction,
  decodeVaultAccount,
  decodeWithdrawalRequest,
  DEPOSIT_DISCRIMINATOR,
  escrowPda,
  fetchUserPosition,
  REQUEST_WITHDRAW_DISCRIMINATOR,
  SETTLE_WITHDRAW_DISCRIMINATOR,
  sharesMintPda,
  SHARE_PRICE_SCALE,
  UPDATE_VALUE_DISCRIMINATOR,
  vaultConfigPda,
  vaultPda,
  VAULT_PROGRAM_ID,
  withdrawRequestPda,
} from "../src/services/vault/solana.js";

const authority = Keypair.generate();
const baseMint = Keypair.generate();
const user = Keypair.generate();
const managerProfile = Keypair.generate();

const [vault] = vaultPda(authority.publicKey, baseMint.publicKey);
const [sharesMint] = sharesMintPda(vault);
const [escrow] = escrowPda(vault, baseMint.publicKey);
const [config] = vaultConfigPda();

const meta: OnchainVaultMeta = {
  programId: VAULT_PROGRAM_ID.toBase58(),
  vaultPda: vault.toBase58(),
  authority: authority.publicKey.toBase58(),
  managerProfile: managerProfile.publicKey.toBase58(),
  baseMint: baseMint.publicKey.toBase58(),
  escrowPda: escrow.toBase58(),
  sharesMint: sharesMint.toBase58(),
  decimals: 6,
};

function u64le(value: bigint): Buffer {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64LE(value);
  return buf;
}

describe("discriminators", () => {
  it("matches anchor global:<instruction> discriminators", () => {
    expect(Buffer.from(DEPOSIT_DISCRIMINATOR).toString("hex")).toBe("f223c68952e1f2b6");
    expect(Buffer.from(REQUEST_WITHDRAW_DISCRIMINATOR).toString("hex")).toBe("895fbb60fa8a1fb6");
    expect(Buffer.from(SETTLE_WITHDRAW_DISCRIMINATOR).toString("hex")).toBe("36d39bac85610cbf");
    expect(Buffer.from(UPDATE_VALUE_DISCRIMINATOR).toString("hex")).toBe("b46a61c134aa2e97");
  });
});

describe("PDAs", () => {
  it("derives the vault from [atlas_vault, authority, base_mint]", () => {
    const [derived] = PublicKey.findProgramAddressSync(
      [Buffer.from("atlas_vault"), authority.publicKey.toBuffer(), baseMint.publicKey.toBuffer()],
      VAULT_PROGRAM_ID,
    );
    expect(vault.equals(derived)).toBe(true);
  });

  it("derives shares mint, escrow, config and withdrawal-request PDAs", () => {
    const [derivedShares] = PublicKey.findProgramAddressSync(
      [Buffer.from("shares"), vault.toBuffer()],
      VAULT_PROGRAM_ID,
    );
    const [derivedEscrow] = PublicKey.findProgramAddressSync(
      [Buffer.from("escrow"), vault.toBuffer(), baseMint.publicKey.toBuffer()],
      VAULT_PROGRAM_ID,
    );
    const [derivedConfig] = PublicKey.findProgramAddressSync(
      [Buffer.from("vault_config")],
      VAULT_PROGRAM_ID,
    );
    const [derivedReq] = PublicKey.findProgramAddressSync(
      [Buffer.from("withdraw"), vault.toBuffer(), user.publicKey.toBuffer()],
      VAULT_PROGRAM_ID,
    );
    expect(sharesMint.equals(derivedShares)).toBe(true);
    expect(escrow.equals(derivedEscrow)).toBe(true);
    expect(config.equals(derivedConfig)).toBe(true);
    expect(withdrawRequestPda(vault, user.publicKey)[0].equals(derivedReq)).toBe(true);
  });
});

describe("deposit instruction", () => {
  it("lays out accounts in the program's derived order with correct flags", () => {
    const instruction = buildDepositInstruction({
      accounts: {
        config,
        vault,
        managerProfile: managerProfile.publicKey,
        user: user.publicKey,
        userToken: user.publicKey,
        vaultEscrow: escrow,
        sharesMint,
        userShares: user.publicKey,
      },
      amount: 1_000_000,
    });

    expect(instruction.programId.equals(VAULT_PROGRAM_ID)).toBe(true);
    expect(instruction.keys.map((k) => k.pubkey.toBase58())).toEqual([
      config.toBase58(),
      vault.toBase58(),
      managerProfile.publicKey.toBase58(),
      user.publicKey.toBase58(),
      user.publicKey.toBase58(),
      escrow.toBase58(),
      sharesMint.toBase58(),
      user.publicKey.toBase58(),
      "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
    ]);
    expect(instruction.keys[3].isSigner).toBe(true); // user signs
    expect(instruction.keys[3].isWritable).toBe(true);
    expect(instruction.keys[1].isWritable).toBe(true); // vault mut
    expect(instruction.keys[0].isWritable).toBe(false); // config ro

    expect(instruction.data.subarray(0, 8)).toEqual(Buffer.from(DEPOSIT_DISCRIMINATOR));
    expect(instruction.data.subarray(8)).toEqual(u64le(1_000_000n));
  });
});

describe("request_withdraw instruction", () => {
  it("initializes the withdrawal-request PDA and encodes the share count", () => {
    const request = withdrawRequestPda(vault, user.publicKey)[0];
    const instruction = buildRequestWithdrawInstruction({
      accounts: {
        config,
        vault,
        request,
        user: user.publicKey,
        userShares: user.publicKey,
        sharesMint,
      },
      shares: 500_000,
    });

    expect(instruction.keys.map((k) => k.pubkey.toBase58())).toEqual([
      config.toBase58(),
      vault.toBase58(),
      request.toBase58(),
      user.publicKey.toBase58(),
      user.publicKey.toBase58(),
      sharesMint.toBase58(),
      "11111111111111111111111111111111",
    ]);
    expect(instruction.keys[2].isWritable).toBe(true); // request init
    expect(instruction.keys[3].isSigner).toBe(true);
    expect(instruction.data.subarray(0, 8)).toEqual(Buffer.from(REQUEST_WITHDRAW_DISCRIMINATOR));
    expect(instruction.data.subarray(8)).toEqual(u64le(500_000n));
  });
});

describe("settle_withdraw instruction", () => {
  it("settles against the escrow with the full account set", () => {
    const request = withdrawRequestPda(vault, user.publicKey)[0];
    const instruction = buildSettleWithdrawInstruction({
      accounts: {
        config,
        vault,
        request,
        user: user.publicKey,
        vaultEscrow: escrow,
        userToken: user.publicKey,
        userShares: user.publicKey,
        sharesMint,
      },
    });

    expect(instruction.keys.map((k) => k.pubkey.toBase58())).toEqual([
      config.toBase58(),
      vault.toBase58(),
      request.toBase58(),
      user.publicKey.toBase58(),
      escrow.toBase58(),
      user.publicKey.toBase58(),
      user.publicKey.toBase58(),
      sharesMint.toBase58(),
      "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
    ]);
    expect(instruction.data).toEqual(Buffer.from(SETTLE_WITHDRAW_DISCRIMINATOR));
  });
});

describe("update_value instruction", () => {
  it("appends each oracle as a signing remaining account with paired values", () => {
    const o1 = Keypair.generate();
    const o2 = Keypair.generate();
    const o3 = Keypair.generate();
    const instruction = buildUpdateValueInstruction({
      config,
      vault,
      oracleSigners: [o1.publicKey, o2.publicKey, o3.publicKey],
      values: [1_000_000n, 1_050_000n, 1_100_000n],
    });

    expect(instruction.keys).toHaveLength(5);
    expect(instruction.keys.slice(2).every((k) => k.isSigner)).toBe(true);
    expect(instruction.keys.slice(2).every((k) => !k.isWritable)).toBe(true);

    const len = instruction.data.readUInt32LE(8);
    expect(len).toBe(3);
    expect(instruction.data.subarray(12, 20)).toEqual(u64le(1_000_000n));
    expect(instruction.data.subarray(20, 28)).toEqual(u64le(1_050_000n));
    expect(instruction.data.subarray(28, 36)).toEqual(u64le(1_100_000n));
  });
});

function vaultBuffer(overrides: Partial<Record<string, number>> = {}): Buffer {
  const d = Buffer.alloc(297);
  d.fill(0);
  authority.publicKey.toBuffer().copy(d, 8);
  baseMint.publicKey.toBuffer().copy(d, 136);
  d[168] = 253; // bump
  d[169] = 0; // status Active
  d.writeUInt16LE(75, 170); // management_fee_bps
  d.writeUInt16LE(2000, 172); // performance_fee_bps
  d.writeUInt16LE(100, 174); // insurance_premium_bps
  const put = (offset: number, key: string) => {
    if (overrides[key] !== undefined) d.writeBigUInt64LE(BigInt(overrides[key]), offset);
  };
  d.writeBigUInt64LE(100n, 176); // min_deposit
  put(184, "totalValue");
  put(192, "sharesOutstanding");
  put(200, "accruedMgmtProtocol");
  put(208, "accruedMgmtManager");
  put(216, "accruedPerfProtocol");
  put(224, "accruedPerfManager");
  put(232, "accruedInsurance");
  put(240, "hwm");
  put(248, "lastAccrualTs");
  put(256, "pendingShares");
  put(264, "pendingValue");
  put(280, "lastRebalanceAt");
  put(288, "rebalanceCount");
  if (overrides.oracleMarked !== undefined) d[296] = overrides.oracleMarked ? 1 : 0;
  return d;
}

describe("decodeVaultAccount", () => {
  it("decodes the on-chain account layout", () => {
    const state = decodeVaultAccount(
      vaultBuffer({ totalValue: 1_100_000, sharesOutstanding: 1_000_000, hwm: 1_100_000_000 }),
    );
    expect(state.authority).toBe(authority.publicKey.toBase58());
    expect(state.baseMint).toBe(baseMint.publicKey.toBase58());
    expect(state.status).toBe(0);
    expect(state.managementFeeBps).toBe(75);
    expect(state.performanceFeeBps).toBe(2000);
    expect(state.minDeposit).toBe(100);
    expect(state.totalValue).toBe(1_100_000);
    expect(state.sharesOutstanding).toBe(1_000_000);
    expect(state.hwm).toBe(1_100_000_000);
    expect(state.oracleMarked).toBe(false);
  });

  it("computes the NAVPS share price net of accrued fees", () => {
    const state = decodeVaultAccount(
      vaultBuffer({
        totalValue: 1_100_000,
        sharesOutstanding: 1_000_000,
        accruedMgmtProtocol: 50_000,
        accruedInsurance: 50_000,
      }),
    );
    // net nav = 1.1M - 100k = 1.0M → price = 1.0 * 1e9
    expect(state.sharePrice).toBe(1 * SHARE_PRICE_SCALE);
  });

  it("returns null share price for an empty vault", () => {
    const state = decodeVaultAccount(vaultBuffer({ sharesOutstanding: 0 }));
    expect(state.sharePrice).toBeNull();
  });

  it("rejects truncated account data", () => {
    expect(() => decodeVaultAccount(Buffer.alloc(100))).toThrow(/vault account/);
  });
});

describe("decodeWithdrawalRequest", () => {
  it("decodes shares, value, settlement slot and settled flag", () => {
    const d = Buffer.alloc(98);
    vault.toBuffer().copy(d, 8);
    user.publicKey.toBuffer().copy(d, 40);
    d.writeBigUInt64LE(500_000n, 72); // shares
    d.writeBigUInt64LE(525_000n, 80); // value
    d.writeBigUInt64LE(100_000n, 88); // settlement_slot
    d[96] = 0; // settled
    d[97] = 7; // bump
    const req = decodeWithdrawalRequest(d);
    expect(req.vault).toBe(vault.toBase58());
    expect(req.user).toBe(user.publicKey.toBase58());
    expect(req.shares).toBe(500_000);
    expect(req.value).toBe(525_000);
    expect(req.settlementSlot).toBe(100_000);
    expect(req.settled).toBe(false);
    expect(req.bump).toBe(7);
  });
});

describe("transaction builders", () => {
  function mockConnection(accountExists: boolean): Connection {
    return {
      getLatestBlockhash: async () => ({ blockhash: "fake-blockhash", lastValidBlockHeight: 1 }),
     getSlot: async () => 1_000_000,
      getAccountInfo: async () => (accountExists ? { data: new Uint8Array(), owner: PublicKey.default } : null),
      getTokenAccountBalance: async () => ({ value: { amount: "0", uiAmount: 0, decimals: 6 } }),
    } as unknown as Connection;
  }

  it("creates the base and shares ATAs before a first deposit", async () => {
    const { transaction, ataAccounts } = await buildDepositTransaction({
      connection: mockConnection(false),
      meta,
      user: user.publicKey,
      amount: 1_000_000,
    });

    // ATA creation instructions precede the deposit instruction.
    expect(transaction.instructions).toHaveLength(3);
    expect(transaction.instructions[0].programId.equals(PublicKey.default)).toBe(false);
    expect(ataAccounts).toHaveLength(2);
    expect(transaction.feePayer!.equals(user.publicKey)).toBe(true);
    expect(transaction.recentBlockhash).toBe("fake-blockhash");

    const depositIx = transaction.instructions[2];
    expect(depositIx.data.subarray(0, 8)).toEqual(Buffer.from(DEPOSIT_DISCRIMINATOR));
  });

  it("skips ATA creation when the user already holds both accounts", async () => {
    const { transaction, ataAccounts } = await buildDepositTransaction({
      connection: mockConnection(true),
      meta,
      user: user.publicKey,
      amount: 1_000_000,
    });
    expect(transaction.instructions).toHaveLength(1);
    expect(ataAccounts).toHaveLength(0);
  });

  it("builds request_withdraw and settle_withdraw transactions", async () => {
    const request = await buildRequestWithdrawTransaction({
      connection: mockConnection(true),
      meta,
      user: user.publicKey,
      shares: 500_000,
    });
    expect(request.transaction.instructions).toHaveLength(1);
    expect(request.transaction.instructions[0].data.subarray(0, 8)).toEqual(
      Buffer.from(REQUEST_WITHDRAW_DISCRIMINATOR),
    );

    const settle = await buildSettleWithdrawTransaction({
      connection: mockConnection(true),
      meta,
      user: user.publicKey,
    });
    expect(settle.transaction.instructions).toHaveLength(1);
    expect(settle.transaction.instructions[0].data).toEqual(Buffer.from(SETTLE_WITHDRAW_DISCRIMINATOR));
  });
});

describe("fetchUserPosition", () => {
  it("reads shares balance and pending withdrawal request from chain", async () => {
    const req = Buffer.alloc(98);
    vault.toBuffer().copy(req, 8);
    user.publicKey.toBuffer().copy(req, 40);
    req.writeBigUInt64LE(200_000n, 72); // shares
    req.writeBigUInt64LE(210_000n, 80); // value
    req.writeBigUInt64LE(500n, 88); // settlement slot
    req[96] = 0;
    req[97] = 7;

    const connection = {
      getTokenAccountBalance: async () => ({ value: { amount: "300000", uiAmount: 0, decimals: 6 } }),
      getSlot: async () => 1_000_000,
      getAccountInfo: async () => ({ data: req, owner: VAULT_PROGRAM_ID }),
    } as unknown as Connection;

    const position = await fetchUserPosition(connection, meta, user.publicKey);
    expect(position).not.toBeNull();
    expect(position!.shares).toBe(300_000);
    expect(position!.pending).toEqual({
      shares: 200_000,
      value: 210_000,
      settlementSlot: 500,
      settled: false,
    });
    expect(position!.claimable).toBe(200_000);
  });

  it("reports no position when the wallet holds no shares or request", async () => {
    const connection = {
      getSlot: async () => 1_000_000,
      getTokenAccountBalance: async () => {
        throw new Error("account not found");
      },
      getAccountInfo: async () => null,
    } as unknown as Connection;
    const position = await fetchUserPosition(connection, meta, user.publicKey);
    expect(position!.shares).toBe(0);
    expect(position!.pending).toBeNull();
    expect(position!.claimable).toBe(0);
  });
});

describe("bootstrap: initialize_config instruction", () => {
  it("lays out accounts and anchors InitializeConfigParams in order", () => {
    const oracles = [Keypair.generate().publicKey, Keypair.generate().publicKey, Keypair.generate().publicKey];
    const instruction = buildInitializeConfigInstruction({
      accounts: { config, governance: authority.publicKey },
      oracles,
      minOracleSignatures: 3,
      riskEngine: Keypair.generate().publicKey,
      treasury: Keypair.generate().publicKey,
      insurance: Keypair.generate().publicKey,
      veatlas: Keypair.generate().publicKey,
      reserveTarget: 100n,
    });

    expect(instruction.programId.equals(VAULT_PROGRAM_ID)).toBe(true);
    expect(instruction.keys.map((k) => k.pubkey.toBase58())).toEqual([
      config.toBase58(),
      authority.publicKey.toBase58(),
      SystemProgram.programId.toBase58(),
    ]);
    const buf = instruction.data;
    expect(Buffer.from(buf.subarray(0, 8)).toString("hex")).toBe("d07f1501c2bec446");
    // Vec<Pubkey>: u32 len then keys
    const len = buf.readUInt32LE(8);
    expect(len).toBe(3);
    let off = 12;
    for (const oracle of oracles) {
      expect(Buffer.from(buf.subarray(off, off + 32))).toEqual(oracle.toBuffer());
      off += 32;
    }
    expect(buf[off++]).toBe(3); // min_oracle_signatures
    // 4 fixed pubkeys (risk_engine, treasury, insurance, veatlas)
    for (let i = 0; i < 4; i++) {
      expect(buf.subarray(off, off + 32).some((b) => b !== 0)).toBe(true);
      off += 32;
    }
    expect(buf.readBigUInt64LE(off)).toBe(100n); // reserve_target
    expect(off + 8).toBe(buf.length);
  });
});

describe("bootstrap: initialize instruction", () => {
  it("lays out accounts and anchors InitializeParams in order", () => {
    const sharesMintKp = Keypair.generate();
    const escrowKp = Keypair.generate();
    const instruction = buildInitializeInstruction({
      accounts: {
        vault,
        sharesMint: sharesMintKp.publicKey,
        vaultEscrow: escrowKp.publicKey,
        config,
        managerProfile: managerProfile.publicKey,
        baseMint: baseMint.publicKey,
        authority: authority.publicKey,
      },
      manager: managerProfile.publicKey,
      managementFeeBps: 200,
      performanceFeeBps: 500,
      insurancePremiumBps: 10,
      minDeposit: 1_000_000n,
    });

    expect(instruction.keys.map((k) => k.pubkey.toBase58())).toEqual([
      vault.toBase58(),
      sharesMintKp.publicKey.toBase58(),
      escrowKp.publicKey.toBase58(),
      config.toBase58(),
      managerProfile.publicKey.toBase58(),
      baseMint.publicKey.toBase58(),
      authority.publicKey.toBase58(),
      SystemProgram.programId.toBase58(),
      "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
    ]);
    const buf = instruction.data;
    expect(Buffer.from(buf.subarray(0, 8)).toString("hex")).toBe("afaf6d1f0d989bed");
    expect(buf.subarray(8, 40)).toEqual(managerProfile.publicKey.toBuffer());
    expect(buf.readUInt16LE(40)).toBe(200);
    expect(buf.readUInt16LE(42)).toBe(500);
    expect(buf.readUInt16LE(44)).toBe(10);
    expect(buf.readBigUInt64LE(46)).toBe(1_000_000n);
    expect(buf.length).toBe(54);
  });
});

describe("bootstrap: update_config instruction", () => {
  it("serializes UpdateConfigInput with only settlement_slots set", () => {
    const instruction = buildUpdateConfigInstruction({
      accounts: { config, governance: authority.publicKey },
      input: { settlementSlots: 60n },
    });

    expect(instruction.keys.map((k) => k.pubkey.toBase58())).toEqual([
      config.toBase58(),
      authority.publicKey.toBase58(),
    ]);
    const buf = instruction.data;
    expect(Buffer.from(buf.subarray(0, 8)).toString("hex")).toBe("1d9efcbf0a53db63");
    // oracles None
    expect(buf[8]).toBe(0);
    // min_oracle_signatures None
    expect(buf[9]).toBe(0);
    // 5 Option<Pubkey> all None
    expect(buf.subarray(10, 15).every((b) => b === 0)).toBe(true);
    // 9 Option<u16> all None
    expect(buf.subarray(15, 24).every((b) => b === 0)).toBe(true);
    // reserve_target None
    expect(buf[24]).toBe(0);
    // settlement_slots Some
    expect(buf[25]).toBe(1);
    expect(buf.readBigUInt64LE(26)).toBe(60n);
    // deferral_secs None, max_value_move_bps None
    expect(buf[34]).toBe(0);
    expect(buf[35]).toBe(0);
    expect(buf.length).toBe(36);
  });
});
