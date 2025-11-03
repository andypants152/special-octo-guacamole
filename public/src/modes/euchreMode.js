import { Button } from "../ui/button.js";
import { drawCard } from "../render/cardRenderer.js";

const CARD_W = 80;
const CARD_H = 110;

function labelForSeat(seat, ourSeat) {
  if (seat === ourSeat) return "You";
  if (((ourSeat + 2) % 4) === seat) return "Partner";
  return `Player ${seat + 1}`;
}

export class EuchreMode {
  constructor(app) {
    this.app = app;
    this.ctx = app.ctx;
    this.state = null;
    this.seat = null;
    this.handLayout = [];
    this.hoverIndex = -1;
    this.actionButtons = [];
    this.awaitingDiscard = false;

    this.redealButton = new Button(
      "Redeal",
      30,
      this.app.height - 70,
      140,
      50,
      () => this.app.send({ type: "redeal" }),
    );
  }

  enter() {
    this.hoverIndex = -1;
    this.actionButtons = [];
    this.awaitingDiscard = false;
  }

  exit() {
    this.hoverIndex = -1;
    this.actionButtons = [];
    this.awaitingDiscard = false;
  }

  processState(state) {
    if (!state || state.mode !== "euchre") return;
    this.state = state;
    if (typeof state.seat === "number") {
      this.seat = state.seat;
    }
    if (state.currentPlayer !== this.seat) {
      this.hoverIndex = -1;
    }
    this.buildActionButtons();
  }

  onPointerDown(point) {
    for (const button of this.actionButtons) {
      if (button.contains(point)) {
        button.onClick();
        return;
      }
    }
    if (this.redealButton.contains(point)) {
      this.redealButton.onClick();
      return;
    }

    this.tryPlayCard(point);
  }

  onPointerMove(point) {
    const isPlayingTurn = this.state && this.state.phase === "playing" && this.state.currentPlayer === this.seat;
    const isDiscardTurn = this.state && this.state.phase === "dealerDiscard" && this.state.dealer === this.seat;
    if (!isPlayingTurn && !isDiscardTurn) {
      this.hoverIndex = -1;
      this.app.canvas.style.cursor = "default";
      return;
    }
    let hover = -1;
    this.handLayout.forEach((rect, index) => {
      if (hover >= 0) return;
      if (point.x >= rect.x && point.x <= rect.x + rect.w && point.y >= rect.y && point.y <= rect.y + rect.h) {
        hover = index;
      }
    });
    this.hoverIndex = hover;
    this.app.canvas.style.cursor = hover >= 0 ? "pointer" : "default";
  }

  onPointerUp() {
    // no-op
  }

  onPointerLeave() {
    this.hoverIndex = -1;
    this.app.canvas.style.cursor = "default";
  }

  onDoubleClick() {
    // no-op
  }

  render() {
    const { ctx } = this;
    const W = this.app.width;
    const H = this.app.height;

    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = "#2c4b32";
    ctx.fillRect(0, 0, W, H);

    ctx.fillStyle = "#fff";
    ctx.font = "24px sans-serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.fillText("Euchre", 20, 20);

    if (!this.state) {
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.font = "28px sans-serif";
      ctx.fillText("Waiting for players...", W / 2, H / 2);
      this.redealButton.draw(ctx);
      return;
    }

    const seat = typeof this.seat === "number" ? this.seat : 0;
    const teamIndex = seat % 2;
    const opponentTeam = 1 - teamIndex;
    const isDiscardPhase = this.state.phase === "dealerDiscard" && seat === this.state.dealer;

    ctx.font = "18px sans-serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.fillText(`Dealer: ${labelForSeat(this.state.dealer, seat)}`, 20, 60);
    ctx.fillText(`Trump: ${this.state.trumpSuit ?? "Undecided"}`, 20, 84);
    ctx.fillText(`Scores — Us: ${this.state.scores?.[teamIndex] ?? 0} | Them: ${this.state.scores?.[opponentTeam] ?? 0}`, 20, 108);
    ctx.fillText(`Tricks — Us: ${this.state.tricksWon?.[teamIndex] ?? 0} | Them: ${this.state.tricksWon?.[opponentTeam] ?? 0}`, 20, 132);
    const trickCount = this.state.trickNumber ?? 0;
    const roundLabel = this.state.phase === "playing"
      ? Math.min(trickCount + 1, 5)
      : Math.max(Math.min(trickCount, 5), 1);
    ctx.fillText(`Round: ${roundLabel} / 5`, 20, 156);

    if (this.state.turnCard) drawCard(ctx, this.state.turnCard, W / 2 - 35, 120, 70, 96);

    const instruction = this.composeInstruction();
    if (instruction) {
      ctx.font = "20px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      ctx.fillText(instruction, W / 2, 20);
    }

    const handCounts = this.state.handCounts || [0, 0, 0, 0];
    const hand = this.state.hand || [];
    const currentPlayer = this.state.currentPlayer;

    this.handLayout = [];

    const relativeSeats = Array.from({ length: 4 }, (_, index) => (seat + index) % 4);

    relativeSeats.forEach((absoluteSeat, relativeIndex) => {
      const isCurrent = this.state.phase === "playing" && currentPlayer === absoluteSeat;
      const label = labelForSeat(absoluteSeat, seat);
      ctx.font = "18px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "bottom";

      if (relativeIndex === 0) {
        const overlap = 50;
        const totalWidth = hand.length > 0 ? CARD_W + (hand.length - 1) * overlap : CARD_W;
        const startX = W / 2 - totalWidth / 2;
        const y = H - CARD_H - 40;
        ctx.fillText(label, W / 2, y - 20);
        if (isCurrent || (isDiscardPhase && relativeIndex === 0)) {
          ctx.fillStyle = "#ffe082";
          const prompt = isDiscardPhase ? "Discard a card" : "Your turn";
          ctx.fillText(prompt, W / 2, y - 44);
          ctx.fillStyle = "#fff";
        }
        if (hand.length === 0) {
          ctx.save();
          ctx.strokeStyle = "#fff";
          ctx.setLineDash([8, 6]);
          ctx.strokeRect(W / 2 - CARD_W / 2, y, CARD_W, CARD_H);
          ctx.restore();
        }
        hand.forEach((card, index) => {
          const x = startX + index * overlap;
          this.handLayout[index] = { x, y, w: CARD_W, h: CARD_H };
          drawCard(ctx, card, x, y, CARD_W, CARD_H);
          if (index === this.hoverIndex && (isCurrent || isDiscardPhase)) {
            ctx.save();
            ctx.strokeStyle = "#ffeb3b";
            ctx.lineWidth = 3;
            ctx.strokeRect(x - 2, y - 2, CARD_W + 4, CARD_H + 4);
            ctx.restore();
          }
        });
      } else if (relativeIndex === 1) {
        const count = handCounts[absoluteSeat] ?? 0;
        const x = W - CARD_W - 40;
        const startY = H / 2 - (count * 30);
        ctx.fillText(label, x + CARD_W / 2, startY - 20);
        if (isCurrent) {
          ctx.fillStyle = "#ffe082";
          ctx.fillText("Playing", x + CARD_W / 2, startY - 44);
          ctx.fillStyle = "#fff";
        }
        for (let i = 0; i < count; i += 1) {
          drawCard(ctx, { faceUp: false }, x, startY + i * 30, CARD_W, CARD_H);
        }
      } else if (relativeIndex === 2) {
        const count = handCounts[absoluteSeat] ?? 0;
        const overlap = 40;
        const totalWidth = count > 0 ? CARD_W + (count - 1) * overlap : CARD_W;
        const startX = W / 2 - totalWidth / 2;
        const y = 80;
        ctx.fillText(label, W / 2, y - 20);
        if (isCurrent) {
          ctx.fillStyle = "#ffe082";
          ctx.fillText("Playing", W / 2, y - 44);
          ctx.fillStyle = "#fff";
        }
        for (let i = 0; i < count; i += 1) {
          drawCard(ctx, { faceUp: false }, startX + i * overlap, y, CARD_W, CARD_H);
        }
      } else {
        const count = handCounts[absoluteSeat] ?? 0;
        const x = 40;
        const startY = H / 2 - (count * 30);
        ctx.fillText(label, x + CARD_W / 2, startY - 20);
        if (isCurrent) {
          ctx.fillStyle = "#ffe082";
          ctx.fillText("Playing", x + CARD_W / 2, startY - 44);
          ctx.fillStyle = "#fff";
        }
        for (let i = 0; i < count; i += 1) {
          drawCard(ctx, { faceUp: false }, x, startY + i * 30, CARD_W, CARD_H);
        }
      }
    });

    const trick = this.state.currentTrick || [];
    const trickOffsets = [
      { x: 0, y: CARD_H / 2 + 20 },
      { x: CARD_W + 40, y: -CARD_H / 2 },
      { x: 0, y: -CARD_H - 40 },
      { x: -(CARD_W + 40), y: -CARD_H / 2 },
    ];
    const baseX = W / 2 - CARD_W / 2;
    const baseY = H / 2 - CARD_H / 2;

    trick.forEach((play) => {
      const relative = ((play.player - seat) % 4 + 4) % 4;
      const offset = trickOffsets[relative];
      drawCard(ctx, play.card, baseX + offset.x, baseY + offset.y, CARD_W, CARD_H);
    });

    ctx.font = "18px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    if (this.state.phase === "playing") {
      if (currentPlayer === seat) {
        ctx.fillStyle = "#ffeb3b";
        ctx.fillText("Select a card to play", W / 2, H - 10);
      } else {
        ctx.fillStyle = "#fff";
        ctx.fillText(`Waiting for ${labelForSeat(currentPlayer, seat)} to play.`, W / 2, H - 10);
      }
    } else if (this.state.phase === "roundComplete") {
      ctx.fillStyle = "#ffeb3b";
      ctx.fillText("Round complete — press Redeal to continue", W / 2, H - 10);
    }
    ctx.fillStyle = "#fff";

    this.redealButton.draw(ctx);
    this.actionButtons.forEach((button) => button.draw(ctx));

    ctx.save();
    ctx.fillStyle = "#fff";
    ctx.font = "24px sans-serif";
    ctx.textAlign = "right";
    ctx.textBaseline = "bottom";
    ctx.fillText(`Table #${this.app.roomCode}`, W - 20, H - 20);
    ctx.restore();
  }

  tryPlayCard(point) {
    if (!this.state) return;
    if (this.state.phase === "dealerDiscard" && this.state.dealer === this.seat) {
      for (let index = 0; index < this.handLayout.length; index += 1) {
        const rect = this.handLayout[index];
        if (point.x >= rect.x && point.x <= rect.x + rect.w && point.y >= rect.y && point.y <= rect.y + rect.h) {
          this.app.send({ type: "euchreDecision", action: "discard", cardIndex: index });
          return;
        }
      }
      return;
    }
    if (this.state.phase !== "playing" || this.state.currentPlayer !== this.seat) return;
    for (let index = 0; index < this.handLayout.length; index += 1) {
      const rect = this.handLayout[index];
      if (point.x >= rect.x && point.x <= rect.x + rect.w && point.y >= rect.y && point.y <= rect.y + rect.h) {
        this.app.send({ type: "euchrePlay", cardIndex: index });
        break;
      }
    }
  }

  buildActionButtons() {
    this.actionButtons = [];
    this.awaitingDiscard = false;
    if (!this.state) return;
    const actions = this.state.availableActions || [];
    if (actions.some((action) => action.type === "discard")) {
      this.awaitingDiscard = true;
    }
    const actionable = actions.filter((action) => action.type !== "discard");
    if (!actionable.length) return;

    const buttonWidth = 160;
    const buttonHeight = 44;
    const gap = 12;
    const totalWidth = actionable.length * buttonWidth + (actionable.length - 1) * gap;
    const startX = this.app.width / 2 - totalWidth / 2;
    const handTop = this.app.height - CARD_H - 40;
    const y = handTop - buttonHeight - 20;

    actionable.forEach((action, index) => {
      const x = startX + index * (buttonWidth + gap);
      const label = this.getActionLabel(action);
      this.actionButtons.push(new Button(label, x, y, buttonWidth, buttonHeight, () => this.onAction(action)));
    });
  }

  getActionLabel(action) {
    switch (action.type) {
      case "pickup":
        return "Pick Up";
      case "pass":
        return "Pass";
      case "orderUp":
        return "Order Up";
      case "callSuit":
        return `Call ${action.suit}`;
      default:
        return action.type;
    }
  }

  onAction(action) {
    const payload = { type: "euchreDecision", action: action.type };
    if (action.type === "callSuit") {
      payload.suit = action.suit;
    }
    this.app.send(payload);
  }

  composeInstruction() {
    if (!this.state) return "";
    const phase = this.state.phase;
    const actingSeat = this.state.currentDecision;
    const actorLabel = typeof actingSeat === "number" ? labelForSeat(actingSeat, this.seat) : null;

    switch (phase) {
      case "dealerDecision":
        return this.seat === this.state.dealer
          ? "Choose to pick up the turn card or pass."
          : "Dealer is deciding on trump.";
      case "orderUp":
        return this.seat === actingSeat
          ? "Order the dealer up or pass."
          : `Waiting for ${actorLabel} to order up.`;
      case "callSuit":
        if (this.seat === actingSeat) {
          const forbidden = this.state.forbiddenSuit ? ` (no ${this.state.forbiddenSuit})` : "";
          const pieces = [`Call a suit${forbidden}.`];
          if (this.seat === this.state.dealer) pieces.push("Dealer must choose.");
          return pieces.join(" ").trim();
        }
        return `Waiting for ${actorLabel} to call trump.`;
      case "dealerDiscard":
        return this.seat === this.state.dealer
          ? "Select a card to discard."
          : "Dealer is discarding.";
      case "playing":
        return this.state.currentPlayer === this.seat
          ? "Select a card to play."
          : `Waiting for ${labelForSeat(this.state.currentPlayer, this.seat)} to play.`;
      case "roundComplete":
        return "Round complete — press Redeal to continue.";
      default:
        return "";
    }
  }
}
