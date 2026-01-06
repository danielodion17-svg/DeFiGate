import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import dotenv from "dotenv";

dotenv.config();

const app = express();

app.use(cors());
app.use(bodyParser.json());

// Routes
import mentoRoutes from "./routes/mento.js";
import walletRoutes from "./routes/wallet.js";
import userRoutes from "./routes/user.js";

app.use("/mento", mentoRoutes);
app.use("/wallet", walletRoutes);
app.use("/user", userRoutes);

app.get("/", (req, res) => {
  res.send("DeFiGate Backend Running");
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
