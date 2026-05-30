const express = require("express");
const Database = require("better-sqlite3");

const app = express();

app.use(express.json());
app.use(express.static("public"));

const db = new Database("database.db");

// Create table
db.exec(`
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE,
    password TEXT,
    role TEXT DEFAULT 'user'
)
`);

// AUTH (register OR login)
app.post("/auth", (req, res) => {
    const username = (req.body.username || "").trim();
    const password = (req.body.password || "").trim();

    if (!username || !password) {
        return res.json({ success: false, message: "Missing fields" });
    }

    if (username.length > 25 || username === ".") {
        return res.json({ success: false, message: "Invalid username" });
    }

    const user = db.prepare(
        "SELECT * FROM users WHERE username = ?"
    ).get(username);

    // CREATE ACCOUNT
    if (!user) {
        try {
            db.prepare(
                "INSERT INTO users (username, password, role) VALUES (?, ?, 'user')"
            ).run(username, password);

            return res.json({
                success: true,
                username,
                role: "user"
            });
        } catch {
            return res.json({
                success: false,
                message: "Username taken"
            });
        }
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
});

// CREATE ADMIN ACCOUNT (username = admin)
const admin = db.prepare(
    "SELECT * FROM users WHERE username = ?"
).get("admin");

if (!admin) {
    db.prepare(
        "INSERT INTO users (username, password, role) VALUES ('admin', 'admin123', 'admin')"
    ).run();
}

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log("Blocktopia running on port " + PORT);
});