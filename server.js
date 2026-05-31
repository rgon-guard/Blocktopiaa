const express = require("express");
const { Pool } = require("pg");

const app = express();

app.use(express.json());
app.use(express.static("public"));

// DATABASE
const db = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === "production"
        ? { rejectUnauthorized: false }
        : false
});

// TEST DB
db.query("SELECT NOW()")
    .then(() => console.log("✅ DB CONNECTED"))
    .catch(err => console.log("❌ DB ERROR:", err));

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
        console.log("👑 Admin created");
    }
}
ensureAdmin();

// AUTH ROUTE
app.post("/auth", async (req, res) => {
    try {
        const username = (req.body.username || "").trim();
        const password = (req.body.password || "").trim();

        if (!username || !password) {
            return res.json({ success: false, message: "Missing fields" });
        }

        if (username.length > 25 || username === ".") {
            return res.json({ success: false, message: "Invalid username" });
        }

        const result = await db.query(
            "SELECT * FROM users WHERE username = $1",
            [username]
        );

        const user = result.rows[0];

        // CREATE
        if (!user) {
            await db.query(
                "INSERT INTO users (username,password,role) VALUES ($1,$2,'user')",
                [username, password]
            );

            return res.json({
                success: true,
                username,
                role: "user"
            });
        }

        // LOGIN CHECK
        if (user.password !== password) {
            return res.json({
                success: false,
                message: "Wrong password"
            });
        }

        return res.json({
            success: true,
            username: user.username,
            role: user.role
        });

    } catch (err) {
        console.log("AUTH ERROR:", err);
        res.json({ success: false, message: "Server error" });
    }
});

// USERS LIST (TOP BAR)
app.get("/users", async (req, res) => {
    try {
        const search = req.query.search || "";

        const result = await db.query(
            "SELECT username FROM users WHERE username ILIKE $1 ORDER BY id DESC",
            [`%${search}%`]
        );

        res.json(result.rows);
    } catch (err) {
        res.json([]);
    }
});

// CHANGE PASSWORD
app.post("/change-password", async (req, res) => {
    try {
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

    } catch (err) {
        res.json({ success: false });
    }
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log("🚀 Blocktopia running on port " + PORT);
});