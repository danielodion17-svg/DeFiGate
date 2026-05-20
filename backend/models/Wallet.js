import { DataTypes } from "sequelize";
import sequelize from "../config/database.js";

const Wallet = sequelize.define(
  "Wallet",
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    user_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: "users",
        key: "id",
      },
    },
    provider: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    provider_wallet_id: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    address: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    chain: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    encrypted_private_key: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    last_scanned_signature: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    last_scanned_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    last_accessed_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
    last_synced_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    is_primary: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
  },
  {
    tableName: "wallets",
    timestamps: true,
    createdAt: "created_at",
    updatedAt: "updated_at",
    indexes: [
      {
        unique: true,
        fields: ["user_id", "chain"],
        name: "wallets_user_chain_unique",
      },
    ],
  }
);

export default Wallet;
