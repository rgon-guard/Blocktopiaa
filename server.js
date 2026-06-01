const express = require("express");
const { Pool } = require("pg");

const app = express();

app.use(express.json());
app.use(express.static("public"));

/* DATABASE */
const db = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === "production"
        ? { rejectUnauthorized: false }
        : false
});

/* TABLES */
db.query(`
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username TEXT UNIQUE,
    password TEXT,
    role TEXT DEFAULT 'user'
);

CREATE TABLE IF NOT EXISTS messages (
    id SERIAL PRIMARY KEY,
    sender TEXT,
    receiver TEXT,
    message TEXT,
    time TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS blocks (
    id SERIAL PRIMARY KEY,
    blocker TEXT,
    blocked TEXT
);
`);

/* ADMIN */
async function ensureAdmin() {
    const r = await db.query(
        "SELECT * FROM users WHERE username=$1",
        ["admin"]
    );

    if (r.rows.length === 0) {
        await db.query(
            "INSERT INTO users (username,password,role) VALUES ('admin','admin123','admin')"
        );
    }
}
ensureAdmin();

/* =========================
   SWEAR FILTER (FIXED)
========================= */

const SWEAR_WORDS = [
    "fuck",
    "shit",
    "bitch",
    "ass",
    "damn",
    "cunt",
    "bastard",
    "crap"
];

function leetFix(t) {
    return t.toLowerCase()
        .replace(/0/g, "o")
        .replace(/1/g, "i")
        .replace(/3/g, "e")
        .replace(/4/g, "a")
        .replace(/5/g, "s")
        .replace(/7/g, "t")
        .replace(/@/g, "a")
        .replace(/\$/g, "s")
        .replace(/!/g, "i");
}

function normalize(t) {
    return leetFix(t)
        .replace(/[^a-z]/g, "")
        .replace(/(.)\1+/g, "$1");
}

function filterMessage(msg) {

    let cleanedMsg = msg;

    let normalized = normalize(msg);

    for (let bad of SWEAR_WORDS) {

        let badNorm = normalize(bad);

        if (normalized.includes(badNorm)) {

            let regex = new RegExp(
                bad.split("").join("[^a-zA-Z0-9]*"),
                "gi"
            );

            cleanedMsg = cleanedMsg.replace(
                regex,
                "*".repeat(bad.length)
            );
        }
    }

    return cleanedMsg;
}

/* =========================
   AUTH
========================= */

app.post("/auth", async (req,res)=>{
    const { username, password } = req.body;

    if (!username || !password)
        return res.json({ success:false });

    const u = await db.query(
        "SELECT * FROM users WHERE username=$1",
        [username]
    );

    if (u.rows.length === 0) {
        await db.query(
            "INSERT INTO users (username,password,role) VALUES ($1,$2,'user')",
            [username,password]
        );

        return res.json({ success:true, username, role:"user" });
    }

    if (u.rows[0].password !== password)
        return res.json({ success:false });

    res.json({
        success:true,
        username,
        role:u.rows[0].role
    });
});

/* USERS */
app.get("/users", async (req,res)=>{
    const r = await db.query(
        "SELECT username,role FROM users ORDER BY id DESC"
    );

    res.json(r.rows);
});

/* BLOCK */
app.post("/block-user", async (req,res)=>{
    const { user, target } = req.body;

    await db.query(
        "INSERT INTO blocks (blocker,blocked) VALUES ($1,$2)",
        [user,target]
    );

    res.json({ success:true });
});

app.post("/unblock-user", async (req,res)=>{
    const { user, target } = req.body;

    await db.query(
        "DELETE FROM blocks WHERE blocker=$1 AND blocked=$2",
        [user,target]
    );

    res.json({ success:true });
});

/* CHAT */
app.post("/send-message", async (req,res)=>{
    let { sender, receiver, message } = req.body;

    message = filterMessage(message);

    const blocked = await db.query(
        "SELECT * FROM blocks WHERE blocker=$1 AND blocked=$2",
        [receiver,sender]
    );

    if (blocked.rows.length > 0)
        return res.json({ success:false });

    await db.query(
        "INSERT INTO messages (sender,receiver,message) VALUES ($1,$2,$3)",
        [sender,receiver,message]
    );

    res.json({ success:true });
});

app.get("/get-messages", async (req,res)=>{
    const { user1,user2 } = req.query;

    const r = await db.query(
        `SELECT * FROM messages
         WHERE (sender=$1 AND receiver=$2)
         OR (sender=$2 AND receiver=$1)
         ORDER BY time ASC`,
        [user1,user2]
    );

    res.json(r.rows);
});

app.listen(process.env.PORT || 3000, ()=>{
    console.log("Running");
});