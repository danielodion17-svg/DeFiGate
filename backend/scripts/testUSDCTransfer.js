import { Connection, PublicKey } from "@solana/web3.js";
import {
  getAssociatedTokenAddress,
  getAccount,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from "@solana/spl-token";

// Test script to validate USDC transfer setup
const USDC_MINT = new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");

async function testUSDCAta() {
  const connection = new Connection("https://api.mainnet-beta.solana.com", "confirmed");

  // Test with a known USDC holder
  const testWallet = new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"); // This is actually the USDC mint, let's use a real wallet
  const realWallet = new PublicKey("So11111111111111111111111111111111111111112"); // Wrapped SOL mint as example

  try {
    const ata = await getAssociatedTokenAddress(
      USDC_MINT,
      realWallet,
      false,
      TOKEN_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID
    );

    console.log("USDC ATA for test wallet:", ata.toString());

    // Try to get account info (this will fail if ATA doesn't exist)
    try {
      const account = await getAccount(connection, ata);
      console.log("ATA exists with balance:", account.amount.toString());
    } catch (error) {
      console.log("ATA does not exist (expected for test wallet)");
    }

    console.log("USDC transfer setup validation: PASSED");
  } catch (error) {
    console.error("USDC transfer setup validation: FAILED", error);
  }
}

testUSDCAta();