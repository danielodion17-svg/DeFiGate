import { DataTypes } from "sequelize";
import sequelize from "../config/database.js";

const AccountLedger = sequelize.define(
  "AccountLedger",
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    transaction_id: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    user_id: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    wallet_id: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    asset: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: "USDC",
    },
    debit_account_id: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    credit_account_id: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    amount: {
      type: DataTypes.DECIMAL(36, 18),
      allowNull: false,
    },
    entry_type: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: "ledger",
    },
    reference_id: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    metadata: {
      type: DataTypes.JSONB,
      allowNull: true,
    },
    created_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    tableName: "account_ledger",
    timestamps: false,
  }
);

export default AccountLedger;
