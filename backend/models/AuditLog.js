import { DataTypes } from "sequelize";
import sequelize from "../config/database.js";

const AuditLog = sequelize.define(
  "AuditLog",
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    action: {
      type: DataTypes.STRING(100),
      allowNull: false,
    },
    user_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: {
        model: "users",
        key: "id",
      },
    },
    wallet_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: {
        model: "wallets",
        key: "id",
      },
    },
    transaction_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: {
        model: "transactions",
        key: "id",
      },
    },
    tx_hash: {
      type: DataTypes.STRING(200),
      allowNull: true,
    },
    amount: {
      type: DataTypes.DECIMAL(36, 18),
      allowNull: true,
    },
    asset: {
      type: DataTypes.STRING(20),
      allowNull: true,
    },
    metadata: {
      type: DataTypes.JSONB,
      allowNull: true,
    },
    request_id: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },
    before_state: {
      type: DataTypes.JSONB,
      allowNull: true,
    },
    after_state: {
      type: DataTypes.JSONB,
      allowNull: true,
    },
    severity: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: 'info',
    },
    ip_address: {
      type: DataTypes.INET,
      allowNull: true,
    },
    user_agent: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
  },
  {
    tableName: "audit_logs",
    timestamps: true,
    createdAt: "created_at",
    updatedAt: false,
  }
);

export default AuditLog;