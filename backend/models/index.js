import sequelize from "../config/database.js";
import User from "./User.js";
import Account from "./Account.js";
import Transaction from "./Transaction.js";
import Wallet from "./Wallet.js";
import AccountLedger from "./AccountLedger.js";
import AuditLog from "./AuditLog.js";

// ========== ASSOCIATIONS (CANONICAL ONLY) ==========

// User -> Wallet (One-to-one via unique index)
User.hasMany(Wallet, { foreignKey: "user_id", onDelete: "CASCADE" });
Wallet.belongsTo(User, { foreignKey: "user_id" });

// User -> Account/Balances (One-to-Many per asset)
User.hasMany(Account, { foreignKey: "user_id", onDelete: "CASCADE" });
Account.belongsTo(User, { foreignKey: "user_id" });

// User -> Transaction (One-to-Many)
User.hasMany(Transaction, { foreignKey: "user_id", onDelete: "CASCADE" });
Transaction.belongsTo(User, { foreignKey: "user_id" });

// Wallet -> Transaction (One-to-Many)
Wallet.hasMany(Transaction, { foreignKey: "wallet_id", onDelete: "SET NULL" });
Transaction.belongsTo(Wallet, { foreignKey: "wallet_id" });

// Transaction -> AccountLedger (One-to-Many, immutable)
Transaction.hasMany(AccountLedger, { foreignKey: "transaction_id", onDelete: "CASCADE" });
AccountLedger.belongsTo(Transaction, { foreignKey: "transaction_id" });

// Wallet -> AccountLedger (One-to-Many)
Wallet.hasMany(AccountLedger, { foreignKey: "wallet_id", onDelete: "SET NULL" });
AccountLedger.belongsTo(Wallet, { foreignKey: "wallet_id" });

// User -> AccountLedger (One-to-Many)
User.hasMany(AccountLedger, { foreignKey: "user_id", onDelete: "CASCADE" });
AccountLedger.belongsTo(User, { foreignKey: "user_id" });

export { sequelize, User, Account, Transaction, Wallet, AccountLedger, AuditLog };
