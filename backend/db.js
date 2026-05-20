import dotenv from "dotenv";
dotenv.config();

import pkg from "pg";
const { Pool } = pkg;

const connectionString = process.env.SUPABASE_DATABASE_URL || process.env.DATABASE_URL || process.env.LOCAL_DATABASE_URL;
if (!connectionString) {
  throw new Error("SUPABASE_DATABASE_URL, DATABASE_URL or LOCAL_DATABASE_URL must be defined in environment variables.");
}

const useSsl = !connectionString.includes("localhost") && !connectionString.includes("127.0.0.1");
const poolOptions = {
  connectionString,
};

if (useSsl) {
  poolOptions.ssl = {
    rejectUnauthorized: false,
  };
}

const pool = new Pool(poolOptions);

export default pool;
