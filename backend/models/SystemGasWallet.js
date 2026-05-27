import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';

const SystemGasWallet = sequelize.define(
  'SystemGasWallet',
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    purpose: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: 'system_gas',
    },
    address: {
      type: DataTypes.TEXT,
      allowNull: false,
      unique: true,
    },
    encrypted_private_key: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    external_signer: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    current_balance: {
      type: DataTypes.DECIMAL(20, 9),
      allowNull: false,
      defaultValue: 0,
    },
    last_refilled_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
  },
  {
    tableName: 'system_gas_wallets',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  }
);

export default SystemGasWallet;
