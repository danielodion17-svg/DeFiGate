import Transaction from "../models/Transaction.js";
import { sequelize } from "../models/index.js";
import { creditAccount, getDerivedBalance } from "../services/accountService.js";

export const depositTestFunds = async (req, res) => {
  const userId = req.user?.id;
  const { amount, reference } = req.body;

  if (!userId) {
    return res.status(401).json({ ok: false, error: "Not authenticated" });
  }

  const depositAmount = parseFloat(amount);
  if (!depositAmount || depositAmount <= 0) {
    return res.status(400).json({ ok: false, error: "Valid deposit amount is required" });
  }

  const txReference = reference?.trim() || `test-deposit-${Date.now()}`;

  try {
    const existing = await Transaction.findOne({
      where: { user_id: userId, type: 'deposit', reference: txReference }
    });

    if (existing) {
      const existingBalance = await getDerivedBalance(userId, 'USDC');
      return res.json({
        ok: true,
        data: {
          transaction: existing,
          available_balance: existingBalance,
          message: "Existing deposit returned",
        },
      });
    }

    const transactionResult = await sequelize.transaction(async (tx) => {
      const createdTransaction = await Transaction.create({
        user_id: userId,
        type: 'deposit',
        amount: depositAmount,
        asset: 'USDC',
        description: `Test deposit of $${depositAmount}`,
        reference: txReference,
        tx_hash: `solana-deposit-${Date.now()}`,
        status: 'completed',
      }, { transaction: tx });

      await creditAccount(userId, depositAmount, {
        asset: 'USDC',
        txHash: `test-deposit-${txReference}`,
        metadata: { reference: txReference, source: 'test' },
        transaction: tx,
      });

      return createdTransaction;
    });

    const newBalance = await getDerivedBalance(userId, 'USDC');

    return res.json({
      ok: true,
      data: {
        transaction: transactionResult,
        available_balance: newBalance,
      },
      message: "Test deposit applied",
    });
  } catch (err) {
    console.error("depositTestFunds error", err);
    res.status(500).json({ ok: false, error: "Test deposit failed" });
  }
};
