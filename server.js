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

// USERS
db.query(`
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username TEXT UNIQUE,
    password TEXT,
    role TEXT DEFAULT 'user'
)
`);

// MESSAGES
db.query(`
CREATE TABLE IF NOT EXISTS messages (
    id SERIAL PRIMARY KEY,
    sender TEXT,
    receiver TEXT,
    message TEXT,
    time TIMESTAMP DEFAULT CURRENT_TIMESTAMP
)
`);

// BLOCKS
db.query(`
CREATE TABLE IF NOT EXISTS blocks (
    id SERIAL PRIMARY KEY,
    blocker TEXT,
    blocked TEXT
)
`);

// ONLINE USERS
let onlineUsers = new Map();

/* ADMIN */
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

/* AUTH */
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
    } else if (user.rows[0].password !== password) {
        return res.json({ success:false });
    }

    onlineUsers.set(username, Date.now());

    res.json({
        success:true,
        username,
        role: user.rows[0]?.role || "user"
    });
});

/* ONLINE HEARTBEAT */
app.post("/heartbeat", (req,res)=>{
    const { user } = req.body;
    onlineUsers.set(user, Date.now());
    res.json({ ok:true });
});

/* CLEAN OLD ONLINE USERS */
setInterval(()=>{
    const now = Date.now();
    for (const [user,time] of onlineUsers.entries()) {
        if (now - time > 15000) onlineUsers.delete(user);
    }
},5000);

/* ONLINE LIST */
app.get("/online-users",(req,res)=>{
    res.json([...onlineUsers.keys()]);
});

/* USERS */
app.get("/users", async (req,res)=>{
    const search = req.query.search || "";

    const result = await db.query(
        "SELECT username, role FROM users WHERE username ILIKE $1",
        [`%${search}%`]
    );

    res.json(result.rows);
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

app.get("/blocked", async (req,res)=>{
    const { user } = req.query;

    const r = await db.query(
        "SELECT blocked FROM blocks WHERE blocker=$1",
        [user]
    );

    res.json(r.rows.map(x=>x.blocked));
});

/* MESSAGES */
app.post("/send-message", async (req,res)=>{
    const { sender, receiver, message } = req.body;

    const blocked = await db.query(
        "SELECT * FROM blocks WHERE blocker=$1 AND blocked=$2",
        [receiver, sender]
    );

    if (blocked.rows.length > 0) {
        return res.json({ success:false });
    }

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

const PORT = process.env.PORT || 3000;
app.listen(PORT, ()=>console.log("Blocktopia running"));