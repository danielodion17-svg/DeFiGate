import { DataTypes } from "sequelize";
import sequelize from "../config/database.js";

const Transaction = sequelize.define(
  "Transaction",
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
    type: {
      type: DataTypes.ENUM("deposit", "transfer", "withdrawal"),
      allowNull: false,
    },
    amount: {
      type: DataTypes.DECIMAL(20, 6),
      allowNull: false,
    },
    asset: {
      type: DataTypes.STRING,
      allowNull: true,
      defaultValue: "USDC",
    },
    status: {
      type: DataTypes.ENUM(
        "pending",
        "pending_review",
        "approved",
        "broadcasting",
        "broadcasted",
        "confirmed",
        "completed",
        "failed",
        "rejected"
      ),
      defaultValue: "pending",
    },
    tx_hash: {
      type: DataTypes.STRING,
    },
    recipient_address: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    wallet_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: {
        model: "wallets",
        key: "id",
      },
    },
    idempotency_key: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    broadcasted_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    confirmed_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    failed_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    failure_reason: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    network_fee: {
      type: DataTypes.DECIMAL(20, 6),
      defaultValue: 0,
    },
    reference: {
      type: DataTypes.STRING,
    },
  },
  {
    tableName: "transactions",
    timestamps: true,
    createdAt: "created_at",
    updatedAt: false,
  }
);

export default Transaction;
