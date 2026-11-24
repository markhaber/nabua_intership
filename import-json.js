require("dotenv").config();

const fs = require("fs");
const path = require("path");
const mysql = require("mysql2/promise");

async function main() {
  const required = ["DB_HOST", "DB_USER", "DB_PASSWORD", "DB_NAME"];
  const missing = required.filter(key => !process.env[key]);
  if (missing.length) {
    throw new Error(`Missing database environment variables: ${missing.join(", ")}`);
  }

  const file = path.join(__dirname, "..", "db.json");
  const data = JSON.parse(fs.readFileSync(file, "utf8"));
  if (!Array.isArray(data.users) || !Array.isArray(data.applications)) {
    throw new Error("db.json must contain users and applications arrays.");
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
  const connection = await pool.getConnection();
  let usersAdded = 0;
  let applicationsAdded = 0;

  try {
    await connection.beginTransaction();
    for (const user of data.users) {
      if (!user.username || !user.name || !user.role || !user.hash) {
        throw new Error("db.json contains a user missing username, name, role, or password hash.");
      }
      const [result] = await connection.execute(
        "INSERT IGNORE INTO users (username, name, role, hash) VALUES (?, ?, ?, ?)",
        [user.username, user.name, user.role, user.hash]
      );
      usersAdded += result.affectedRows;
    }

    for (const app of data.applications) {
      const username = app.user || app.username;
      if (!app.id || !username || !app.name || !app.email || !app.phone || !app.school || !app.course) {
        throw new Error("db.json contains an application missing required fields.");
      }
      const [result] = await connection.execute(
        `INSERT IGNORE INTO applications
         (id, username, name, email, phone, school, course, year, office, office2, hours, \`start\`, msg, status, note, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [app.id, username, app.name, app.email, app.phone, app.school, app.course, app.year || "",
          app.office || "", app.office2 || "", Number(app.hours) || 240, app.start || "",
          app.msg || "", app.status || "Pending", app.note || "", Number(app.at) || Date.now()]
      );
      applicationsAdded += result.affectedRows;
    }
    await connection.commit();
    console.log(`Imported ${usersAdded} users and ${applicationsAdded} applications. Existing rows were preserved.`);
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
    await pool.end();
  }
}

main().catch(error => {
  console.error("Unable to import db.json:", error.message);
  process.exitCode = 1;
});
