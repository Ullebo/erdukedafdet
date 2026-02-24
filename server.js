// server.js
// Kør lokalt: node server.js
// På Render: den starter via "npm start"

const path = require("path");
const express = require("express");
const WebSocket = require("ws");

const app = express();

// Server din frontend fra /public
app.use(express.static(path.join(__dirname, "public")));

const PORT = process.env.PORT || 8080;

// Start HTTP-server (så browser kan hente index.html)
const server = app.listen(PORT, () => {
  console.log(`HTTP server kører på http://localhost:${PORT}`);
});

// WebSocket-server ovenpå samme HTTP-server
const wss = new WebSocket.Server({ server });

// FIFO kø: [{ id, ws, joinedAt, isAlive }]
const queue = [];
let nextId = 1;

function safeSend(ws, obj) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(obj));
  }
}

function pruneDeadSockets() {
  for (let i = queue.length - 1; i >= 0; i--) {
    const ws = queue[i].ws;
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      queue.splice(i, 1);
    }
  }
}

function broadcastQueue() {
  pruneDeadSockets();

  queue.forEach((entry, index) => {
    safeSend(entry.ws, {
      type: "queue_update",
      id: entry.id,
      position: index + 1,
      size: queue.length,
      active: index === 0, // kun nr 1 er aktiv
    });
  });

  console.log(
    "[queue] size:",
    queue.length,
    "order:",
    queue.map((q, i) => `${i + 1}:${q.id}`).join(" ")
  );
}

function removeFromQueueByWs(ws, reason = "unknown") {
  const idx = queue.findIndex((q) => q.ws === ws);
  if (idx !== -1) {
    const removed = queue[idx];
    queue.splice(idx, 1);
    console.log(`[remove] id=${removed.id} reason=${reason}`);
    broadcastQueue();
  }
}

function removeFromQueueById(id, reason = "unknown") {
  const idx = queue.findIndex((q) => q.id === id);
  if (idx !== -1) {
    const ws = queue[idx].ws;
    queue.splice(idx, 1);
    console.log(`[remove] id=${id} reason=${reason}`);
    try {
      ws.close();
    } catch (e) {}
    broadcastQueue();
  }
}

function moveToBack(ws) {
  pruneDeadSockets();

  const idx = queue.findIndex((q) => q.ws === ws);
  if (idx === -1) {
    console.log("[requeue] ws not found in queue");
    return;
  }

  const [entry] = queue.splice(idx, 1);
  queue.push(entry);

  console.log(`[requeue] id=${entry.id} moved from pos=${idx + 1} to back`);
  broadcastQueue();
}

// Heartbeat: ping/pong så klienter der “forsvinder” fjernes
const interval = setInterval(() => {
  pruneDeadSockets();

  queue.forEach((entry) => {
    if (entry.isAlive === false) {
      removeFromQueueById(entry.id, "heartbeat-timeout");
      return;
    }

    entry.isAlive = false;
    try {
      entry.ws.ping();
    } catch (e) {
      removeFromQueueById(entry.id, "heartbeat-ping-failed");
    }
  });
}, 15000);

wss.on("connection", (ws) => {
  const id = nextId++;

  const entry = {
    id,
    ws,
    joinedAt: Date.now(),
    isAlive: true,
  };

  queue.push(entry);

  console.log(`[connect] id=${id} joined. size=${queue.length}`);

  safeSend(ws, { type: "welcome", id });
  broadcastQueue();

  ws.on("pong", () => {
    entry.isAlive = true;
  });

  ws.on("message", (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch (e) {
      console.log("[message] invalid json");
      return;
    }

    console.log(`[message] id=${id} type=${msg.type}`);

    if (msg.type === "leave") {
      removeFromQueueByWs(ws, "leave");
      return;
    }

    if (msg.type === "done") {
      removeFromQueueByWs(ws, "done");
      return;
    }

    if (msg.type === "requeue") {
      moveToBack(ws);
      return;
    }
  });

  ws.on("close", () => {
    removeFromQueueByWs(ws, "close");
  });

  ws.on("error", () => {
    removeFromQueueByWs(ws, "error");
  });
});

wss.on("close", () => clearInterval(interval));

console.log(`WebSocket kører på ws://localhost:${PORT}`);