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

// DEBUG CONNECTION
db.query("SELECT NOW()")
    .then(() => console.log("✅ DB CONNECTED"))
    .catch(err => console.log("❌ DB ERROR", err));

// CREATE TABLE
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
        "SELECT * FROM users WHERE username = $1",
        ["admin"]
    );

    if (res.rows.length === 0) {
        await db.query(
            "INSERT INTO users (username, password, role) VALUES ('admin','admin123','admin')"
        );
    }
}
ensureAdmin();

// AUTH (register/login)
app.post("/auth", async (req, res) => {
    const username = (req.body.username || "").trim();
    const password = (req.body.password || "").trim();

    if (!username || !password) {
        return res.json({ success: false });
    }

    try {
        const user = await db.query(
            "SELECT * FROM users WHERE username = $1",
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

        return res.json({
            success: true,
            username,
            role: user.rows[0].role
        });

    } catch (err) {
        console.log(err);
        return res.json({ success: false });
    }
});

// GET USERS (for top bar list)
app.get("/users", async (req, res) => {
    const search = req.query.search || "";

    const result = await db.query(
        "SELECT username FROM users WHERE username ILIKE $1 ORDER BY id DESC",
        [`%${search}%`]
    );

    res.json(result.rows);
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