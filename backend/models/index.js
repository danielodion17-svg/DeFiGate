import sequelize from "../config/database.js";
import User from "./User.js";
import Account from "./Account.js";
import Transaction from "./Transaction.js";
import Transfer from "./Transfer.js";
import Wallet from "./Wallet.js";
import LedgerEntry from "./LedgerEntry.js";
import AccountLedger from "./AccountLedger.js";
import AuditLog from "./AuditLog.js";

// ========== ASSOCIATIONS ==========

// User -> Wallet (One-to-Many)
User.hasMany(Wallet, { foreignKey: "user_id", onDelete: "CASCADE" });
Wallet.belongsTo(User, { foreignKey: "user_id" });

// User -> Account (One-to-Many)
User.hasMany(Account, { foreignKey: "user_id", onDelete: "CASCADE" });
Account.belongsTo(User, { foreignKey: "user_id" });

// User -> Transaction (One-to-Many)
User.hasMany(Transaction, { foreignKey: "user_id", onDelete: "CASCADE" });
Transaction.belongsTo(User, { foreignKey: "user_id" });

// Transaction -> LedgerEntry (One-to-Many)
Transaction.hasMany(LedgerEntry, { foreignKey: "transaction_id", onDelete: "CASCADE" });
LedgerEntry.belongsTo(Transaction, { foreignKey: "transaction_id" });

// Account -> LedgerEntry (Two roles)
Account.hasMany(LedgerEntry, { foreignKey: "debit_account_id", as: "debits", onDelete: "CASCADE" });
Account.hasMany(LedgerEntry, { foreignKey: "credit_account_id", as: "credits", onDelete: "CASCADE" });
LedgerEntry.belongsTo(Account, { foreignKey: "debit_account_id", as: "debitAccount" });
LedgerEntry.belongsTo(Account, { foreignKey: "credit_account_id", as: "creditAccount" });

Account.hasMany(AccountLedger, { foreignKey: "user_id", onDelete: "CASCADE" });
AccountLedger.belongsTo(Account, { foreignKey: "user_id" });
Wallet.hasMany(AccountLedger, { foreignKey: "wallet_id", onDelete: "SET NULL" });
AccountLedger.belongsTo(Wallet, { foreignKey: "wallet_id" });

// User -> Transfer (One-to-Many) - Sender
User.hasMany(Transfer, { 
  foreignKey: "sender_id", 
  as: "sentTransfers",
  onDelete: "CASCADE" 
});
Transfer.belongsTo(User, { 
  foreignKey: "sender_id", 
  as: "sender" 
});

// User -> Transfer (One-to-Many) - Receiver
User.hasMany(Transfer, { 
  foreignKey: "receiver_id", 
  as: "receivedTransfers",
  onDelete: "CASCADE" 
});
Transfer.belongsTo(User, { 
  foreignKey: "receiver_id", 
  as: "receiver" 
});

export { sequelize, User, Account, Transaction, Transfer, Wallet, LedgerEntry, AccountLedger, AuditLog };
