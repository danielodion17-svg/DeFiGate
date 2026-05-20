import { sequelize, User, Balance, Transaction, Transfer } from "../models/index.js";
import dotenv from "dotenv";

dotenv.config();

async function initializeDatabase() {
  try {
    // Test connection
    await sequelize.authenticate();
    console.log("✅ Database connection successful");

    // Sync models (creates tables if they don't exist)
    // Use { alter: true } to alter existing tables in non-production environments.
    await sequelize.sync({ alter: process.env.NODE_ENV !== "production" });
    console.log("✅ Database tables synchronized");

    // Initialize default data if needed
    await initializeDefaultData();
    console.log("✅ Database initialization complete");

    process.exit(0);
  } catch (error) {
    console.error("❌ Database initialization failed:", error);
    process.exit(1);
  }
}

async function initializeDefaultData() {
  // Add any seed data or default records here if needed
  // Example: Create test users, initial balances, etc.
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  initializeDatabase();
}

export default initializeDatabase;
