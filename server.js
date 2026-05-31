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

// USERS TABLE
db.query(`
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username TEXT UNIQUE,
    password TEXT,
    role TEXT DEFAULT 'user'
)
`);

// MESSAGES TABLE (NEW)
db.query(`
CREATE TABLE IF NOT EXISTS messages (
    id SERIAL PRIMARY KEY,
    sender TEXT,
    receiver TEXT,
    message TEXT,
    read BOOLEAN DEFAULT FALSE,
    time TIMESTAMP DEFAULT CURRENT_TIMESTAMP
)
`);

// ADMIN
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

// USERS
app.get("/users", async (req, res) => {
    const search = req.query.search || "";

    const result = await db.query(
        "SELECT username, role FROM users WHERE username ILIKE $1 ORDER BY id DESC",
        [`%${search}%`]
    );

    res.json(result.rows);
});

// DELETE USER
app.post("/delete-user", async (req, res) => {
    const { adminUser, target } = req.body;

    const admin = await db.query(
        "SELECT * FROM users WHERE username=$1",
        [adminUser]
    );

    if (admin.rows.length === 0 || admin.rows[0].role !== "admin") {
        return res.json({ success: false });
    }

    if (target === "admin") {
        return res.json({ success: false });
    }

    await db.query(
        "DELETE FROM users WHERE username=$1",
        [target]
    );

    res.json({ success: true });
});

// SEND MESSAGE
app.post("/send-message", async (req, res) => {
    const { sender, receiver, message } = req.body;

    await db.query(
        "INSERT INTO messages (sender,receiver,message) VALUES ($1,$2,$3)",
        [sender, receiver, message]
    );

    res.json({ success: true });
});

// GET CHAT
app.get("/get-messages", async (req, res) => {
    const { user1, user2 } = req.query;

    const result = await db.query(
        `SELECT * FROM messages
         WHERE (sender=$1 AND receiver=$2)
         OR (sender=$2 AND receiver=$1)
         ORDER BY time ASC`,
        [user1, user2]
    );

    res.json(result.rows);
});

// UNREAD CHECK
app.get("/unread", async (req, res) => {
    const { user } = req.query;

    const result = await db.query(
        "SELECT sender FROM messages WHERE receiver=$1 AND read=false",
        [user]
    );

    res.json(result.rows);
});

// MARK READ
app.post("/mark-read", async (req, res) => {
    const { sender, receiver } = req.body;

    await db.query(
        "UPDATE messages SET read=true WHERE sender=$1 AND receiver=$2",
        [sender, receiver]
    );

    res.json({ success: true });
});

// PASSWORD CHANGE
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
        return res.json({ success: false });
    }

    await db.query(
        "UPDATE users SET password=$1 WHERE username=$2",
        [newPassword, username]
    );

    res.json({ success: true });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("🚀 Blocktopia running"));