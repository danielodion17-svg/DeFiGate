import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import pool from "../db.js";
import dotenv from "dotenv";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runMigrations() {
  try {
    console.log("🔄 Running database migrations...");

    // Get all migration files
    const migrateDir = path.join(__dirname, "../migrate");
    const allFiles = fs.readdirSync(migrateDir).sort();
    const files = allFiles.filter(file => {
      // Only run incremental migration files with numeric prefixes.
      // Ignore schema export snapshots and other non-migration artifacts.
      return /^\d+_[^/]+\.sql$/.test(file) && !file.endsWith('_schema.sql');
    });

    console.log(`Found ${files.length} migration files (from ${allFiles.length} total files)`);

    for (const file of files) {
      console.log(`📄 Running migration: ${file}`);
      const filePath = path.join(migrateDir, file);
      const sql = fs.readFileSync(filePath, 'utf8');

      // Execute the full SQL file as a single batch. PostgreSQL supports multiple statements in one query.
      await pool.query(sql);

      console.log(`✅ Migration ${file} completed`);
    }

    console.log("🎉 All migrations completed successfully");
    return true;

  } catch (error) {
    console.error("❌ Migration failed:", error);
    return false;
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runMigrations();
}

export default runMigrations;
