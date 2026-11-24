require("dotenv").config();

const express = require("express");
const session = require("express-session");
const bcrypt = require("bcryptjs");
const fs = require("fs");
const path = require("path");
const mysql = require("mysql2");
const MySQLStore = require("express-mysql-session")(session);

const app = express();
app.set("trust proxy", 1);
const PORT = process.env.PORT || 3000;
const DB_FILE = path.join(__dirname, "db.json");
const production = process.env.NODE_ENV === "production";
const mysqlConfigured = Boolean(
  process.env.DB_HOST &&
  process.env.DB_USER &&
  process.env.DB_PASSWORD &&
  process.env.DB_NAME
);

const OFFICES = ["mdrrmo", "agri", "mcr", "mswdo", "mho", "meemo"];
const STATUSES = ["Pending", "Under Review", "Approved", "Rejected"];

/* ---------- database ---------- */
const useMysql = production || mysqlConfigured;
let pool = null;
let callbackPool = null;
let db = null;

if (useMysql) {
  if (!mysqlConfigured) {
    throw new Error("Production requires DB_HOST, DB_USER, DB_PASSWORD, and DB_NAME.");
  }
  const ssl = production || process.env.DB_SSL === "true"
    ? { rejectUnauthorized: production || process.env.DB_SSL_REJECT_UNAUTHORIZED !== "false" }
    : undefined;
  callbackPool = mysql.createPool({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    connectionLimit: 5,
    ssl
  });
  pool = callbackPool.promise();
  db = {
    async users() {
      const [rows] = await pool.query("SELECT username, name, role, hash FROM users");
      return rows;
    },
    async applications() {
      const [rows] = await pool.query("SELECT * FROM applications ORDER BY created_at DESC");
      return rows.map(row => ({ ...row, user: row.username, at: Number(row.created_at) }));
    }
  };
} else {
  function loadDB() {
    try {
      const data = JSON.parse(fs.readFileSync(DB_FILE, "utf8"));
      return {
        users: Array.isArray(data.users) ? data.users : [],
        applications: Array.isArray(data.applications) ? data.applications : []
      };
    } catch (e) {
      return { users: [], applications: [] };
    }
  }
  db = loadDB();
  if (!db.users.some(u => u.role === "admin")) {
    db.users.push({
      username: "admin",
      name: "Administrator",
      role: "admin",
      hash: bcrypt.hashSync("admin123", 10)
    });
    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
  }
  db.save = () => fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
}

/* ---------- middleware ---------- */
app.use(express.json({ limit: "50kb" }));

let sessionStore;
if (useMysql) {
  sessionStore = new MySQLStore({
    clearExpired: true,
    checkExpirationInterval: 900000,
    expiration: 28800000
  }, callbackPool);
}

const sessionSecret = process.env.SESSION_SECRET;
if (production && !sessionSecret) {
  throw new Error("Production requires SESSION_SECRET.");
}
app.use(session({
  secret: sessionSecret || "local-development-only-secret",
  resave: false,
  saveUninitialized: false,
  store: sessionStore,
  cookie: {
    httpOnly: true,
    sameSite: "lax",
    secure: production,
    maxAge: 1000 * 60 * 60 * 8
  }
}));
app.use(express.static(path.join(__dirname, "public")));
app.get("/", (req, res) => res.sendFile(path.join(__dirname, "index.html")));

async function getUsers() {
  return useMysql ? db.users() : db.users;
}
async function getApplications() {
  return useMysql ? db.applications() : db.applications;
}

const needLogin = (req, res, next) =>
  req.session.user ? next() : res.status(401).json({ error: "Please log in." });
const needAdmin = (req, res, next) =>
  req.session.user && req.session.user.role === "admin"
    ? next() : res.status(403).json({ error: "Admin access only." });
const needStudent = (req, res, next) =>
  req.session.user && req.session.user.role === "student"
    ? next() : res.status(403).json({ error: "Students only." });

const clean = (v, max = 300) => String(v ?? "").trim().slice(0, max);

/* ---------- auth ---------- */
app.post("/api/register", async (req, res) => {
  const name = clean(req.body.name, 100);
  const username = clean(req.body.username, 30).toLowerCase();
  const password = String(req.body.password || "");
  if (!name || !username) return res.status(400).json({ error: "Enter your full name and a username." });
  if (!/^[a-z0-9._-]{3,}$/.test(username)) return res.status(400).json({ error: "Username: at least 3 letters/numbers, no spaces." });
  if (password.length < 6) return res.status(400).json({ error: "Password must be at least 6 characters." });
  const users = await getUsers();
  if (users.some(u => u.username === username)) return res.status(409).json({ error: "That username is already taken." });

  const user = { username, name, role: "student", hash: bcrypt.hashSync(password, 10) };
  if (useMysql) {
    await pool.execute(
      "INSERT INTO users (username, name, role, hash) VALUES (?, ?, ?, ?)",
      [username, name, "student", user.hash]
    );
  } else {
    db.users.push(user);
    db.save();
  }
  req.session.user = { username, name, role: "student" };
  res.json(req.session.user);
});

app.post("/api/login", async (req, res) => {
  const username = clean(req.body.username, 30).toLowerCase();
  const u = (await getUsers()).find(x => x.username === username);
  if (!u || !bcrypt.compareSync(String(req.body.password || ""), u.hash))
    return res.status(401).json({ error: "Invalid username or password." });
  req.session.user = { username: u.username, name: u.name, role: u.role };
  res.json(req.session.user);
});

app.post("/api/logout", (req, res) => req.session.destroy(() => res.json({ ok: true })));
app.get("/api/me", (req, res) => res.json(req.session.user || null));

app.post("/api/password", needLogin, async (req, res) => {
  const u = (await getUsers()).find(x => x.username === req.session.user.username);
  if (!bcrypt.compareSync(String(req.body.current || ""), u.hash))
    return res.status(400).json({ error: "Current password is incorrect." });
  if (String(req.body.next || "").length < 6)
    return res.status(400).json({ error: "New password is too short." });
  u.hash = bcrypt.hashSync(String(req.body.next), 10);
  if (useMysql) {
    await pool.execute("UPDATE users SET hash = ? WHERE username = ?", [u.hash, u.username]);
  } else {
    db.save();
  }
  res.json({ ok: true });
});

/* ---------- applications ---------- */
app.get("/api/slots", needLogin, async (req, res) => {
  const out = {};
  const applications = await getApplications();
  OFFICES.forEach(o => out[o] = applications.filter(a => a.office === o && a.status === "Approved").length);
  res.json(out);
});

app.get("/api/applications", needLogin, async (req, res) => {
  const applications = await getApplications();
  const list = req.session.user.role === "admin"
    ? applications
    : applications.filter(a => a.user === req.session.user.username);
  res.json([...list].sort((a, b) => b.at - a.at));
});

app.post("/api/applications", needStudent, async (req, res) => {
  const b = req.body;
  const d = {
    name: clean(b.name, 100), email: clean(b.email, 100), phone: clean(b.phone, 30),
    school: clean(b.school, 150), course: clean(b.course, 100), year: clean(b.year, 20),
    office: clean(b.office, 20), office2: clean(b.office2, 20),
    hours: Math.max(1, parseInt(b.hours) || 240), start: clean(b.start, 20), msg: clean(b.msg, 1000)
  };
  if (!d.name || !d.email || !d.phone || !d.school || !d.course)
    return res.status(400).json({ error: "Please fill in name, email, mobile, school and course." });
  if (!/^\S+@\S+\.\S+$/.test(d.email)) return res.status(400).json({ error: "Enter a valid email address." });
  if (!OFFICES.includes(d.office)) return res.status(400).json({ error: "Choose a valid office." });
  if (d.office2 && !OFFICES.includes(d.office2)) d.office2 = "";
  const applications = await getApplications();
  if (applications.some(a => a.user === req.session.user.username && a.office === d.office && a.status !== "Rejected"))
    return res.status(409).json({ error: "You already have an active application for that office." });

  const app_ = { ...d, id: "NB-" + Date.now().toString(36).toUpperCase(),
    user: req.session.user.username, status: "Pending", note: "", at: Date.now() };
  if (useMysql) {
    await pool.execute(
      `INSERT INTO applications
       (id, username, name, email, phone, school, course, year, office, office2, hours, \`start\`, msg, status, note, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [app_.id, app_.user, app_.name, app_.email, app_.phone, app_.school, app_.course, app_.year,
       app_.office, app_.office2, app_.hours, app_.start, app_.msg, app_.status, app_.note, app_.at]
    );
  } else {
    db.applications.push(app_);
    db.save();
  }
  res.json({ id: app_.id });
});

app.patch("/api/applications/:id", needAdmin, async (req, res) => {
  const applications = await getApplications();
  const a = applications.find(x => x.id === req.params.id);
  if (!a) return res.status(404).json({ error: "Application not found." });
  if (!STATUSES.includes(req.body.status)) return res.status(400).json({ error: "Invalid status." });
  a.status = req.body.status;
  a.note = clean(req.body.note, 500);
  if (useMysql) {
    await pool.execute("UPDATE applications SET status = ?, note = ? WHERE id = ?", [a.status, a.note, a.id]);
  } else {
    db.save();
  }
  res.json(a);
});

app.delete("/api/applications/:id", needAdmin, async (req, res) => {
  if (useMysql) {
    await pool.execute("DELETE FROM applications WHERE id = ?", [req.params.id]);
  } else {
    db.applications = db.applications.filter(x => x.id !== req.params.id);
    db.save();
  }
  res.json({ ok: true });
});

const server = app.listen(PORT, () => {
  console.log(`Nabua Internship System running at http://localhost:${PORT}`);
});

server.on("error", (error) => {
  if (error.code === "EADDRINUSE") {
    console.log(`Port ${PORT} is already in use. The app may already be running at http://localhost:${PORT}`);
    process.exit(0);
  }

  console.error("Unable to start the server:", error.message);
  process.exit(1);
});