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
    role TEXT DEFAULT 'user',
    points BIGINT DEFAULT 0,
    lastclaim BIGINT DEFAULT 0
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
   SWEAR FILTER (SAFE BASE)
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
    let result = msg;

    let normMsg = normalize(msg);

    for (let bad of SWEAR_WORDS) {

        let normBad = normalize(bad);

        if (normMsg.includes(normBad)) {

            let regex = new RegExp(
                bad.split("").join("[^a-zA-Z0-9]*"),
                "gi"
            );

            result = result.replace(
                regex,
                "*".repeat(bad.length)
            );
        }
    }

    return result;
}

/* =========================
   AUTH
========================= */

app.post("/auth", async (req,res)=>{
    const { username, password } = req.body;

    const u = await db.query(
        "SELECT * FROM users WHERE username=$1",
        [username]
    );

    if (u.rows.length === 0) {
        await db.query(
            "INSERT INTO users (username,password,role) VALUES ($1,$2,'user')",
            [username,password]
        );

        return res.json({ success:true, username, role:"user", points:0 });
    }

    if (u.rows[0].password !== password)
        return res.json({ success:false });

    res.json({
        success:true,
        username,
        role:u.rows[0].role,
        points:u.rows[0].points
    });
});

/* USERS */
app.get("/users", async (req,res)=>{
    const r = await db.query(
        "SELECT username,role FROM users ORDER BY id DESC"
    );

    res.json(r.rows);
});

/* PROFILE */
app.get("/profile", async (req,res)=>{
    const { username } = req.query;

    const r = await db.query(
        "SELECT username,points,role FROM users WHERE username=$1",
        [username]
    );

    res.json(r.rows[0]);
});

/* POINTS (DAILY SYSTEM) */
function getReward(days) {
    if (days >= 21) return 4;
    if (days >= 14) return 3;
    if (days >= 7) return 2;
    return 1;
}

app.post("/claim-points", async (req,res)=>{
    const { username } = req.body;

    const u = await db.query(
        "SELECT * FROM users WHERE username=$1",
        [username]
    );

    if (!u.rows.length)
        return res.json({ success:false });

    let user = u.rows[0];

    let now = Date.now();
    let last = user.lastclaim || 0;

    let diff = Math.floor((now - last) / (1000*60*60*24));

    if (diff < 1)
        return res.json({ success:false });

    let reward = getReward(diff);

    let newPoints = Math.min(
        2147483647,
        (user.points || 0) + reward
    );

    await db.query(
        "UPDATE users SET points=$1,lastclaim=$2 WHERE username=$3",
        [newPoints, now, username]
    );

    res.json({ success:true, points:newPoints });
});

/* CHAT */
app.post("/send-message", async (req,res)=>{
    let { sender, receiver, message } = req.body;

    message = filterMessage(message);

    const blocked = await db.query(
        "SELECT * FROM blocks WHERE blocker=$1 AND blocked=$2",
        [receiver,sender]
    );

    if (blocked.rows.length)
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
    console.log("Blocktopia running");
});