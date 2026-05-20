import { Sequelize } from "sequelize";
import dotenv from "dotenv";

dotenv.config();

const databaseUrl = process.env.SUPABASE_DATABASE_URL || process.env.DATABASE_URL || process.env.LOCAL_DATABASE_URL;
if (!databaseUrl) {
  throw new Error("SUPABASE_DATABASE_URL, DATABASE_URL, or LOCAL_DATABASE_URL must be defined in environment variables.");
}

const useSsl = !databaseUrl.includes("localhost") && !databaseUrl.includes("127.0.0.1");
const sequelize = new Sequelize(databaseUrl, {
  dialect: "postgres",
  logging: process.env.NODE_ENV === "development" ? console.log : false,
  pool: {
    max: 5,
    min: 0,
    acquire: 30000,
    idle: 10000,
  },
  dialectOptions: useSsl
    ? {
        ssl: {
          require: true,
          rejectUnauthorized: false,
        },
      }
    : {},
});

export default sequelize;
