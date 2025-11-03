import solitaireMode, { createGame as createSolitaireGame } from "./gameModes/solitaire.js";
import euchreMode from "./gameModes/euchre.js";

const MODE_DEFINITIONS = {
  solitaire: solitaireMode,
  euchre: euchreMode,
};

const DEFAULT_MODE = "solitaire";

function generateCode() {
  return Math.floor(1000 + Math.random() * 9000).toString();
}

function getModeDefinition(mode) {
  return MODE_DEFINITIONS[mode] ?? MODE_DEFINITIONS[DEFAULT_MODE];
}

export class Room {
  constructor(code) {
    this.code = code;
    this.players = [];
    this.mode = DEFAULT_MODE;
    this.game = createSolitaireGame();
  }

  get modeDefinition() {
    return getModeDefinition(this.mode);
  }

  addPlayer(ws) {
    this.players.push(ws);
    this.reindexSeats();
    ws.room = this.code;
    const modeChanged = this.ensureMode();
    return modeChanged;
  }

  removePlayer(ws) {
    this.players = this.players.filter((player) => player !== ws);
    this.reindexSeats();
    const modeChanged = this.ensureMode();
    return modeChanged;
  }

  reindexSeats() {
    this.players.forEach((player, index) => {
      player.seat = index;
    });
  }

  ensureMode() {
    const desiredMode = this.players.length >= 4 ? "euchre" : "solitaire";
    return this.setMode(desiredMode, { silent: true });
  }

  setMode(mode, { silent = false, forcedDealer = null } = {}) {
    if (this.mode === mode) return false;
    const options = {};
    if (forcedDealer !== null && forcedDealer !== undefined) {
      options.forcedDealer = forcedDealer;
    }
    this.mode = mode;
    this.game = this.modeDefinition.createGame(options);
    console.log(`Table #${this.code} now in ${this.mode} mode`);
    if (!silent) this.broadcast();
    return true;
  }

  redeal(requestor = null) {
    const previousGame = this.game;
    const options = { previousGame };
    if (requestor && this.mode === "euchre") {
      const seat = this.players.indexOf(requestor);
      if (seat !== -1) options.forcedDealer = seat;
    }
    this.game = this.modeDefinition.createGame(options);
    const dealerLabel = this.mode === "euchre" ? ` (dealer seat ${this.game.dealer})` : "";
    console.log(`Table #${this.code} redealt (${this.mode})${dealerLabel}`);
    this.broadcast();
  }

  handleMessage(ws, data) {
    if (!data || typeof data.type !== "string") return;
    if (data.type === "redeal") {
      this.redeal(ws);
      return;
    }

    const handler = this.modeDefinition.handlers?.[data.type];
    if (typeof handler === "function") {
      handler(this, ws, data);
    }
  }

  broadcast() {
    const definition = this.modeDefinition;
    this.players.forEach((player, seat) => {
      if (player.readyState === player.OPEN) {
        const state = definition.serialize(this, seat);
        player.send(JSON.stringify({ type: "state", state }));
      }
    });
  }

  send(ws, payload) {
    if (ws.readyState === ws.OPEN) {
      ws.send(JSON.stringify(payload));
    }
  }
}

export class RoomManager {
  constructor() {
    this.rooms = new Map();
  }

  createRoom(hostSocket) {
    let code = generateCode();
    while (this.rooms.has(code)) {
      code = generateCode();
    }
    const room = new Room(code);
    this.rooms.set(code, room);
    room.addPlayer(hostSocket);
    return room;
  }

  joinRoom(code, socket) {
    const room = this.rooms.get(code);
    if (!room) return null;
    const previousMode = room.mode;
    const modeChangedDuringAdd = room.addPlayer(socket);
    const modeChanged = modeChangedDuringAdd || room.mode !== previousMode;
    return { room, modeChanged };
  }

  getRoom(code) {
    return this.rooms.get(code);
  }

  removePlayer(socket) {
    const { room: code } = socket;
    if (!code) return;
    const room = this.rooms.get(code);
    if (!room) return;
    const modeChanged = room.removePlayer(socket);
    if (room.players.length === 0) {
      this.rooms.delete(code);
    } else {
      if (modeChanged) {
        console.log(`ℹ️ Table #${code} adjusted mode to ${room.mode} (player left)`);
      }
      room.broadcast();
    }
  }
}
