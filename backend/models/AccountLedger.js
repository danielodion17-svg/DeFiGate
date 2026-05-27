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
    entry_type: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: "ledger",
    },
    amount: {
      type: DataTypes.DECIMAL(36, 18),
      allowNull: false,
    },
    tx_hash: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    reference_id: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    transfer_id: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    metadata: {
      type: DataTypes.JSONB,
      allowNull: true,
    },
  },
  {
    tableName: "account_ledger",
    timestamps: true,
    createdAt: "created_at",
    updatedAt: false,
  }
);

export default AccountLedger;
