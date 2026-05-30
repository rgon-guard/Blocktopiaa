const express = require("express");
const sqlite3 = require("sqlite3").verbose();

const app = express();
app.use(express.json());
app.use(express.static("public"));

const db = new sqlite3.Database("database.db");

// Create table
db.run(`
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE,
    password TEXT,
    role TEXT DEFAULT 'user'
)
`);

// CREATE / LOGIN ACCOUNT
app.post("/auth", (req, res) => {
    let username = (req.body.username || "").trim();
    let password = (req.body.password || "").trim();

    if (!username || !password) {
        return res.json({ success: false, message: "Missing fields" });
    }

    if (username.length > 25) {
        return res.json({ success: false, message: "Username too long" });
    }

    // block invalid usernames like "."
    if (username === ".") {
        return res.json({ success: false, message: "Invalid username" });
    }

    // check if user exists
    db.get(
        "SELECT * FROM users WHERE username = ?",
        [username],
        (err, user) => {
            if (err) {
                return res.json({ success: false, message: "Error" });
            }

            // USER DOES NOT EXIST → CREATE
            if (!user) {
                db.run(
                    "INSERT INTO users (username, password, role) VALUES (?, ?, 'user')",
                    [username, password],
                    function (err) {
                        if (err) {
                            return res.json({
                                success: false,
                                message: "Username taken"
                            });
                        }

                        return res.json({
                            success: true,
                            username,
                            role: "user"
                        });
                    }
                );
                return;
            }

            // USER EXISTS → CHECK PASSWORD
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
        }
    );
});

// ensure owner exists (REAL admin account)
db.get(
    "SELECT * FROM users WHERE username = ?",
    ["Owner"],
    (err, row) => {
        if (!row) {
            db.run(
                "INSERT INTO users (username, password, role) VALUES ('Owner', 'admin123', 'admin')"
            );
        }
    }
);

app.listen(3000, () => {
    console.log("Server running on port 3000");
});
