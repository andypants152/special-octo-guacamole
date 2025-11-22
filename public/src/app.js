import { Button } from "./ui/button.js";
import { SolitaireMode } from "./modes/solitaireMode.js";
import { EuchreMode } from "./modes/euchreMode.js";

const BASE_WIDTH = 1100;
const BASE_HEIGHT = 700;
const MOBILE_ROTATE_BREAKPOINT = 900;
const DOUBLE_TAP_MAX_DELAY = 320;
const DOUBLE_TAP_MAX_DISTANCE = 32;
const JOIN_BUTTON_WIDTH = 100;
const JOIN_BUTTON_HEIGHT = 60;
const JOIN_BUTTON_GAP = 15;
const JOIN_KEYPAD_LAYOUT = [
  ["1", "2", "3"],
  ["4", "5", "6"],
  ["7", "8", "9"],
  ["Cancel", "0", "Delete"],
];

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
    this.pixelRatio = window.devicePixelRatio || 1;
    this.lastTouchTap = { time: 0, x: 0, y: 0 };
    this.rotateViewport = false;
    this.canvasCssWidth = this.baseWidth;
    this.canvasCssHeight = this.baseHeight;
    this.viewportWidth = this.baseWidth;
    this.viewportHeight = this.baseHeight;

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
    if (window.visualViewport) {
      window.visualViewport.addEventListener("resize", this.resizeCanvas);
      window.visualViewport.addEventListener("scroll", this.resizeCanvas);
    }
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
    const visualViewport = window.visualViewport;
    const viewportWidth = Math.max(
      visualViewport?.width ?? 0,
      window.innerWidth || 0,
      document.documentElement?.clientWidth || 0,
    );
    const viewportHeight = Math.max(
      visualViewport?.height ?? 0,
      window.innerHeight || 0,
      document.documentElement?.clientHeight || 0,
    );
    const cssWidth = viewportWidth || this.baseWidth;
    const cssHeight = viewportHeight || this.baseHeight;
    this.viewportWidth = cssWidth;
    this.viewportHeight = cssHeight;
    const shouldRotate = cssHeight > cssWidth && cssWidth < MOBILE_ROTATE_BREAKPOINT;
    this.rotateViewport = shouldRotate;

    const availableWidth = shouldRotate ? cssHeight : cssWidth;
    const availableHeight = shouldRotate ? cssWidth : cssHeight;
    this.canvasCssWidth = availableWidth;
    this.canvasCssHeight = availableHeight;

    const fitScale = Math.min(availableWidth / this.baseWidth, availableHeight / this.baseHeight) || 1;
    this.scale = Math.max(fitScale, 0.25);

    const displayWidth = this.baseWidth * this.scale;
    const displayHeight = this.baseHeight * this.scale;
    this.offsetX = (availableWidth - displayWidth) / 2;
    this.offsetY = (availableHeight - displayHeight) / 2;

    this.pixelRatio = Math.min(window.devicePixelRatio || 1, 3);
    const pixelWidth = Math.round(availableWidth * this.pixelRatio);
    const pixelHeight = Math.round(availableHeight * this.pixelRatio);
    if (this.canvas.width !== pixelWidth) {
      this.canvas.width = pixelWidth;
    }
    if (this.canvas.height !== pixelHeight) {
      this.canvas.height = pixelHeight;
    }
    this.ctx.imageSmoothingEnabled = false;

    const style = this.canvas.style;
    style.width = `${availableWidth}px`;
    style.height = `${availableHeight}px`;
    style.position = "fixed";
    const viewportOffsetX = visualViewport?.offsetLeft ?? 0;
    const viewportOffsetY = visualViewport?.offsetTop ?? 0;
    const viewportWidthCurrent = visualViewport?.width ?? cssWidth;
    const viewportHeightCurrent = visualViewport?.height ?? cssHeight;
    const viewportCenterX = viewportOffsetX + viewportWidthCurrent / 2;
    const viewportCenterY = viewportOffsetY + viewportHeightCurrent / 2;
    if (shouldRotate) {
      const left = viewportCenterX - (availableWidth / 2);
      const top = viewportCenterY - (availableHeight / 2);
      style.left = `${left}px`;
      style.top = `${top}px`;
      style.right = "";
      style.bottom = "";
      style.transformOrigin = "center center";
      style.transform = "rotate(90deg)";
    } else {
      const left = viewportCenterX - (availableWidth / 2);
      const top = viewportCenterY - (availableHeight / 2);
      style.left = `${left}px`;
      style.top = `${top}px`;
      style.right = "";
      style.bottom = "";
      style.transformOrigin = "top left";
      style.transform = "none";
    }

    console.debug("[layout] resize applied");
    if (window.DEBUG_LAYOUT) {
      // Quick insight into responsive sizing on desktop and mobile.
      console.info("[layout] resize", {
        availableWidth: Math.round(availableWidth),
        availableHeight: Math.round(availableHeight),
        rotated: shouldRotate,
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

  getJoinLayoutMetrics() {
    const buttonWidth = JOIN_BUTTON_WIDTH;
    const buttonHeight = JOIN_BUTTON_HEIGHT;
    const gap = JOIN_BUTTON_GAP;
    const joinWidth = (buttonWidth * 3) + (gap * 2);
    const startX = this.width / 2 - (joinWidth / 2);
    const keypadRows = JOIN_KEYPAD_LAYOUT.length;
    const keypadHeight = (keypadRows + 1) * buttonHeight + keypadRows * gap;
    const titleY = Math.max(60, this.height * 0.15);
    const codeBoxCenterY = Math.max(titleY + 60, this.height * 0.28);
    const instructionsBase = Math.max(codeBoxCenterY + 40, this.height * 0.35);
    const instructionsMax = this.height - keypadHeight - 80;
    let instructionsY = Math.min(instructionsBase, instructionsMax);
    if (!Number.isFinite(instructionsY)) {
      instructionsY = instructionsBase;
    }
    const keypadStartMin = instructionsY + 40;
    const keypadStartCentered = ((this.height - keypadHeight) / 2) + 20;
    const keypadStartMax = this.height - keypadHeight - 10;
    const startY = Math.max(
      120,
      Math.min(Math.max(keypadStartMin, keypadStartCentered), keypadStartMax),
    );

    return {
      layout: JOIN_KEYPAD_LAYOUT,
      buttonWidth,
      buttonHeight,
      gap,
      startX,
      startY,
      joinWidth,
      titleY,
      codeBoxCenterY,
      instructionsY,
    };
  }

  setupJoinButtons() {
    this.joinButtons = [];
    const metrics = this.getJoinLayoutMetrics();
    const {
      layout, buttonWidth, buttonHeight, gap, startX, startY, joinWidth,
    } = metrics;

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
    const point = this.getPointer(event);
    this.activeMode.onPointerUp(point);
    if (this.shouldTriggerDoubleTap(event, point)) {
      this.activeMode.onDoubleClick(point);
    }
  }

  onPointerLeave() {
    if (this.view !== VIEW_PLAYING || !this.activeMode) return;
    this.activeMode.onPointerLeave();
  }

  shouldTriggerDoubleTap(event, point) {
    const isTouchPointer = event.pointerType === "touch";
    if (!isTouchPointer || !point) {
      this.lastTouchTap.time = 0;
      return false;
    }
    const now = (window.performance?.now ? window.performance.now() : Date.now());
    const elapsed = now - (this.lastTouchTap.time || 0);
    const dx = point.x - this.lastTouchTap.x;
    const dy = point.y - this.lastTouchTap.y;
    const distanceSq = dx * dx + dy * dy;
    if (elapsed > 0 && elapsed <= DOUBLE_TAP_MAX_DELAY && distanceSq <= DOUBLE_TAP_MAX_DISTANCE ** 2) {
      this.lastTouchTap.time = 0;
      return true;
    }
    this.lastTouchTap = { time: now, x: point.x, y: point.y };
    return false;
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
    let x;
    let y;
    const rect = this.canvas.getBoundingClientRect();
    if (this.rotateViewport) {
      const centerX = rect.left + (rect.width / 2);
      const centerY = rect.top + (rect.height / 2);
      const dx = clientX - centerX;
      const dy = clientY - centerY;
      const localX = dy + (this.canvasCssWidth / 2);
      const localY = -dx + (this.canvasCssHeight / 2);
      x = (localX - this.offsetX) / this.scale;
      y = (localY - this.offsetY) / this.scale;
    } else {
      x = (clientX - rect.left - this.offsetX) / this.scale;
      y = (clientY - rect.top - this.offsetY) / this.scale;
    }

    if (window.DEBUG_LAYOUT) {
      console.log("[layout] pointer", {
        clientX: Math.round(clientX),
        clientY: Math.round(clientY),
        canvasX: Number(x.toFixed(2)),
        canvasY: Number(y.toFixed(2)),
        scale: Number(this.scale.toFixed(3)),
        rotated: this.rotateViewport,
      });
    }

    return { x, y };
  }

  render() {
    const ctx = this.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.scale(this.pixelRatio, this.pixelRatio);
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
    const joinLayout = this.getJoinLayoutMetrics();
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = "#222";
    ctx.fillRect(0, 0, W, H);

    ctx.fillStyle = "#fff";
    ctx.font = "32px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("Enter Table Code:", W / 2, joinLayout.titleY);

    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 2;
    const codeBoxWidth = 260;
    const codeBoxHeight = 70;
    const codeBoxX = W / 2 - codeBoxWidth / 2;
    const codeBoxY = joinLayout.codeBoxCenterY - codeBoxHeight / 2;
    ctx.strokeRect(codeBoxX, codeBoxY, codeBoxWidth, codeBoxHeight);

    ctx.font = "36px monospace";
    const paddedCode = clampRoomCode(this.roomCode.padEnd(4, "_")).split("").join(" ");
    ctx.fillText(paddedCode, W / 2, joinLayout.codeBoxCenterY);

    ctx.font = "18px sans-serif";
    ctx.fillText("Tap the keypad (4 digits) then press ENTER or Join", W / 2, joinLayout.instructionsY);

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
