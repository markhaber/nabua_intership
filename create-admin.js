require("dotenv").config();

const bcrypt = require("bcryptjs");
const mysql = require("mysql2/promise");

async function main() {
  const username = process.env.ADMIN_USERNAME;
  const name = process.env.ADMIN_NAME;
  const password = process.env.ADMIN_PASSWORD;
  const required = ["DB_HOST", "DB_USER", "DB_PASSWORD", "DB_NAME"];
  const missing = required.filter(key => !process.env[key]);

  if (missing.length) {
    throw new Error(`Missing database environment variables: ${missing.join(", ")}`);
  }
  if (!username || !/^[a-z0-9._-]{3,30}$/i.test(username)) {
    throw new Error("Set ADMIN_USERNAME to 3-30 letters, numbers, dots, underscores, or hyphens.");
  }
  if (!name || name.trim().length > 100) {
    throw new Error("Set ADMIN_NAME to a non-empty name of at most 100 characters.");
  }
  if (!password || password.length < 12) {
    throw new Error("Set ADMIN_PASSWORD to a password of at least 12 characters.");
  }

  const ssl = process.env.NODE_ENV === "production" || process.env.DB_SSL !== "false"
    ? { rejectUnauthorized: true }
    : undefined;
  const pool = mysql.createPool({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    connectionLimit: 5,
    ssl
  });

  try {
    const hash = await bcrypt.hash(password, 10);
    await pool.execute(
      "INSERT INTO users (username, name, role, hash) VALUES (?, ?, 'admin', ?)",
      [username.toLowerCase(), name.trim(), hash]
    );
    console.log(`Created admin account "${username.toLowerCase()}".`);
  } finally {
    await pool.end();
  }
}

main().catch(error => {
  console.error("Unable to create admin account:", error.message);
  process.exitCode = 1;
});
