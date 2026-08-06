import { Connection, Keypair, PublicKey, sendAndConfirmTransaction, Transaction } from "@solana/web3.js";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountInstruction,
  getAssociatedTokenAddressSync,
  createMintToInstruction,
} from "@solana/spl-token";

const ATLAS_MINT = new PublicKey("7roukPrgB6rjLrJ9mqHoiCrMTjwYzT8UKbxGgtTRVtEa");
const TREASURY = new PublicKey("AqsVGUdZKd7cKr3KJSW7mTM1BwTyyS4pKqDAT5qDQBnu");

function getKeypair(): Keypair {
  const secret = process.env.ATLAS_TREASURY_KEYPAIR ?? process.env.DEPLOYER_KEYPAIR;
  if (!secret) {
    console.error("Set ATLAS_TREASURY_KEYPAIR or DEPLOYER_KEYPAIR env var (JSON array)");
    process.exit(1);
  }
  return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(secret) as number[]));
}

async function main() {
  const keypair = getKeypair();
  console.log("Mint authority:", keypair.publicKey.toBase58());

  const connection = new Connection("https://api.devnet.solana.com", "confirmed");

  const mintInfo = await connection.getAccountInfo(ATLAS_MINT);
  if (!mintInfo) {
    console.error("ATLAS mint not found on Devnet");
    process.exit(1);
  }
  const mintData = mintInfo.data;
  const mintAuthorityOption = mintData.readUInt32LE(0);
  if (mintAuthorityOption !== 1) {
    console.error("ATLAS mint has no mint authority");
    process.exit(1);
  }
  const mintAuthority = new PublicKey(mintData.subarray(4, 36)).toBase58();
  console.log("Mint authority:", mintAuthority);

  if (mintAuthority !== keypair.publicKey.toBase58()) {
    console.error("Provided keypair is NOT the mint authority");
    process.exit(1);
  }

  const treasuryAta = getAssociatedTokenAddressSync(ATLAS_MINT, TREASURY, false, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID);
  console.log("Treasury ATA:", treasuryAta.toBase58());

  const tx = new Transaction();
  const ataInfo = await connection.getAccountInfo(treasuryAta).catch(() => null);
  if (!ataInfo) {
    console.log("Creating treasury ATA...");
    tx.add(
      createAssociatedTokenAccountInstruction(
        keypair.publicKey,
        treasuryAta,
        TREASURY,
        ATLAS_MINT,
        TOKEN_PROGRAM_ID,
        ASSOCIATED_TOKEN_PROGRAM_ID,
      ),
    );
  }

  const amount = 1_000_000_000_000; // 1,000,000 ATLAS (6 decimals)
  console.log("Minting", amount / 1_000_000, "ATLAS to treasury...");
  tx.add(createMintToInstruction(ATLAS_MINT, treasuryAta, keypair.publicKey, amount, [], TOKEN_PROGRAM_ID));

  const signature = await sendAndConfirmTransaction(connection, tx, [keypair], { commitment: "confirmed" });
  console.log("Signature:", signature);

  const balance = await connection.getTokenAccountBalance(treasuryAta);
  console.log("Treasury ATLAS balance:", balance.value.amount);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
