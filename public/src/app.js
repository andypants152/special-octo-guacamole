import { Button } from "./ui/button.js";
import { SolitaireMode } from "./modes/solitaireMode.js";
import { EuchreMode } from "./modes/euchreMode.js";

const BASE_WIDTH = 1100;
const BASE_HEIGHT = 700;

const VIEW_MENU = "menu";
const VIEW_JOIN = "joinInput";
const VIEW_CONNECTING = "connecting";
const VIEW_PLAYING = "playing";

function websocketUrl() {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.host}`;
}

function clampRoomCode(value) {
  return value.slice(0, 4);
}

export class App {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.baseWidth = BASE_WIDTH;
    this.baseHeight = BASE_HEIGHT;
    this.width = BASE_WIDTH;
    this.height = BASE_HEIGHT;
    this.scale = 1;
    this.offsetX = 0;
    this.offsetY = 0;

    this.view = VIEW_MENU;
    this.mode = "solitaire";
    this.roomCode = "";
    this.latestState = null;
    this.seat = null;
    this.ws = null;

    this.menuButtons = [];
    this.joinButtons = [];
    this.modeButtons = [];

    this.modes = {
      solitaire: new SolitaireMode(this),
      euchre: new EuchreMode(this),
    };
    this.activeMode = null;

    this.render = this.render.bind(this);
    this.onCanvasClick = this.onCanvasClick.bind(this);
    this.onPointerDown = this.onPointerDown.bind(this);
    this.onPointerMove = this.onPointerMove.bind(this);
    this.onPointerUp = this.onPointerUp.bind(this);
    this.onPointerLeave = this.onPointerLeave.bind(this);
    this.onDoubleClick = this.onDoubleClick.bind(this);
    this.onKeyDown = this.onKeyDown.bind(this);
    this.resizeCanvas = this.resizeCanvas.bind(this);
  }

  start() {
    this.setupMenuButtons();
    this.resizeCanvas();
    this.render();
    this.connectWebSocket();
    this.attachEvents();
    window.addEventListener("resize", this.resizeCanvas);
    if (window.DEBUG_LAYOUT === undefined) {
      window.DEBUG_LAYOUT = false;
    }
  }

  attachEvents() {
    const pointerOptions = { passive: false };
    if (window.PointerEvent) {
      this.canvas.addEventListener("pointerdown", this.onPointerDown, pointerOptions);
      this.canvas.addEventListener("pointermove", this.onPointerMove, pointerOptions);
      this.canvas.addEventListener("pointerup", this.onPointerUp, pointerOptions);
      this.canvas.addEventListener("pointercancel", this.onPointerLeave, pointerOptions);
      this.canvas.addEventListener("pointerleave", this.onPointerLeave, pointerOptions);
      this.canvas.addEventListener("mouseleave", this.onPointerLeave);
      this.canvas.addEventListener("dblclick", this.onDoubleClick);
    } else {
      // Fallback for very old browsers without PointerEvent support.
      this.canvas.addEventListener("mousedown", this.onPointerDown);
      this.canvas.addEventListener("mousemove", this.onPointerMove);
      this.canvas.addEventListener("mouseup", this.onPointerUp);
      this.canvas.addEventListener("mouseleave", this.onPointerLeave);
      this.canvas.addEventListener("dblclick", this.onDoubleClick);
      this.canvas.addEventListener("click", this.onCanvasClick);
    }
    window.addEventListener("keydown", this.onKeyDown);
  }

  resizeCanvas() {
    // Fit the fixed game coordinate system into the current viewport while keeping aspect ratio.
    const viewportWidth = Math.max(window.innerWidth || 0, document.documentElement?.clientWidth || 0);
    const viewportHeight = Math.max(window.innerHeight || 0, document.documentElement?.clientHeight || 0);
    const rect = this.canvas.getBoundingClientRect();
    const availableWidth = rect.width || viewportWidth || this.baseWidth;
    const availableHeight = rect.height || viewportHeight || this.baseHeight;
    const fitScale = Math.min(availableWidth / this.baseWidth, availableHeight / this.baseHeight) || 1;
    const scale = Math.max(fitScale, 0.25);
    this.scale = scale;

    const displayWidth = this.baseWidth * scale;
    const displayHeight = this.baseHeight * scale;
    this.offsetX = (availableWidth - displayWidth) / 2;
    this.offsetY = (availableHeight - displayHeight) / 2;

    this.canvas.width = availableWidth;
    this.canvas.height = availableHeight;
    this.ctx.imageSmoothingEnabled = false;

    const style = this.canvas.style;
    style.width = `${availableWidth}px`;
    style.height = `${availableHeight}px`;
    style.position = "relative";
    style.left = "0px";
    style.top = "0px";

    console.debug("[layout] resize applied");
    if (window.DEBUG_LAYOUT) {
      // Quick insight into responsive sizing on desktop and mobile.
      console.info("[layout] resize", {
        availableWidth: Math.round(availableWidth),
        availableHeight: Math.round(availableHeight),
        displayWidth: Math.round(displayWidth),
        displayHeight: Math.round(displayHeight),
        scale: Number(this.scale.toFixed(3)),
        offsetX: Math.round(this.offsetX),
        offsetY: Math.round(this.offsetY),
      });
    }
  }

  connectWebSocket() {
    this.ws = new WebSocket(websocketUrl());
    this.ws.onmessage = (event) => {
      let message;
      try {
        message = JSON.parse(event.data);
      } catch {
        return;
      }
      this.handleServerMessage(message);
    };
  }

  handleServerMessage(message) {
    switch (message.type) {
      case "created":
      case "joined": {
        this.roomCode = message.code;
        this.mode = message.mode || "solitaire";
        this.seat = message.seat ?? null;
        this.switchView(VIEW_PLAYING);
        this.activateMode(this.mode);
        break;
      }
      case "error": {
        this.switchView(VIEW_MENU);
        window.alert(message.message ?? "Room not found");
        break;
      }
      case "state": {
        this.latestState = message.state;
        if (this.latestState?.code) {
          this.roomCode = this.latestState.code;
        }
        if (typeof this.latestState?.seat === "number") {
          this.seat = this.latestState.seat;
        }
        const incomingMode = this.latestState?.mode || "solitaire";
        if (incomingMode !== this.mode) {
          this.mode = incomingMode;
          this.activateMode(this.mode);
        }
        if (this.activeMode) {
          this.activeMode.processState(this.latestState);
        }
        break;
      }
      case "invalidMove": {
        // Passive notification; keep behaviour silent for now.
        break;
      }
      default:
        break;
    }
  }

  activateMode(modeName) {
    if (this.activeMode) {
      this.activeMode.exit();
    }
    this.mode = modeName;
    this.activeMode = this.modes[modeName];
    if (this.activeMode) {
      this.activeMode.enter();
      if (this.latestState) {
        this.activeMode.processState(this.latestState);
      }
    }
  }

  send(payload) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(payload));
    }
  }

  setupMenuButtons() {
    const createButton = new Button(
      "Create Table",
      this.width / 2 - 120,
      this.height / 2 - 60,
      240,
      50,
      () => {
        this.send({ type: "create" });
        this.switchView(VIEW_CONNECTING);
      },
    );
    const joinButton = new Button(
      "Join Table",
      this.width / 2 - 120,
      this.height / 2 + 10,
      240,
      50,
      () => {
        this.roomCode = "";
        this.switchView(VIEW_JOIN);
        this.setupJoinButtons();
      },
    );
    this.menuButtons = [createButton, joinButton];
  }

  setupJoinButtons() {
    this.joinButtons = [];
    const buttonWidth = 100;
    const buttonHeight = 60;
    const gap = 15;
    const startX = this.width / 2 - ((buttonWidth * 3) + (gap * 2)) / 2;
    const startY = this.height / 2 + 10;

    const layout = [
      ["1", "2", "3"],
      ["4", "5", "6"],
      ["7", "8", "9"],
      ["Cancel", "0", "Delete"],
    ];

    layout.forEach((row, rowIndex) => {
      row.forEach((label, colIndex) => {
        const x = startX + colIndex * (buttonWidth + gap);
        const y = startY + rowIndex * (buttonHeight + gap);
        if (/^\d$/.test(label)) {
          this.joinButtons.push(new Button(label, x, y, buttonWidth, buttonHeight, () => {
            if (this.roomCode.length < 4) {
              this.roomCode = clampRoomCode((this.roomCode + label).toUpperCase());
            }
          }));
        } else if (label === "Delete") {
          this.joinButtons.push(new Button(label, x, y, buttonWidth, buttonHeight, () => {
            this.roomCode = this.roomCode.slice(0, -1);
          }));
        } else if (label === "Cancel") {
          this.joinButtons.push(new Button(label, x, y, buttonWidth, buttonHeight, () => {
            this.roomCode = "";
            this.switchView(VIEW_MENU);
          }));
        }
      });
    });

    const joinWidth = (buttonWidth * 3) + (gap * 2);
    const joinY = startY + layout.length * (buttonHeight + gap);
    this.joinButtons.push(new Button("Join", startX, joinY, joinWidth, buttonHeight, () => {
      if (this.roomCode.length === 4) {
        this.send({ type: "join", code: this.roomCode });
        this.switchView(VIEW_CONNECTING);
      }
    }));
  }

  switchView(view) {
    this.view = view;
    if (view !== VIEW_PLAYING && this.activeMode) {
      this.activeMode.exit();
      this.activeMode = null;
    }
  }

  onCanvasClick(event) {
    const point = this.getPointer(event);
    this.handleUiButtons(point);
  }

  handleUiButtons(point) {
    if (this.view === VIEW_MENU) {
      this.menuButtons.forEach((button) => {
        if (button.contains(point)) {
          button.onClick();
        }
      });
    } else if (this.view === VIEW_JOIN) {
      this.joinButtons.forEach((button) => {
        if (button.contains(point)) {
          button.onClick();
        }
      });
    }
  }

  onPointerDown(event) {
    if (event.pointerType === "touch" && event.cancelable) {
      event.preventDefault();
    }
    if (this.view !== VIEW_PLAYING || !this.activeMode) return;
    this.activeMode.onPointerDown(this.getPointer(event));
  }

  onPointerMove(event) {
    if (event.pointerType === "touch" && event.cancelable) {
      event.preventDefault();
    }
    if (this.view !== VIEW_PLAYING || !this.activeMode) return;
    this.activeMode.onPointerMove(this.getPointer(event));
  }

  onPointerUp(event) {
    if (event.pointerType === "touch" && event.cancelable) {
      event.preventDefault();
    }
    if (this.view !== VIEW_PLAYING || !this.activeMode) {
      this.onCanvasClick(event);
      return;
    }
    this.activeMode.onPointerUp(this.getPointer(event));
  }

  onPointerLeave() {
    if (this.view !== VIEW_PLAYING || !this.activeMode) return;
    this.activeMode.onPointerLeave();
  }

  onDoubleClick(event) {
    if (this.view !== VIEW_PLAYING || !this.activeMode) return;
    this.activeMode.onDoubleClick(this.getPointer(event));
  }

  onKeyDown(event) {
    if (this.view === VIEW_JOIN) {
      if (event.key === "Backspace" || event.key === "Delete") {
        this.roomCode = this.roomCode.slice(0, -1);
      } else if (event.key === "Escape") {
        this.roomCode = "";
        this.switchView(VIEW_MENU);
      } else if (event.key === "Enter") {
        if (this.roomCode.length === 4) {
          this.send({ type: "join", code: this.roomCode });
          this.switchView(VIEW_CONNECTING);
        }
      } else if (/^[0-9]$/.test(event.key) && this.roomCode.length < 4) {
        this.roomCode = clampRoomCode((this.roomCode + event.key).toUpperCase());
      }
    }
  }

  getPointer(event) {
    // Map pointer/touch coordinates into game units respecting the current scale and offsets.
    const touch = event?.changedTouches?.[0] || event?.touches?.[0];
    const clientX = touch?.clientX ?? event.clientX ?? 0;
    const clientY = touch?.clientY ?? event.clientY ?? 0;
    if ((event.pointerType === "touch" || touch) && event.cancelable) {
      event.preventDefault();
    }
    const rect = this.canvas.getBoundingClientRect();
    const x = (clientX - rect.left - this.offsetX) / this.scale;
    const y = (clientY - rect.top - this.offsetY) / this.scale;

    if (window.DEBUG_LAYOUT) {
      console.log("[layout] pointer", {
        clientX: Math.round(clientX),
        clientY: Math.round(clientY),
        canvasX: Number(x.toFixed(2)),
        canvasY: Number(y.toFixed(2)),
        scale: Number(this.scale.toFixed(3)),
      });
    }

    return { x, y };
  }

  render() {
    const ctx = this.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.translate(this.offsetX, this.offsetY);
    ctx.scale(this.scale, this.scale);

    switch (this.view) {
      case VIEW_MENU:
        this.renderMenu();
        break;
      case VIEW_JOIN:
        this.renderJoin();
        break;
      case VIEW_CONNECTING:
        this.renderConnecting();
        break;
      case VIEW_PLAYING:
        if (this.activeMode) {
          this.activeMode.render();
        }
        break;
      default:
        break;
    }
    window.requestAnimationFrame(this.render);
  }

  renderMenu() {
    const { ctx, width: W, height: H } = this;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = "#222";
    ctx.fillRect(0, 0, W, H);

    ctx.fillStyle = "#fff";
    ctx.font = "bold 48px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("Card Game", W / 2, H / 2 - 150);

    this.menuButtons.forEach((button) => button.draw(ctx));
  }

  renderJoin() {
    const { ctx, width: W, height: H } = this;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = "#222";
    ctx.fillRect(0, 0, W, H);

    ctx.fillStyle = "#fff";
    ctx.font = "32px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("Enter Table Code:", W / 2, H / 2 - 60);

    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 2;
    ctx.strokeRect(W / 2 - 120, H / 2 - 30, 240, 60);

    ctx.font = "36px monospace";
    const paddedCode = clampRoomCode(this.roomCode.padEnd(4, "_")).split("").join(" ");
    ctx.fillText(paddedCode, W / 2, H / 2);

    ctx.font = "18px sans-serif";
    ctx.fillText("Tap the keypad (4 digits) then press ENTER or Join", W / 2, H / 2 + 80);

    this.joinButtons.forEach((button) => button.draw(ctx));
  }

  renderConnecting() {
    const { ctx, width: W, height: H } = this;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = "#222";
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = "#fff";
    ctx.font = "28px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("Connecting...", W / 2, H / 2);
  }
}

export function initApp() {
  const canvas = document.getElementById("game");
  const app = new App(canvas);
  app.start();
}
