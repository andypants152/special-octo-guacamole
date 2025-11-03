// Solitaire game mode logic and helpers

const suits = ["♠", "♥", "♦", "♣"];
const ranks = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];

const color = (suit) => (suit === "♥" || suit === "♦") ? "red" : "black";
const rankValue = (rank) => ranks.indexOf(rank) + 1;

function createDeck() {
  const deck = [];
  for (const suit of suits) {
    for (const rank of ranks) {
      deck.push({ suit, rank, faceUp: false });
    }
  }
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

export function createGame(_options = {}) {
  const deck = createDeck();
  const tableaus = [[], [], [], [], [], [], []];
  let index = 0;
  for (let col = 0; col < 7; col += 1) {
    for (let row = 0; row <= col; row += 1) {
      const card = deck[index++];
      card.faceUp = row === col;
      tableaus[col].push(card);
    }
  }
  const stock = deck.slice(index);
  const waste = [];
  const foundations = [[], [], [], []];
  return { stock, waste, tableaus, foundations };
}

function cloneCard(card) {
  return { suit: card.suit, rank: card.rank, faceUp: Boolean(card.faceUp) };
}

function clonePile(pile = []) {
  return pile.map(cloneCard);
}

function getPile(game, type, index) {
  if (type === "tableau") return game.tableaus?.[index];
  if (type === "foundation") return game.foundations?.[index];
  if (type === "waste") return game.waste;
  if (type === "stock") return game.stock;
  return null;
}

function isValidTableauSequence(cards) {
  if (!cards.length) return false;
  for (let i = 0; i < cards.length - 1; i += 1) {
    const current = cards[i];
    const next = cards[i + 1];
    if (!current.faceUp || !next.faceUp) return false;
    if (color(current.suit) === color(next.suit)) return false;
    if (rankValue(current.rank) !== rankValue(next.rank) + 1) return false;
  }
  return cards[0].faceUp;
}

function normalizeMove(move) {
  if (!move) return null;
  if (move.from && move.to) {
    const normalized = {
      from: { ...move.from },
      to: { ...move.to },
    };
    normalized.from.type = normalized.from.type?.replace("tableaus", "tableau")?.replace("foundations", "foundation");
    normalized.to.type = normalized.to.type?.replace("tableaus", "tableau")?.replace("foundations", "foundation");
    if (normalized.from.type !== "tableau") delete normalized.from.start;
    if (normalized.from.type === "waste") delete normalized.from.index;
    if (normalized.to.type === "waste" || normalized.to.type === "stock") return null;
    return normalized;
  }

  const fromType = move.fromType?.replace("tableaus", "tableau")?.replace("foundations", "foundation");
  const toType = move.toType?.replace("tableaus", "tableau")?.replace("foundations", "foundation");
  if (!fromType || !toType) return null;

  const normalized = {
    from: { type: fromType, index: move.fromIndex, start: move.fromStart },
    to: { type: toType, index: move.toIndex },
  };
  if (normalized.from.type !== "tableau") delete normalized.from.start;
  if (normalized.from.type === "waste") delete normalized.from.index;
  if (normalized.to.type === "waste" || normalized.to.type === "stock") return null;
  return normalized;
}

function isValidMove(game, rawMove) {
  const move = normalizeMove(rawMove);
  if (!move) return false;

  const { from, to } = move;
  const fromPile = getPile(game, from.type, from.index);
  const toPile = getPile(game, to.type, to.index);
  if (!fromPile || !toPile) return false;

  let movingCards;
  if (from.type === "tableau") {
    const startIndex = typeof from.start === "number" ? from.start : fromPile.length - 1;
    if (startIndex < 0 || startIndex >= fromPile.length) return false;
    movingCards = fromPile.slice(startIndex);
    if (!movingCards.length) return false;
    if (!movingCards[0].faceUp) return false;
    if (!isValidTableauSequence(movingCards)) return false;
  } else {
    if (!fromPile.length) return false;
    movingCards = [fromPile[fromPile.length - 1]];
    if (!movingCards[0].faceUp) return false;
  }

  if (to.type === "foundation") {
    if (movingCards.length !== 1) return false;
    const dest = toPile;
    const target = dest[dest.length - 1];
    const card = movingCards[0];
    if (!target) return card.rank === "A";
    return card.suit === target.suit && rankValue(card.rank) === rankValue(target.rank) + 1;
  }

  if (to.type === "tableau") {
    const dest = toPile;
    const top = dest[dest.length - 1];
    const card = movingCards[0];
    if (!top) return card.rank === "K";
    if (!top.faceUp) return false;
    return color(card.suit) !== color(top.suit) && rankValue(card.rank) === rankValue(top.rank) - 1;
  }

  return false;
}

function applyMove(game, rawMove) {
  const move = normalizeMove(rawMove);
  if (!move) return;
  const { from, to } = move;
  const fromPile = getPile(game, from.type, from.index);
  const toPile = getPile(game, to.type, to.index);
  if (!fromPile || !toPile) return;

  if (from.type === "tableau") {
    const startIndex = typeof from.start === "number" ? from.start : fromPile.length - 1;
    const movingCards = fromPile.splice(startIndex);
    const newTop = fromPile[fromPile.length - 1];
    if (newTop && !newTop.faceUp) newTop.faceUp = true;
    toPile.push(...movingCards);
  } else {
    const card = fromPile.pop();
    if (card) toPile.push(card);
  }
}

function drawFromStock(game) {
  if (game.stock.length === 0) {
    while (game.waste.length) {
      const card = game.waste.pop();
      card.faceUp = false;
      game.stock.push(card);
    }
  } else {
    const card = game.stock.pop();
    card.faceUp = true;
    game.waste.push(card);
  }
}

function serialize(room) {
  const game = room.game;
  return {
    mode: "solitaire",
    code: room.code,
    players: room.players.length,
    stock: clonePile(game.stock),
    waste: clonePile(game.waste),
    tableaus: game.tableaus.map(clonePile),
    foundations: game.foundations.map(clonePile),
  };
}

function handleDraw(room) {
  drawFromStock(room.game);
  room.broadcast();
}

function handleMove(room, ws, data) {
  if (isValidMove(room.game, data.move)) {
    applyMove(room.game, data.move);
    room.broadcast();
  } else {
    room.send(ws, { type: "invalidMove" });
  }
}

export default {
  name: "solitaire",
  createGame,
  serialize,
  handlers: {
    draw: (room) => handleDraw(room),
    move: (room, ws, data) => handleMove(room, ws, data),
  },
};
