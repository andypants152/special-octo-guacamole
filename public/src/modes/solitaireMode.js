import { Button } from "../ui/button.js";
import { drawCard, getCardColor, getRankValue } from "../render/cardRenderer.js";

const CARD_W = 80;
const CARD_H = 110;

function cloneCard(card) {
  return { suit: card.suit, rank: card.rank, faceUp: Boolean(card.faceUp) };
}

function clonePile(pile = []) {
  return pile.map(cloneCard);
}

export class SolitaireMode {
  constructor(app) {
    this.app = app;
    this.canvas = app.canvas;
    this.ctx = app.ctx;

    this.stock = [];
    this.waste = [];
    this.tableaus = Array.from({ length: 7 }, () => []);
    this.foundations = Array.from({ length: 4 }, () => []);

    this.dragging = null;
    this.dragFrom = null;
    this.offsetX = 0;
    this.offsetY = 0;

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
    // Nothing required on enter beyond ensuring latest state renders.
  }

  exit() {
    this.stopDragging();
  }

  processState(state) {
    if (!state || state.mode !== "solitaire") return;
    this.loadFromState(state);
  }

  loadFromState(state) {
    this.stock = clonePile(state.stock);
    this.waste = clonePile(state.waste);
    this.tableaus = (state.tableaus || []).map(clonePile);
    this.foundations = (state.foundations || []).map(clonePile);
    this.stopDragging();
  }

  stopDragging() {
    this.dragging = null;
    this.dragFrom = null;
  }

  onPointerDown(point) {
    if (this.redealButton.contains(point)) {
      this.redealButton.onClick();
      return;
    }

    // Stock interaction.
    if (this.isPointInRect(point, 30, 30, CARD_W, CARD_H)) {
      this.app.send({ type: "draw" });
      return;
    }

    // Tableau drag detection.
    for (let col = 0; col < this.tableaus.length; col += 1) {
      const pile = this.tableaus[col];
      for (let row = pile.length - 1; row >= 0; row -= 1) {
        const card = pile[row];
        if (!card.faceUp) continue;
        const x = 30 + col * 100;
        const y = 180 + row * 25;
        if (this.isPointInRect(point, x, y, CARD_W, CARD_H)) {
          const slice = pile.slice(row);
          if (!slice.length) return;
          this.dragging = {
            cards: clonePile(slice),
            x,
            y,
          };
          this.dragFrom = { type: "tableau", index: col, startIndex: row };
          this.offsetX = point.x - x;
          this.offsetY = point.y - y;
          return;
        }
      }
    }

    // Waste drag.
    if (this.waste.length > 0 && this.isPointInRect(point, 140, 30, CARD_W, CARD_H)) {
      const card = this.waste[this.waste.length - 1];
      this.dragging = {
        cards: [cloneCard(card)],
        x: 140,
        y: 30,
      };
      this.dragFrom = { type: "waste" };
      this.offsetX = point.x - 140;
      this.offsetY = point.y - 30;
      return;
    }

    // Foundation drag back to tableau.
    for (let i = 0; i < this.foundations.length; i += 1) {
      const pile = this.foundations[i];
      if (!pile.length) continue;
      const x = this.app.width - 500 + i * 100;
      const y = 30;
      if (this.isPointInRect(point, x, y, CARD_W, CARD_H)) {
        const card = pile[pile.length - 1];
        this.dragging = {
          cards: [cloneCard(card)],
          x,
          y,
        };
        this.dragFrom = { type: "foundation", index: i };
        this.offsetX = point.x - x;
        this.offsetY = point.y - y;
        return;
      }
    }
  }

  onPointerMove(point) {
    if (!this.dragging) return;
    this.dragging.x = point.x - this.offsetX;
    this.dragging.y = point.y - this.offsetY;
  }

  onPointerUp(point) {
    if (!this.dragging) return;
    if (this.tryDropOnFoundation(point)) {
      this.stopDragging();
      return;
    }
    if (this.tryDropOnTableau(point)) {
      this.stopDragging();
      return;
    }
    this.stopDragging();
  }

  onPointerLeave() {
    if (this.dragging) {
      this.stopDragging();
    }
  }

  onDoubleClick(point) {
    // Attempt auto-move from tableau.
    for (let col = 0; col < this.tableaus.length; col += 1) {
      const pile = this.tableaus[col];
      if (!pile.length) continue;
      const row = pile.length - 1;
      const card = pile[row];
      if (!card.faceUp) continue;
      const x = 30 + col * 100;
      const y = 180 + row * 25;
      if (this.isPointInRect(point, x, y, CARD_W, CARD_H)) {
        const target = this.findFoundationTarget(card);
        if (target !== null) {
          this.app.send({
            type: "move",
            move: {
              from: { type: "tableau", index: col, start: row },
              to: { type: "foundation", index: target },
            },
          });
        }
        return;
      }
    }

    // Attempt auto-move from waste.
    if (this.waste.length > 0 && this.isPointInRect(point, 140, 30, CARD_W, CARD_H)) {
      const target = this.findFoundationTarget(this.waste[this.waste.length - 1]);
      if (target !== null) {
        this.app.send({
          type: "move",
          move: {
            from: { type: "waste" },
            to: { type: "foundation", index: target },
          },
        });
      }
    }
  }

  findFoundationTarget(card) {
    for (let i = 0; i < this.foundations.length; i += 1) {
      const pile = this.foundations[i];
      const top = pile[pile.length - 1];
      if (!top && card.rank === "A") return i;
      if (top && top.suit === card.suit && getRankValue(top.rank) === getRankValue(card.rank) - 1) {
        return i;
      }
    }
    return null;
  }

  tryDropOnFoundation(point) {
    if (!this.dragging || this.dragging.cards.length !== 1) return false;
    const card = this.dragging.cards[0];
    for (let i = 0; i < this.foundations.length; i += 1) {
      const x = this.app.width - 500 + i * 100;
      const y = 30;
      if (!this.isPointInDropZone(point, x, y, CARD_W, CARD_H)) continue;
      const pile = this.foundations[i];
      const top = pile[pile.length - 1];
      if (!top && card.rank !== "A") continue;
      if (top && (top.suit !== card.suit || getRankValue(card.rank) !== getRankValue(top.rank) + 1)) continue;

      const move = this.createMovePayload("foundation", i);
      if (move) this.app.send({ type: "move", move });
      return true;
    }
    return false;
  }

  tryDropOnTableau(point) {
    if (!this.dragging) return false;
    const card = this.dragging.cards[0];
    for (let i = 0; i < this.tableaus.length; i += 1) {
      const pile = this.tableaus[i];
      const baseX = 30 + i * 100;
      const baseY = pile.length ? 180 + (pile.length - 1) * 25 : 180;
      if (!this.isPointInDropZone(point, baseX, baseY, CARD_W, CARD_H)) continue;
      const top = pile[pile.length - 1];
      if (!top && card.rank !== "K") continue;
      if (top) {
        const colorTop = getCardColor(top);
        const colorCard = getCardColor(card);
        if (colorTop === colorCard) continue;
        if (getRankValue(card.rank) !== getRankValue(top.rank) - 1) continue;
      }

      const move = this.createMovePayload("tableau", i);
      if (move) this.app.send({ type: "move", move });
      return true;
    }
    return false;
  }

  createMovePayload(destinationType, destinationIndex) {
    if (!this.dragFrom) return null;
    const from = { type: this.dragFrom.type };
    if (this.dragFrom.type === "tableau") {
      from.index = this.dragFrom.index;
      from.start = this.dragFrom.startIndex;
    } else if (this.dragFrom.type === "foundation") {
      from.index = this.dragFrom.index;
    }
    const move = { from, to: { type: destinationType, index: destinationIndex } };
    if (from.start === undefined) delete from.start;
    if (from.index === undefined) delete from.index;
    return move;
  }

  isPointInRect(point, x, y, width, height) {
    return point.x >= x && point.x <= x + width && point.y >= y && point.y <= y + height;
  }

  isPointInDropZone(point, x, y, width, height) {
    const top = y - 30;
    const bottom = y + height;
    return point.x >= x && point.x <= x + width && point.y >= top && point.y <= bottom;
  }

  render() {
    const { ctx } = this;
    const W = this.app.width;
    const H = this.app.height;

    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = "#35654d";
    ctx.fillRect(0, 0, W, H);

    ctx.save();
    ctx.fillStyle = "#fff";
    ctx.font = "24px sans-serif";
    ctx.textAlign = "right";
    ctx.textBaseline = "bottom";
    const playerInfo = this.app.latestState?.players ? `Players: ${this.app.latestState.players}` : "";
    ctx.fillText(`Table #${this.app.roomCode}${playerInfo ? ` • ${playerInfo}` : ""}`, W - 20, H - 20);
    ctx.restore();

    // Stock
    if (this.stock.length > 0) {
      drawCard(ctx, { faceUp: false }, 30, 30, CARD_W, CARD_H);
    } else {
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 2;
      ctx.strokeRect(30, 30, CARD_W, CARD_H);
    }

    // Waste
    if (this.waste.length > 0) {
      if (this.dragFrom?.type === "waste" && this.dragging) {
        ctx.strokeStyle = "#fff";
        ctx.lineWidth = 2;
        ctx.strokeRect(140, 30, CARD_W, CARD_H);
      } else {
        drawCard(ctx, this.waste[this.waste.length - 1], 140, 30, CARD_W, CARD_H);
      }
    } else {
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 2;
      ctx.strokeRect(140, 30, CARD_W, CARD_H);
    }

    // Foundations
    for (let i = 0; i < this.foundations.length; i += 1) {
      const pile = this.foundations[i];
      const x = W - 500 + i * 100;
      const y = 30;
      const isDraggingFromFoundation = this.dragFrom?.type === "foundation" && this.dragFrom.index === i && this.dragging;
      if (pile.length > 0 && !isDraggingFromFoundation) {
        drawCard(ctx, pile[pile.length - 1], x, y, CARD_W, CARD_H);
      } else {
        ctx.strokeStyle = "#fff";
        ctx.lineWidth = 2;
        ctx.strokeRect(x, y, CARD_W, CARD_H);
      }
    }

    // Tableaus
    for (let i = 0; i < this.tableaus.length; i += 1) {
      const pile = this.tableaus[i];
      for (let j = 0; j < pile.length; j += 1) {
        const card = pile[j];
        const x = 30 + i * 100;
        const y = 180 + j * 25;
        if (this.dragFrom?.type === "tableau" && this.dragFrom.index === i && j >= this.dragFrom.startIndex && this.dragging) {
          continue;
        }
        drawCard(ctx, card, x, y, CARD_W, CARD_H);
      }
      if (pile.length === 0) {
        const x = 30 + i * 100;
        const y = 180;
        ctx.strokeStyle = "#fff";
        ctx.lineWidth = 2;
        ctx.strokeRect(x, y, CARD_W, CARD_H);
      }
    }

    // Redeal button
    this.redealButton.draw(ctx);

    // Dragging cards
    if (this.dragging) {
      this.dragging.cards.forEach((card, index) => {
        drawCard(ctx, card, this.dragging.x, this.dragging.y + index * 25, CARD_W, CARD_H);
      });
    }
  }
}
