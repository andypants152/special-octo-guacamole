import { WebSocketServer } from "ws";
import { RoomManager } from "./rooms.js";

const roomManager = new RoomManager();

function handleCreate(ws) {
  const room = roomManager.createRoom(ws);
  const seat = ws.seat ?? room.players.indexOf(ws);
  room.send(ws, { type: "created", code: room.code, mode: room.mode, seat });
  console.log(`🃏 Created new table #${room.code}`);
  room.broadcast();
}

function handleJoin(ws, data) {
  const { code } = data;
  const result = roomManager.joinRoom(code, ws);
  if (!result) {
    ws.send(JSON.stringify({ type: "error", message: "Room not found" }));
    return;
  }
  const { room, modeChanged } = result;
  const seat = ws.seat ?? room.players.indexOf(ws);
  room.send(ws, { type: "joined", code: room.code, mode: room.mode, seat });
  console.log(`👥 Player joined table #${room.code}`);
  if (modeChanged) {
    console.log(`🎯 Table #${room.code} now in ${room.mode} mode`);
  }
  room.broadcast();
}

function handleMessage(ws, data) {
  const room = roomManager.getRoom(ws.room);
  if (!room) return;
  room.handleMessage(ws, data);
}

export function startSolitaireServer(server) {
  const wss = new WebSocketServer({ server });

  wss.on("connection", (ws) => {
    ws.on("message", (raw) => {
      let data;
      try {
        data = JSON.parse(raw);
      } catch {
        return;
      }

      switch (data.type) {
        case "create":
          handleCreate(ws);
          break;
        case "join":
          handleJoin(ws, data);
          break;
        default:
          handleMessage(ws, data);
      }
    });

    ws.on("close", () => {
      roomManager.removePlayer(ws);
    });
  });

  console.log("Card game WebSocket server active.");
}
