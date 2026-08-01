import * as anchor from "@coral-xyz/anchor";
import { Program, BN } from "@coral-xyz/anchor";
import { Keypair, LAMPORTS_PER_SOL, PublicKey, SystemProgram } from "@solana/web3.js";
import {
  createMint,
  getOrCreateAssociatedTokenAccount,
  mintTo,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { AtlasVault } from "../target/types/atlas_vault";

describe("atlas-vault", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.AtlasVault as Program<AtlasVault>;
  const registryProgram = anchor.workspace.AtlasManagerRegistry;
  const stakingProgram = anchor.workspace.AtlasStaking;

  const authority = provider.wallet.publicKey;
  const governance = provider.wallet.publicKey;
  const oracle = Keypair.generate();
  const oracle2 = Keypair.generate();
  const oracle3 = Keypair.generate();
  const riskEngine = Keypair.generate();
  const manager = Keypair.generate();
  const user = Keypair.generate();
  const keeper = provider.wallet.publicKey;

  const oracleSet = [oracle, oracle2, oracle3];

  const depositAmount = new BN(1_000_000);
  const managementFeeBps = 75;
  const performanceFeeBps = 2000;
  const insurancePremiumBps = 100;
  const minDeposit = new BN(100);
  const bondAmount = new BN(1_000_000);

  let baseMint: PublicKey;
  let bondMint: PublicKey;
  let vaultConfigPda: PublicKey;
  let vaultPda: PublicKey;
  let sharesMint: PublicKey;
  let vaultEscrowPda: PublicKey;
  let requestPda: PublicKey;
  let managerProfilePda: PublicKey;

  async function airdrop(pubkey: PublicKey) {
    await provider.connection.confirmTransaction(
      await provider.connection.requestAirdrop(pubkey, 2 * LAMPORTS_PER_SOL),
    );
  }

  async function ensureRegistryConfig() {
    const [config] = PublicKey.findProgramAddressSync(
      [Buffer.from("atlas_registry_config")],
      registryProgram.programId,
    );
    try {
      await registryProgram.methods
        .initializeConfig({
          oracle: oracle.publicKey,
          slashAuthority: governance,
          bondMint,
          bondAmount,
          scoreThreshold: 40,
        })
        .accounts({ config, governance, systemProgram: SystemProgram.programId })
        .rpc();
    } catch {
      // already initialized by another suite — re-applied below
    }
    await registryProgram.methods
      .updateConfig({
        oracle: oracle.publicKey,
        slashAuthority: governance,
        bondMint,
        bondAmount,
        scoreThreshold: 40,
      })
      .accounts({ config, governance })
      .rpc();
    return config;
  }

  async function registerManager(owner: Keypair): Promise<PublicKey> {
    await airdrop(owner.publicKey);
    const [profile] = PublicKey.findProgramAddressSync(
      [Buffer.from("manager"), owner.publicKey.toBuffer()],
      registryProgram.programId,
    );
    const [bond] = PublicKey.findProgramAddressSync(
      [Buffer.from("bond"), owner.publicKey.toBuffer()],
      stakingProgram.programId,
    );
    const [bondEscrow] = PublicKey.findProgramAddressSync(
      [Buffer.from("escrow"), bond.toBuffer()],
      stakingProgram.programId,
    );
    const ownerToken = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      provider.wallet.payer,
      bondMint,
      owner.publicKey,
    );
    await mintTo(
      provider.connection,
      provider.wallet.payer,
      bondMint,
      ownerToken.address,
      governance,
      10_000_000,
    );
    const [config] = PublicKey.findProgramAddressSync(
      [Buffer.from("atlas_registry_config")],
      registryProgram.programId,
    );
    await registryProgram.methods
      .register("Atlas LP")
      .accounts({
        config,
        profile,
        bond,
        bondEscrow,
        bondMint,
        owner: owner.publicKey,
        ownerToken: ownerToken.address,
        stakingProgram: stakingProgram.programId,
        systemProgram: SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([owner])
      .rpc();
    return profile;
  }

  it("bootstraps protocol config and a vault linked to an active manager", async () => {
    baseMint = await createMint(
      provider.connection,
      provider.wallet.payer,
      authority,
      authority,
      6,
    );
    bondMint = await createMint(
      provider.connection,
      provider.wallet.payer,
      governance,
      governance,
      6,
    );

    // Protocol config (vault_config PDA) — governance bootstraps the M-of-N
    // oracle set, risk engine, and fee recipients.
    [vaultConfigPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("vault_config")],
      program.programId,
    );
    await program.methods
      .initializeConfig({
        oracles: oracleSet.map((k) => k.publicKey),
        minOracleSignatures: 3,
        riskEngine: riskEngine.publicKey,
        treasury: governance,
        insurance: governance,
        veatlas: governance,
        reserveTarget: new BN(0),
      })
      .accounts({ config: vaultConfigPda, governance, systemProgram: SystemProgram.programId })
      .rpc();

    // Manager profile with staking bond (spec §3.3).
    await ensureRegistryConfig();
    managerProfilePda = await registerManager(manager);

    // Vault deployment. authority (deployer) != manager (LP fee recipient).
    [vaultPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("atlas_vault"), authority.toBuffer(), baseMint.toBuffer()],
      program.programId,
    );
    [sharesMint] = PublicKey.findProgramAddressSync(
      [Buffer.from("shares"), vaultPda.toBuffer()],
      program.programId,
    );
    [vaultEscrowPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("escrow"), vaultPda.toBuffer(), baseMint.toBuffer()],
      program.programId,
    );

    await program.methods
      .initialize({
        manager: manager.publicKey,
        managementFeeBps,
        performanceFeeBps,
        insurancePremiumBps,
        minDeposit,
      })
      .accounts({
        vault: vaultPda,
        sharesMint,
        vaultEscrow: vaultEscrowPda,
        config: vaultConfigPda,
        managerProfile: managerProfilePda,
        baseMint,
        authority,
        systemProgram: SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc();

    const vault = await program.account.vault.fetch(vaultPda);
    expect(vault.manager.equals(manager.publicKey)).toBe(true);
    expect(vault.managerProfile.equals(managerProfilePda)).toBe(true);
    expect(vault.managementFeeBps).toBe(managementFeeBps);
  });

  it("rejects deposits from an unlinked manager or below minimum", async () => {
    const other = Keypair.generate();
    await airdrop(user.publicKey);
    const [unlinkedProfile] = PublicKey.findProgramAddressSync(
      [Buffer.from("manager"), other.publicKey.toBuffer()],
      registryProgram.programId,
    );
    const userToken = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      provider.wallet.payer,
      baseMint,
      user.publicKey,
    );
    const userShares = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      provider.wallet.payer,
      sharesMint,
      user.publicKey,
    );
    await mintTo(
      provider.connection,
      provider.wallet.payer,
      baseMint,
      userToken.address,
      authority,
      10_000_000,
    );

    await expect(
      program.methods
        .deposit(depositAmount)
        .accounts({
          config: vaultConfigPda,
          vault: vaultPda,
          managerProfile: unlinkedProfile,
          user: user.publicKey,
          userToken: userToken.address,
          vaultEscrow: vaultEscrowPda,
          sharesMint,
          userShares,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([user])
        .rpc(),
    ).rejects.toThrow();

    await expect(
      program.methods
        .deposit(new BN(10))
        .accounts({
          config: vaultConfigPda,
          vault: vaultPda,
          managerProfile: managerProfilePda,
          user: user.publicKey,
          userToken: userToken.address,
          vaultEscrow: vaultEscrowPda,
          sharesMint,
          userShares,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([user])
        .rpc(),
    ).rejects.toThrow();
  });

  it("accepts deposits and mints shares at NAV", async () => {
    const userToken = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      provider.wallet.payer,
      baseMint,
      user.publicKey,
    );
    const userShares = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      provider.wallet.payer,
      sharesMint,
      user.publicKey,
    );

    await program.methods
      .deposit(depositAmount)
      .accounts({
        config: vaultConfigPda,
        vault: vaultPda,
        managerProfile: managerProfilePda,
        user: user.publicKey,
        userToken: userToken.address,
        vaultEscrow: vaultEscrowPda,
        sharesMint,
        userShares,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([user])
      .rpc();

    const shares = await provider.connection.getTokenAccountBalance(userShares);
    // First deposit at par: 1:1.
    expect(shares.value.amount).toBe(depositAmount.toString());
    const vault = await program.account.vault.fetch(vaultPda);
    expect(vault.totalValue.toString()).toBe(depositAmount.toString());
    expect(vault.sharesOutstanding.toString()).toBe(depositAmount.toString());
  });

  it("oracle set marks NAV via the median of signed feeds", async () => {
    const values = [new BN(1_100_000), new BN(1_100_000), new BN(1_100_000)];
    await program.methods
      .updateValue(values)
      .accounts({ config: vaultConfigPda, vault: vaultPda })
      .remainingAccounts(
        oracleSet.map((k) => ({ pubkey: k.publicKey, isWritable: false, isSigner: true })),
      )
      .signers(oracleSet)
      .rpc();

    const vault = await program.account.vault.fetch(vaultPda);
    expect(vault.totalValue.toString()).toBe("1100000");
    // 10% gain on 1M units, 20% perf fee → 20,000 units accrued, 20% to protocol.
    expect(vault.accruedPerfManager.toString()).toBe("16000");
    expect(vault.accruedPerfProtocol.toString()).toBe("4000");
    // HWM ratchets to the new NAVPS.
    expect(vault.hwm.toString()).toBe("1100000000");
  });

  it("applies the median when signed feeds disagree", async () => {
    // Two low / one high and one low / two high both resolve to the 1.1M median.
    const values = [new BN(1_050_000), new BN(1_100_000), new BN(1_150_000)];
    await program.methods
      .updateValue(values)
      .accounts({ config: vaultConfigPda, vault: vaultPda })
      .remainingAccounts(
        oracleSet.map((k) => ({ pubkey: k.publicKey, isWritable: false, isSigner: true })),
      )
      .signers(oracleSet)
      .rpc();

    const vault = await program.account.vault.fetch(vaultPda);
    expect(vault.totalValue.toString()).toBe("1100000");
  });

  it("rejects a median beyond the max value move bound", async () => {
    // 1.1M → 800k is a 27% mark, exceeding the 20% per-mark bound.
    const values = [new BN(800_000), new BN(800_000), new BN(800_000)];
    await expect(
      program.methods
        .updateValue(values)
        .accounts({ config: vaultConfigPda, vault: vaultPda })
        .remainingAccounts(
          oracleSet.map((k) => ({ pubkey: k.publicKey, isWritable: false, isSigner: true })),
        )
        .signers(oracleSet)
        .rpc(),
    ).rejects.toThrow();
  });

  it("rejects non-oracle value updates", async () => {
    const values = [new BN(1_200_000), new BN(1_200_000), new BN(1_200_000)];
    await expect(
      program.methods
        .updateValue(values)
        .accounts({ config: vaultConfigPda, vault: vaultPda })
        .remainingAccounts(
          [riskEngine, oracle2, oracle3].map((k) => ({
            pubkey: k.publicKey,
            isWritable: false,
            isSigner: true,
          })),
        )
        .signers([riskEngine, oracle2, oracle3])
        .rpc(),
    ).rejects.toThrow();
  });

  it("rejects duplicate oracle signers", async () => {
    const values = [new BN(1_000_000), new BN(1_000_000), new BN(1_000_000)];
    await expect(
      program.methods
        .updateValue(values)
        .accounts({ config: vaultConfigPda, vault: vaultPda })
        .remainingAccounts(
          [oracle, oracle, oracle2].map((k) => ({
            pubkey: k.publicKey,
            isWritable: false,
            isSigner: true,
          })),
        )
        .signers([oracle, oracle2])
        .rpc(),
    ).rejects.toThrow();
  });

  it("risk engine pauses the vault; authority resumes", async () => {
    await program.methods
      .setStatus({ paused: {} })
      .accounts({ config: vaultConfigPda, vault: vaultPda, authority: riskEngine.publicKey })
      .signers([riskEngine])
      .rpc();
    let vault = await program.account.vault.fetch(vaultPda);
    expect(vault.status.paused).toBe(true);

    // Deposits are blocked while paused.
    const userToken = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      provider.wallet.payer,
      baseMint,
      user.publicKey,
    );
    const userShares = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      provider.wallet.payer,
      sharesMint,
      user.publicKey,
    );
    await expect(
      program.methods
        .deposit(new BN(100))
        .accounts({
          config: vaultConfigPda,
          vault: vaultPda,
          managerProfile: managerProfilePda,
          user: user.publicKey,
          userToken: userToken.address,
          vaultEscrow: vaultEscrowPda,
          sharesMint,
          userShares,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([user])
        .rpc(),
    ).rejects.toThrow();

    await program.methods
      .setStatus({ active: {} })
      .accounts({ config: vaultConfigPda, vault: vaultPda, authority })
      .rpc();
    vault = await program.account.vault.fetch(vaultPda);
    expect(vault.status.active).toBe(true);
  });

  it("settles fees through the waterfall and defers half the performance fee", async () => {
    const managerToken = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      provider.wallet.payer,
      baseMint,
      manager.publicKey,
    );
    const insuranceToken = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      provider.wallet.payer,
      baseMint,
      governance,
    );
    const treasuryToken = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      provider.wallet.payer,
      baseMint,
      governance,
    );
    const veatlasToken = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      provider.wallet.payer,
      baseMint,
      governance,
    );
    const [feeEscrow] = PublicKey.findProgramAddressSync(
      [Buffer.from("fee_escrow"), vaultPda.toBuffer(), manager.publicKey.toBuffer()],
      program.programId,
    );
    const [feeEscrowToken] = PublicKey.findProgramAddressSync(
      [Buffer.from("fee_escrow_ata"), vaultPda.toBuffer(), manager.publicKey.toBuffer()],
      program.programId,
    );

    await program.methods
      .settleFees()
      .accounts({
        config: vaultConfigPda,
        vault: vaultPda,
        vaultEscrow: vaultEscrowPda,
        baseMint,
        managerToken: managerToken.address,
        insuranceToken: insuranceToken.address,
        treasuryToken: treasuryToken.address,
        veatlasToken: veatlasToken.address,
        feeEscrow,
        feeEscrowToken,
        keeper,
        systemProgram: SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc();

    const vault = await program.account.vault.fetch(vaultPda);
    expect(vault.accruedPerfManager.toString()).toBe("0");
    expect(vault.accruedPerfProtocol.toString()).toBe("0");

    const escrow = await program.account.feeEscrow.fetch(feeEscrow);
    // 16,000 manager perf fee → 8,000 immediate + 8,000 deferred.
    expect(escrow.amount.toString()).toBe("8000");

    const escrowBalance = await provider.connection.getTokenAccountBalance(feeEscrowToken);
    expect(escrowBalance.value.amount).toBe("8000");
  });

  it("releases the matured fee escrow to the manager", async () => {
    const [feeEscrow] = PublicKey.findProgramAddressSync(
      [Buffer.from("fee_escrow"), vaultPda.toBuffer(), manager.publicKey.toBuffer()],
      program.programId,
    );
    const [feeEscrowToken] = PublicKey.findProgramAddressSync(
      [Buffer.from("fee_escrow_ata"), vaultPda.toBuffer(), manager.publicKey.toBuffer()],
      program.programId,
    );
    const managerToken = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      provider.wallet.payer,
      baseMint,
      manager.publicKey,
    );

    const before = await provider.connection.getTokenAccountBalance(managerToken.address);
    await program.methods
      .releaseFeeEscrow()
      .accounts({
        feeEscrow,
        feeEscrowToken,
        managerToken: managerToken.address,
        baseMint,
        manager: manager.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([manager])
      .rpc();

    const after = await provider.connection.getTokenAccountBalance(managerToken.address);
    expect(new BN(after.value.amount).sub(new BN(before.value.amount)).toString()).toBe("8000");
  });

  it("queues redemptions and settles pro-rata against liquid escrow", async () => {
    // Speed up the queue so settlement can happen within the test.
    await program.methods
      .updateConfig({ settlementSlots: new BN(0), deferralSecs: new BN(0) })
      .accounts({ config: vaultConfigPda, governance })
      .rpc();

    [requestPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("withdraw"), vaultPda.toBuffer(), user.publicKey.toBuffer()],
      program.programId,
    );
    const userShares = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      provider.wallet.payer,
      sharesMint,
      user.publicKey,
    );
    const userToken = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      provider.wallet.payer,
      baseMint,
      user.publicKey,
    );

    await program.methods
      .requestWithdraw(depositAmount)
      .accounts({
        config: vaultConfigPda,
        vault: vaultPda,
        request: requestPda,
        user: user.publicKey,
        userShares,
        sharesMint,
        systemProgram: SystemProgram.programId,
      })
      .signers([user])
      .rpc();

    const request = await program.account.withdrawalRequest.fetch(requestPda);
    expect(request.shares.toString()).toBe(depositAmount.toString());
    expect(request.settled).toBe(false);

    await program.methods
      .settleWithdraw()
      .accounts({
        config: vaultConfigPda,
        vault: vaultPda,
        request: requestPda,
        user: user.publicKey,
        vaultEscrow: vaultEscrowPda,
        userToken: userToken.address,
        userShares,
        sharesMint,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([user])
      .rpc();

    const settled = await program.account.withdrawalRequest.fetch(requestPda);
    expect(settled.settled).toBe(true);

    // The vault was short of cash vs. the oracle-marked gain, so the fill was
    // pro-rata: the user keeps the unfilled shares.
    const remaining = await provider.connection.getTokenAccountBalance(userShares);
    expect(remaining.value.amount).toBe("92593");
  });

  it("rejects non-governance parameter updates", async () => {
    await expect(
      program.methods
        .updateParams({ managementFeeBps: 10 })
        .accounts({ config: vaultConfigPda, vault: vaultPda, governance: manager.publicKey })
        .signers([manager])
        .rpc(),
    ).rejects.toThrow();
  });

  it("keeper rebalance respects the minimum interval cooldown", async () => {
    // initialize() stamps last_rebalance_at, so an immediate keeper rebalance
    // must be rejected (MIN_REBALANCE_INTERVAL_SECS = 6h). The success path is
    // covered by the `cooldown_elapsed` unit tests in rebalance.rs.
    await expect(
      program.methods
        .rebalance()
        .accounts({ config: vaultConfigPda, vault: vaultPda, keeper })
        .rpc(),
    ).rejects.toThrow();
  });
});
