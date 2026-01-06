import express from "express";
import { signup, signin } from "../controllers/userController.js";

const router = express.Router();

router.post("/signup", signup);
router.post("/signin", signin);

router.get("/test", (req, res) => {
  res.json({ ok: true, message: "User routes working" });
});

export default router;
