import { Sequelize } from "sequelize";
import { getDatabaseUrl } from "./dbResolver.js";

const databaseUrl = getDatabaseUrl();

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
