import { createHash } from "node:crypto";
import {
  Connection,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountInstruction,
  getAssociatedTokenAddress,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import type { OnchainVaultMeta } from "atlas-types";

/** on-chain atlas-vault program id (deployed on devnet). */
export const VAULT_PROGRAM_ID = new PublicKey(
  "BeEtwSTYjPs47ZWa4joMppCNdJs4f4GRumCRtKXfSfSR",
);

export { TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID };

/** Share price scale used on-chain (1e9). */
export const SHARE_PRICE_SCALE = 1_000_000_000;

function discriminator(name: string): Uint8Array {
  return createHash("sha256").update(`global:${name}`).digest().subarray(0, 8);
}

/** anchor discriminator for `deposit`: sha256("global:deposit")[..8] */
export const DEPOSIT_DISCRIMINATOR: Uint8Array = discriminator("deposit");
/** anchor discriminator for `request_withdraw` */
export const REQUEST_WITHDRAW_DISCRIMINATOR: Uint8Array = discriminator("request_withdraw");
/** anchor discriminator for `settle_withdraw` */
export const SETTLE_WITHDRAW_DISCRIMINATOR: Uint8Array = discriminator("settle_withdraw");
/** anchor discriminator for `update_value` */
export const UPDATE_VALUE_DISCRIMINATOR: Uint8Array = discriminator("update_value");
/** anchor discriminator for `initialize_config` */
export const INITIALIZE_CONFIG_DISCRIMINATOR: Uint8Array = discriminator("initialize_config");
/** anchor discriminator for `initialize` */
export const INITIALIZE_DISCRIMINATOR: Uint8Array = discriminator("initialize");
/** anchor discriminator for `update_config` */
export const UPDATE_CONFIG_DISCRIMINATOR: Uint8Array = discriminator("update_config");

function encodeU64(value: number | bigint): Buffer {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64LE(BigInt(value));
  return buf;
}

/** borsh `Vec<u64>`: u32 LE length prefix followed by u64 LE elements. */
function encodeVecU64(values: number[] | bigint[]): Buffer {
  const body = Buffer.concat(values.map((v) => encodeU64(v)));
  const len = Buffer.alloc(4);
  len.writeUInt32LE(values.length);
  return Buffer.concat([len, body]);
}

// ---------------------------------------------------------------------------
// PDAs (seed schemes verified against programs/vault/src/state.rs)
// ---------------------------------------------------------------------------

export function vaultConfigPda(
  programId: PublicKey = VAULT_PROGRAM_ID,
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([Buffer.from("vault_config")], programId);
}

export function vaultPda(
  authority: PublicKey,
  baseMint: PublicKey,
  programId: PublicKey = VAULT_PROGRAM_ID,
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("atlas_vault"), authority.toBuffer(), baseMint.toBuffer()],
    programId,
  );
}

export function sharesMintPda(
  vault: PublicKey,
  programId: PublicKey = VAULT_PROGRAM_ID,
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([Buffer.from("shares"), vault.toBuffer()], programId);
}

export function escrowPda(
  vault: PublicKey,
  baseMint: PublicKey,
  programId: PublicKey = VAULT_PROGRAM_ID,
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("escrow"), vault.toBuffer(), baseMint.toBuffer()],
    programId,
  );
}

export function withdrawRequestPda(
  vault: PublicKey,
  user: PublicKey,
  programId: PublicKey = VAULT_PROGRAM_ID,
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("withdraw"), vault.toBuffer(), user.toBuffer()],
    programId,
  );
}

// ---------------------------------------------------------------------------
// ATA helpers
// ---------------------------------------------------------------------------

export async function getUserAta(
  connection: Connection,
  mint: PublicKey,
  owner: PublicKey,
): Promise<PublicKey> {
  return getAssociatedTokenAddress(mint, owner, true, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID);
}

export function buildAtaCreationInstruction(args: {
  payer: PublicKey;
  mint: PublicKey;
  owner: PublicKey;
  tokenProgram?: PublicKey;
}): TransactionInstruction {
  const ata = getAssociatedTokenAddressSync(args.mint, args.owner);
  return createAssociatedTokenAccountInstruction(
    args.payer,
    ata,
    args.owner,
    args.mint,
    args.tokenProgram ?? TOKEN_PROGRAM_ID,
    ASSOCIATED_TOKEN_PROGRAM_ID,
  );
}

// ---------------------------------------------------------------------------
// Instruction builders
// ---------------------------------------------------------------------------

export interface DepositAccounts {
  config: PublicKey;
  vault: PublicKey;
  managerProfile: PublicKey;
  user: PublicKey;
  userToken: PublicKey;
  vaultEscrow: PublicKey;
  sharesMint: PublicKey;
  userShares: PublicKey;
}

export function buildDepositInstruction(args: {
  programId?: PublicKey;
  accounts: DepositAccounts;
  amount: number | bigint;
}): TransactionInstruction {
  const programId = args.programId ?? VAULT_PROGRAM_ID;
  const a = args.accounts;
  return new TransactionInstruction({
    programId,
    keys: [
      { pubkey: a.config, isSigner: false, isWritable: false },
      { pubkey: a.vault, isSigner: false, isWritable: true },
      { pubkey: a.managerProfile, isSigner: false, isWritable: false },
      { pubkey: a.user, isSigner: true, isWritable: true },
      { pubkey: a.userToken, isSigner: false, isWritable: true },
      { pubkey: a.vaultEscrow, isSigner: false, isWritable: true },
      { pubkey: a.sharesMint, isSigner: false, isWritable: true },
      { pubkey: a.userShares, isSigner: false, isWritable: true },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    data: Buffer.concat([DEPOSIT_DISCRIMINATOR, encodeU64(args.amount)]),
  });
}

export interface RequestWithdrawAccounts {
  config: PublicKey;
  vault: PublicKey;
  request: PublicKey;
  user: PublicKey;
  userShares: PublicKey;
  sharesMint: PublicKey;
}

export function buildRequestWithdrawInstruction(args: {
  programId?: PublicKey;
  accounts: RequestWithdrawAccounts;
  shares: number | bigint;
}): TransactionInstruction {
  const programId = args.programId ?? VAULT_PROGRAM_ID;
  const a = args.accounts;
  return new TransactionInstruction({
    programId,
    keys: [
      { pubkey: a.config, isSigner: false, isWritable: false },
      { pubkey: a.vault, isSigner: false, isWritable: true },
      { pubkey: a.request, isSigner: false, isWritable: true },
      { pubkey: a.user, isSigner: true, isWritable: true },
      { pubkey: a.userShares, isSigner: false, isWritable: true },
      { pubkey: a.sharesMint, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: Buffer.concat([REQUEST_WITHDRAW_DISCRIMINATOR, encodeU64(args.shares)]),
  });
}

export interface SettleWithdrawAccounts {
  config: PublicKey;
  vault: PublicKey;
  request: PublicKey;
  user: PublicKey;
  vaultEscrow: PublicKey;
  userToken: PublicKey;
  userShares: PublicKey;
  sharesMint: PublicKey;
}

export function buildSettleWithdrawInstruction(args: {
  programId?: PublicKey;
  accounts: SettleWithdrawAccounts;
}): TransactionInstruction {
  const programId = args.programId ?? VAULT_PROGRAM_ID;
  const a = args.accounts;
  return new TransactionInstruction({
    programId,
    keys: [
      { pubkey: a.config, isSigner: false, isWritable: false },
      { pubkey: a.vault, isSigner: false, isWritable: true },
      { pubkey: a.request, isSigner: false, isWritable: true },
      { pubkey: a.user, isSigner: true, isWritable: true },
      { pubkey: a.vaultEscrow, isSigner: false, isWritable: true },
      { pubkey: a.userToken, isSigner: false, isWritable: true },
      { pubkey: a.userShares, isSigner: false, isWritable: true },
      { pubkey: a.sharesMint, isSigner: false, isWritable: true },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    data: Buffer.from(SETTLE_WITHDRAW_DISCRIMINATOR),
  });
}

export function buildUpdateValueInstruction(args: {
  programId?: PublicKey;
  config: PublicKey;
  vault: PublicKey;
  oracleSigners: PublicKey[];
  values: number[] | bigint[];
}): TransactionInstruction {
  const programId = args.programId ?? VAULT_PROGRAM_ID;
  return new TransactionInstruction({
    programId,
    keys: [
      { pubkey: args.config, isSigner: false, isWritable: false },
      { pubkey: args.vault, isSigner: false, isWritable: true },
      ...args.oracleSigners.map((pubkey) => ({ pubkey, isSigner: true, isWritable: false })),
    ],
    data: Buffer.concat([UPDATE_VALUE_DISCRIMINATOR, encodeVecU64(args.values)]),
  });
}

// ---------------------------------------------------------------------------
// Bootstrap builders (governance/deployer-signed, raw Anchor, no IDL)
// ---------------------------------------------------------------------------

function encodeU16(value: number): Buffer {
  const buf = Buffer.alloc(2);
  buf.writeUInt16LE(value);
  return buf;
}

function encodeU8(value: number): Buffer {
  return Buffer.from([value & 0xff]);
}

/** borsh `Vec<Pubkey>`: u32 LE length prefix followed by 32-byte keys. */
function encodeVecPubkeys(keys: PublicKey[]): Buffer {
  const body = Buffer.concat(keys.map((k) => k.toBuffer()));
  const len = Buffer.alloc(4);
  len.writeUInt32LE(keys.length);
  return Buffer.concat([len, body]);
}

/** Anchor `Option<T>` discriminant bytes for the fields we set (all None). */
function encodeNoneOptions(count: number): Buffer {
  return Buffer.alloc(count);
}

/** Creates the protocol `vault_config` PDA (governance-signed). */
export function buildInitializeConfigInstruction(args: {
  programId?: PublicKey;
  accounts: { config: PublicKey; governance: PublicKey; systemProgram?: PublicKey };
  oracles: PublicKey[];
  minOracleSignatures: number;
  riskEngine: PublicKey;
  treasury: PublicKey;
  insurance: PublicKey;
  veatlas: PublicKey;
  reserveTarget: number | bigint;
}): TransactionInstruction {
  const programId = args.programId ?? VAULT_PROGRAM_ID;
  const a = args.accounts;
  return new TransactionInstruction({
    programId,
    keys: [
      { pubkey: a.config, isSigner: false, isWritable: true },
      { pubkey: a.governance, isSigner: true, isWritable: true },
      { pubkey: a.systemProgram ?? SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: Buffer.concat([
      INITIALIZE_CONFIG_DISCRIMINATOR,
      encodeVecPubkeys(args.oracles),
      encodeU8(args.minOracleSignatures),
      args.riskEngine.toBuffer(),
      args.treasury.toBuffer(),
      args.insurance.toBuffer(),
      args.veatlas.toBuffer(),
      encodeU64(args.reserveTarget),
    ]),
  });
}

/** Creates the vault PDA, shares mint (6 decimals) and escrow (authority-signed). */
export function buildInitializeInstruction(args: {
  programId?: PublicKey;
  accounts: {
    vault: PublicKey;
    sharesMint: PublicKey;
    vaultEscrow: PublicKey;
    config: PublicKey;
    managerProfile: PublicKey;
    baseMint: PublicKey;
    authority: PublicKey;
    systemProgram?: PublicKey;
    tokenProgram?: PublicKey;
  };
  manager: PublicKey;
  managementFeeBps: number;
  performanceFeeBps: number;
  insurancePremiumBps: number;
  minDeposit: number | bigint;
}): TransactionInstruction {
  const programId = args.programId ?? VAULT_PROGRAM_ID;
  const a = args.accounts;
  return new TransactionInstruction({
    programId,
    keys: [
      { pubkey: a.vault, isSigner: false, isWritable: true },
      { pubkey: a.sharesMint, isSigner: false, isWritable: true },
      { pubkey: a.vaultEscrow, isSigner: false, isWritable: true },
      { pubkey: a.config, isSigner: false, isWritable: false },
      { pubkey: a.managerProfile, isSigner: false, isWritable: false },
      { pubkey: a.baseMint, isSigner: false, isWritable: false },
      { pubkey: a.authority, isSigner: true, isWritable: true },
      { pubkey: a.systemProgram ?? SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: a.tokenProgram ?? TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    data: Buffer.concat([
      INITIALIZE_DISCRIMINATOR,
      args.manager.toBuffer(),
      encodeU16(args.managementFeeBps),
      encodeU16(args.performanceFeeBps),
      encodeU16(args.insurancePremiumBps),
      encodeU64(args.minDeposit),
    ]),
  });
}

/**
 * Governance-gated protocol config update (vault `update_config`). Only
 * `settlementSlots` (and optionally the oracle set) is currently exposed here;
 * every other field is emitted as `None` per the on-chain struct layout.
 */
export function buildUpdateConfigInstruction(args: {
  programId?: PublicKey;
  accounts: { config: PublicKey; governance: PublicKey };
  input: {
    oracles?: PublicKey[];
    minOracleSignatures?: number;
    settlementSlots?: number | bigint;
  };
}): TransactionInstruction {
  const programId = args.programId ?? VAULT_PROGRAM_ID;
  const a = args.accounts;
  // Anchor Option fields in declaration order (UpdateConfigInput).
  const body: Uint8Array[] = [UPDATE_CONFIG_DISCRIMINATOR];
  if (args.input.oracles) {
    body.push(encodeU8(1), encodeVecPubkeys(args.input.oracles));
  } else {
    body.push(encodeU8(0));
  }
  if (args.input.minOracleSignatures !== undefined) {
    body.push(encodeU8(1), encodeU8(args.input.minOracleSignatures));
  } else {
    body.push(encodeU8(0));
  }
  // risk_engine, treasury, insurance, veatlas, governance: 5 None Pubkeys
  body.push(encodeNoneOptions(5));
  // mgmt_fee_cap, perf_fee_cap, premium_cap, protocol_mgmt_share,
  // protocol_perf_share, insurance_share, treasury_share, veatlas_share, co_pay: 9 None u16
  body.push(encodeNoneOptions(9));
  // reserve_target: None u64
  body.push(encodeU8(0));
  if (args.input.settlementSlots !== undefined) {
    body.push(encodeU8(1), encodeU64(args.input.settlementSlots));
  } else {
    body.push(encodeU8(0));
  }
  // deferral_secs: None u64, max_value_move_bps: None u16
  body.push(encodeNoneOptions(2));

  return new TransactionInstruction({
    programId,
    keys: [
      { pubkey: a.config, isSigner: false, isWritable: true },
      { pubkey: a.governance, isSigner: true, isWritable: false },
    ],
    data: Buffer.concat(body),
  });
}

// ---------------------------------------------------------------------------
// Transaction builders (backend assembles; wallet signs + sends)
// ---------------------------------------------------------------------------

export interface BuildTransactionResult {
  transaction: Transaction;
  /** Accounts that must exist before the instruction can run (ATAs). */
  ataAccounts: PublicKey[];
}

function isPresentAccount(connection: Connection, pubkey: PublicKey): Promise<boolean> {
  return connection.getAccountInfo(pubkey).then((info) => info !== null);
}

/** Builds a fee-payer=user, blockhash-set `deposit` transaction, creating the
 * user's base/shares ATAs first if they don't exist yet. */
export async function buildDepositTransaction(args: {
  connection: Connection;
  programId?: PublicKey;
  meta: OnchainVaultMeta;
  user: PublicKey;
  amount: number | bigint;
  userToken?: PublicKey;
  userShares?: PublicKey;
}): Promise<BuildTransactionResult> {
  const programId = args.programId ?? VAULT_PROGRAM_ID;
  const meta = args.meta;
  const [vault] = vaultPda(new PublicKey(meta.authority), new PublicKey(meta.baseMint), programId);
  const [sharesMint] = sharesMintPda(vault, programId);
  const [escrow] = escrowPda(vault, new PublicKey(meta.baseMint), programId);
  const [config] = vaultConfigPda(programId);

  const userToken =
    args.userToken ?? (await getUserAta(args.connection, new PublicKey(meta.baseMint), args.user));
  const userShares =
    args.userShares ?? (await getUserAta(args.connection, sharesMint, args.user));

  const transaction = new Transaction();
  const ataAccounts: PublicKey[] = [];
  if (!(await isPresentAccount(args.connection, userToken))) {
    transaction.add(
      buildAtaCreationInstruction({ payer: args.user, mint: new PublicKey(meta.baseMint), owner: args.user }),
    );
    ataAccounts.push(userToken);
  }
  if (!(await isPresentAccount(args.connection, userShares))) {
    transaction.add(
      buildAtaCreationInstruction({ payer: args.user, mint: sharesMint, owner: args.user }),
    );
    ataAccounts.push(userShares);
  }

  transaction.add(
    buildDepositInstruction({
      programId,
      accounts: {
        config,
        vault,
        managerProfile: new PublicKey(meta.managerProfile),
        user: args.user,
        userToken,
        vaultEscrow: escrow,
        sharesMint,
        userShares,
      },
      amount: args.amount,
    }),
  );

  transaction.feePayer = args.user;
  transaction.recentBlockhash = (await args.connection.getLatestBlockhash()).blockhash;
  return { transaction, ataAccounts };
}

export async function buildRequestWithdrawTransaction(args: {
  connection: Connection;
  programId?: PublicKey;
  meta: OnchainVaultMeta;
  user: PublicKey;
  shares: number | bigint;
  userShares?: PublicKey;
}): Promise<BuildTransactionResult> {
  const programId = args.programId ?? VAULT_PROGRAM_ID;
  const meta = args.meta;
  const [vault] = vaultPda(new PublicKey(meta.authority), new PublicKey(meta.baseMint), programId);
  const [sharesMint] = sharesMintPda(vault, programId);
  const [request] = withdrawRequestPda(vault, args.user, programId);
  const [config] = vaultConfigPda(programId);

  const userShares =
    args.userShares ?? (await getUserAta(args.connection, sharesMint, args.user));

  const transaction = new Transaction();
  const ataAccounts: PublicKey[] = [];
  if (!(await isPresentAccount(args.connection, userShares))) {
    transaction.add(
      buildAtaCreationInstruction({ payer: args.user, mint: sharesMint, owner: args.user }),
    );
    ataAccounts.push(userShares);
  }

  transaction.add(
    buildRequestWithdrawInstruction({
      programId,
      accounts: { config, vault, request, user: args.user, userShares, sharesMint },
      shares: args.shares,
    }),
  );

  transaction.feePayer = args.user;
  transaction.recentBlockhash = (await args.connection.getLatestBlockhash()).blockhash;
  return { transaction, ataAccounts };
}

export async function buildSettleWithdrawTransaction(args: {
  connection: Connection;
  programId?: PublicKey;
  meta: OnchainVaultMeta;
  user: PublicKey;
  userToken?: PublicKey;
  userShares?: PublicKey;
}): Promise<BuildTransactionResult> {
  const programId = args.programId ?? VAULT_PROGRAM_ID;
  const meta = args.meta;
  const [vault] = vaultPda(new PublicKey(meta.authority), new PublicKey(meta.baseMint), programId);
  const [sharesMint] = sharesMintPda(vault, programId);
  const [escrow] = escrowPda(vault, new PublicKey(meta.baseMint), programId);
  const [request] = withdrawRequestPda(vault, args.user, programId);
  const [config] = vaultConfigPda(programId);

  const userToken =
    args.userToken ?? (await getUserAta(args.connection, new PublicKey(meta.baseMint), args.user));
  const userShares =
    args.userShares ?? (await getUserAta(args.connection, sharesMint, args.user));

  const transaction = new Transaction();
  const ataAccounts: PublicKey[] = [];
  if (!(await isPresentAccount(args.connection, userToken))) {
    transaction.add(
      buildAtaCreationInstruction({ payer: args.user, mint: new PublicKey(meta.baseMint), owner: args.user }),
    );
    ataAccounts.push(userToken);
  }

  transaction.add(
    buildSettleWithdrawInstruction({
      programId,
      accounts: {
        config,
        vault,
        request,
        user: args.user,
        vaultEscrow: escrow,
        userToken,
        userShares,
        sharesMint,
      },
    }),
  );

  transaction.feePayer = args.user;
  transaction.recentBlockhash = (await args.connection.getLatestBlockhash()).blockhash;
  return { transaction, ataAccounts };
}

// ---------------------------------------------------------------------------
// On-chain state readers (chain is source of truth for on-chain vaults)
// ---------------------------------------------------------------------------

export interface VaultState {
  authority: string;
  manager: string;
  managerProfile: string;
  sharesMint: string;
  baseMint: string;
  status: 0 | 1 | 2; // Active=0, Paused=1, Emergency=2
  managementFeeBps: number;
  performanceFeeBps: number;
  insurancePremiumBps: number;
  minDeposit: number;
  totalValue: number;
  sharesOutstanding: number;
  hwm: number;
  lastAccrualTs: number;
  pendingShares: number;
  pendingValue: number;
  createdAt: number;
  lastRebalanceAt: number;
  rebalanceCount: number;
  oracleMarked: boolean;
  /** Net NAV per share scaled by 1e9 (mirrors on-chain `share_price()`). */
  sharePrice: number | null;
}

function pubkeyAt(data: Uint8Array, offset: number): PublicKey {
  return new PublicKey(data.subarray(offset, offset + 32));
}

function readU8(data: Uint8Array, offset: number): number {
  return data[offset];
}

function readU16(data: Uint8Array, offset: number): number {
  return data[offset] | (data[offset + 1] << 8);
}

function readU64(data: Uint8Array, offset: number): number {
  const lo =
    (data[offset] | (data[offset + 1] << 8) | (data[offset + 2] << 16) | (data[offset + 3] << 24)) >>> 0;
  const hi =
    (data[offset + 4] | (data[offset + 5] << 8) | (data[offset + 6] << 16) | (data[offset + 7] << 24)) >>> 0;
  return hi * 0x1_0000_0000 + lo;
}

function readI64(data: Uint8Array, offset: number): number {
  const value = readU64(data, offset);
  // Negative i64 (two's complement) when the sign bit is set.
  return (data[offset + 7] & 0x80) !== 0 ? value - 2 ** 64 : value;
}

function requireMinLen(data: Uint8Array, min: number, label: string): void {
  if (data.length < min) {
    throw new Error(`${label}: expected at least ${min} bytes, got ${data.length}`);
  }
}

/** Decodes the on-chain `Vault` account (layout from programs/vault/src/state.rs). */
export function decodeVaultAccount(data: Uint8Array): VaultState {
  requireMinLen(data, 297, "vault account");
  const d = data;
  const authority = pubkeyAt(d, 8).toBase58();
  const manager = pubkeyAt(d, 40).toBase58();
  const managerProfile = pubkeyAt(d, 72).toBase58();
  const sharesMint = pubkeyAt(d, 104).toBase58();
  const baseMint = pubkeyAt(d, 136).toBase58();
  const totalValue = readU64(d, 184);
  const sharesOutstanding = readU64(d, 192);
  const hwm = readU64(d, 240);
  const accruedProtocol = readU64(d, 200) + readU64(d, 216);
  const accruedManager = readU64(d, 208) + readU64(d, 224);
  const accruedInsurance = readU64(d, 232);
  const netNav = totalValue - Math.min(totalValue, accruedProtocol + accruedManager + accruedInsurance);
  const sharePrice =
    sharesOutstanding > 0 ? Math.floor((netNav * SHARE_PRICE_SCALE) / sharesOutstanding) : null;

  return {
    authority,
    manager,
    managerProfile,
    sharesMint,
    baseMint,
    status: readU8(d, 169) as 0 | 1 | 2,
    managementFeeBps: readU16(d, 170),
    performanceFeeBps: readU16(d, 172),
    insurancePremiumBps: readU16(d, 174),
    minDeposit: readU64(d, 176),
    totalValue,
    sharesOutstanding,
    hwm,
    lastAccrualTs: readI64(d, 248),
    pendingShares: readU64(d, 256),
    pendingValue: readU64(d, 264),
    createdAt: readI64(d, 272),
    lastRebalanceAt: readI64(d, 280),
    rebalanceCount: readU64(d, 288),
    oracleMarked: readU8(d, 296) !== 0,
    sharePrice,
  };
}

export interface WithdrawalRequestState {
  vault: string;
  user: string;
  shares: number;
  value: number;
  settlementSlot: number;
  settled: boolean;
  bump: number;
}

/** Decodes the on-chain `WithdrawalRequest` account. */
export function decodeWithdrawalRequest(data: Uint8Array): WithdrawalRequestState {
  requireMinLen(data, 98, "withdrawal request account");
  const d = data;
  return {
    vault: pubkeyAt(d, 8).toBase58(),
    user: pubkeyAt(d, 40).toBase58(),
    shares: readU64(d, 72),
    value: readU64(d, 80),
    settlementSlot: readU64(d, 88),
    settled: readU8(d, 96) !== 0,
    bump: readU8(d, 97),
  };
}

export interface OnchainUserPosition {
  vaultPda: string;
  shares: number;
  sharesAccount: string;
  pending: {
    shares: number;
    value: number;
    settlementSlot: number;
    settled: boolean;
  } | null;
  /** Base tokens claimable now via `settle_withdraw` (0 when none due). */
  claimable: number;
}

export async function fetchVaultState(
  connection: Connection,
  meta: OnchainVaultMeta,
  programId: PublicKey = VAULT_PROGRAM_ID,
): Promise<VaultState> {
  const [vault] = vaultPda(new PublicKey(meta.authority), new PublicKey(meta.baseMint), programId);
  const info = await connection.getAccountInfo(vault);
  if (!info) throw new Error(`Vault account ${vault.toBase58()} not found on-chain`);
  return decodeVaultAccount(info.data);
}

export async function fetchUserPosition(
  connection: Connection,
  meta: OnchainVaultMeta,
  user: PublicKey,
  programId: PublicKey = VAULT_PROGRAM_ID,
): Promise<OnchainUserPosition | null> {
  const [vault] = vaultPda(new PublicKey(meta.authority), new PublicKey(meta.baseMint), programId);
  const [sharesMint] = sharesMintPda(vault, programId);
  const [request] = withdrawRequestPda(vault, user, programId);

  const userShares = await getUserAta(connection, sharesMint, user);
  const [tokenBalance, requestInfo, currentSlot] = await Promise.all([
    connection.getTokenAccountBalance(userShares).catch(() => null),
    connection.getAccountInfo(request),
    connection.getSlot().catch(() => 0),
  ]);

  const shares = tokenBalance ? Number(tokenBalance.value.amount) : 0;
  let pending: OnchainUserPosition["pending"] = null;
  let claimable = 0;
  if (requestInfo) {
    const req = decodeWithdrawalRequest(requestInfo.data);
    pending = {
      shares: req.shares,
      value: req.value,
      settlementSlot: req.settlementSlot,
      settled: req.settled,
    };
    if (!req.settled && currentSlot >= req.settlementSlot) claimable = req.shares;
  }

  return {
    vaultPda: vault.toBase58(),
    shares,
    sharesAccount: userShares.toBase58(),
    pending,
    claimable,
  };
}
