import bcrypt from "bcrypt";
import pool from "../db.js";

export const signup = async (req, res) => {
  const { email, password } = req.body;

  try {
    const hash = await bcrypt.hash(password, 10);

    const result = await pool.query(
      `INSERT INTO users (email, password_hash)
       VALUES ($1, $2)
       RETURNING id, email, created_at`,
      [email, hash]
    );

    res.json({ ok: true, user: result.rows[0] });
  } catch (err) {
    if (err.code === "23505") {
      return res.status(400).json({ ok: false, error: "Email already exists" });
    }
    res.status(500).json({ ok: false, error: "Signup failed" });
  }
};

export const signin = async (req, res) => {
  const { email, password } = req.body;

  try {
    const result = await pool.query(
      `SELECT id, email, password_hash FROM users WHERE email = $1`,
      [email]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ ok: false, error: "Invalid credentials" });
    }

    const user = result.rows[0];
    const valid = await bcrypt.compare(password, user.password_hash);

    if (!valid) {
      return res.status(401).json({ ok: false, error: "Invalid credentials" });
    }

    res.json({
      ok: true,
      user: { id: user.id, email: user.email },
    });
  } catch {
    res.status(500).json({ ok: false, error: "Signin failed" });
  }
};
