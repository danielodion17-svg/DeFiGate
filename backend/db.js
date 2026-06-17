import dotenv from "dotenv";
dotenv.config();

import pkg from "pg";
const { Pool } = pkg;
import { getDatabaseUrl } from "./config/dbResolver.js";

const connectionString = getDatabaseUrl();
if (!connectionString) {
  throw new Error("Missing DATABASE_URL configuration. Please set DATABASE_URL, SUPABASE_DATABASE_URL, or LOCAL_DATABASE_URL.");
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
