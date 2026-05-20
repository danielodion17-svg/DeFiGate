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
    type: {
      type: DataTypes.ENUM("deposit", "withdrawal", "adjustment", "reconciliation"),
      allowNull: false,
    },
    amount: {
      type: DataTypes.DECIMAL(20, 6),
      allowNull: false,
    },
    tx_hash: {
      type: DataTypes.TEXT,
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
