const express = require("express");
const { Pool } = require("pg");

const app = express();

app.use(express.json());
app.use(express.static("public"));

const db = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === "production"
        ? { rejectUnauthorized: false }
        : false
});

// DB TEST
db.query("SELECT NOW()")
    .then(() => console.log("✅ DB CONNECTED"))
    .catch(err => console.log("❌ DB ERROR:", err));

// TABLE
db.query(`
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username TEXT UNIQUE,
    password TEXT,
    role TEXT DEFAULT 'user'
)
`);

// ENSURE ADMIN
async function ensureAdmin() {
    const res = await db.query(
        "SELECT * FROM users WHERE username=$1",
        ["admin"]
    );

    if (res.rows.length === 0) {
        await db.query(
            "INSERT INTO users (username,password,role) VALUES ('admin','admin123','admin')"
        );
    }
}
ensureAdmin();

// AUTH
app.post("/auth", async (req, res) => {
    const { username, password } = req.body;

    const user = await db.query(
        "SELECT * FROM users WHERE username=$1",
        [username]
    );

    if (user.rows.length === 0) {
        await db.query(
            "INSERT INTO users (username,password,role) VALUES ($1,$2,'user')",
            [username, password]
        );

        return res.json({ success: true, username, role: "user" });
    }

    if (user.rows[0].password !== password) {
        return res.json({ success: false, message: "Wrong password" });
    }

    res.json({
        success: true,
        username,
        role: user.rows[0].role
    });
});

// GET USERS (search)
app.get("/users", async (req, res) => {
    const search = req.query.search || "";

    const result = await db.query(
        "SELECT username, role FROM users WHERE username ILIKE $1 ORDER BY id DESC",
        [`%${search}%`]
    );

    res.json(result.rows);
});

// DELETE USER (ADMIN ONLY)
app.post("/delete-user", async (req, res) => {
    const { adminUser, target } = req.body;

    // verify admin
    const admin = await db.query(
        "SELECT * FROM users WHERE username=$1",
        [adminUser]
    );

    if (admin.rows.length === 0 || admin.rows[0].role !== "admin") {
        return res.json({ success: false });
    }

    if (target === "admin") {
        return res.json({ success: false, message: "Cannot delete admin" });
    }

    await db.query(
        "DELETE FROM users WHERE username=$1",
        [target]
    );

    res.json({ success: true });
});

// CHANGE PASSWORD
app.post("/change-password", async (req, res) => {
    const { username, oldPassword, newPassword } = req.body;

    const user = await db.query(
        "SELECT * FROM users WHERE username=$1",
        [username]
    );

    if (user.rows.length === 0) {
        return res.json({ success: false });
    }

    if (user.rows[0].password !== oldPassword) {
        return res.json({ success: false, message: "Wrong password" });
    }

    await db.query(
        "UPDATE users SET password=$1 WHERE username=$2",
        [newPassword, username]
    );

    res.json({ success: true });
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log("🚀 Blocktopia running");
});