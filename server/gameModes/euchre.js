const suits = ["♠", "♥", "♦", "♣"];
const euchreRanks = ["9", "10", "J", "Q", "K", "A"];
const sameColorSuit = {
  "♠": "♣",
  "♣": "♠",
  "♥": "♦",
  "♦": "♥",
};

const euchreRankWeight = {
  "9": 1,
  "10": 2,
  "J": 3,
  "Q": 4,
  "K": 5,
  "A": 6,
};

function createDeck() {
  const deck = [];
  for (const suit of suits) {
    for (const rank of euchreRanks) {
      deck.push({ suit, rank });
    }
  }
  for (let i = deck.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

function cloneCard(card) {
  if (!card) return null;
  return { suit: card.suit, rank: card.rank };
}

function clonePile(pile = []) {
  return pile.map(cloneCard);
}

function nextSeat(value) {
  return (value + 1) % 4;
}

function euchreEffectiveSuit(card, trumpSuit) {
  if (!card) return null;
  if (card.rank === "J") {
    if (card.suit === trumpSuit) return trumpSuit;
    if (sameColorSuit[trumpSuit] === card.suit) return trumpSuit;
  }
  return card.suit;
}

function isRightBower(card, trumpSuit) {
  return card.rank === "J" && card.suit === trumpSuit;
}

function isLeftBower(card, trumpSuit) {
  return card.rank === "J" && sameColorSuit[trumpSuit] === card.suit;
}

function euchreCardPower(card, trumpSuit, leadSuit) {
  if (!card) return 0;
  if (isRightBower(card, trumpSuit)) return 200;
  if (isLeftBower(card, trumpSuit)) return 190;
  const suit = euchreEffectiveSuit(card, trumpSuit);
  const base = euchreRankWeight[card.rank] ?? 0;
  if (suit === trumpSuit) return 140 + base;
  if (suit === leadSuit) return 80 + base;
  return base;
}

function playerHasSuit(hand, suit, trumpSuit) {
  return hand.some((card) => euchreEffectiveSuit(card, trumpSuit) === suit);
}

function determineTrickWinner(trick, trumpSuit, leadSuit) {
  let bestPlayer = -1;
  let highestPower = -1;
  for (const play of trick) {
    const power = euchreCardPower(play.card, trumpSuit, leadSuit);
    if (power > highestPower) {
      highestPower = power;
      bestPlayer = play.player;
    }
  }
  return bestPlayer;
}

function attemptPlayCard(state, playerIndex, cardIndex) {
  if (!state || state.phase !== "playing") return false;
  if (playerIndex !== state.currentPlayer) return false;

  const hand = state.hands[playerIndex];
  if (!hand || cardIndex < 0 || cardIndex >= hand.length) return false;

  const card = hand[cardIndex];
  const effectiveSuit = euchreEffectiveSuit(card, state.trumpSuit);

  if (state.leadSuit) {
    if (effectiveSuit !== state.leadSuit && playerHasSuit(hand, state.leadSuit, state.trumpSuit)) {
      return false;
    }
  }

  hand.splice(cardIndex, 1);
  state.currentTrick.push({ player: playerIndex, card });
  if (!state.leadSuit) state.leadSuit = effectiveSuit;

  if (state.currentTrick.length === 4) {
    const winner = determineTrickWinner(state.currentTrick, state.trumpSuit, state.leadSuit);
    const team = winner % 2 === 0 ? 0 : 1;
    state.tricksWon[team] += 1;
    state.completedTricks.push(state.currentTrick);
    state.currentTrick = [];
    state.trickNumber += 1;
    state.leadSuit = null;
    state.currentPlayer = winner;

    if (state.trickNumber >= 5) {
      const winningTeam = state.tricksWon[0] > state.tricksWon[1] ? 0 : 1;
      const tricks = Math.max(state.tricksWon[0], state.tricksWon[1]);
      state.scores[winningTeam] += tricks === 5 ? 2 : 1;
      state.phase = "roundComplete";
    }
  } else {
    state.currentPlayer = nextSeat(state.currentPlayer);
  }

  return true;
}

function beginPlaying(state) {
  state.phase = "playing";
  state.currentPlayer = nextSeat(state.dealer);
  state.leadSuit = null;
  state.currentTrick = [];
  state.trickNumber = 0;
  state.tricksWon = [0, 0];
  state.currentDecision = null;
  state.orderRound = 0;
  state.forbiddenSuit = null;
  state.turnCard = null;
}

function dealerPickup(state) {
  if (!state.turnCard) return;
  const card = state.turnCard;
  state.turnCard = null;
  state.trumpSuit = card.suit;
  state.phase = "dealerDiscard";
  state.currentDecision = state.dealer;
  state.pendingPickupCard = card;
}

function advanceOrderUp(state) {
  const next = nextSeat(state.currentDecision);
  if (next === state.dealer) {
    state.phase = "callSuit";
    state.orderRound = 2;
    state.currentDecision = nextSeat(state.dealer);
    state.forbiddenSuit = state.originalTurnSuit;
  } else {
    state.currentDecision = next;
  }
}

function advanceCallSuit(state) {
  const next = nextSeat(state.currentDecision);
  if (next === state.dealer) {
    state.currentDecision = state.dealer;
  } else {
    state.currentDecision = next;
  }
}

function getAvailableActions(state, seat) {
  const actions = [];
  switch (state.phase) {
    case "dealerDecision":
      if (seat === state.dealer) {
        actions.push({ type: "pickup" }, { type: "pass" });
      }
      break;
    case "orderUp":
      if (seat === state.currentDecision) {
        actions.push({ type: "orderUp" }, { type: "pass" });
      }
      break;
    case "callSuit":
      if (seat === state.currentDecision) {
        suits.forEach((suit) => {
          if (suit !== state.forbiddenSuit) {
            actions.push({ type: "callSuit", suit });
          }
        });
        if (seat !== state.dealer) {
          actions.push({ type: "pass" });
        }
      }
      break;
    case "dealerDiscard":
      if (seat === state.dealer) {
        actions.push({ type: "discard" });
      }
      break;
    default:
      break;
  }
  return actions;
}

export function createGame(options = {}) {
  const { previousGame, forcedDealer } = options;
  let startingDealer = 0;
  if (forcedDealer !== undefined && forcedDealer !== null) {
    startingDealer = forcedDealer % 4;
  } else if (previousGame) {
    startingDealer = nextSeat(previousGame.dealer ?? 0);
  }

  const deck = createDeck();
  const hands = Array.from({ length: 4 }, () => []);
  let ptr = 0;
  for (let deal = 0; deal < 5; deal += 1) {
    for (let player = 0; player < 4; player += 1) {
      hands[player].push(deck[ptr++]);
    }
  }
  const kitty = deck.slice(ptr);
  const turnCard = kitty.shift();

  return {
    dealer: startingDealer,
    phase: "dealerDecision",
    orderRound: 1,
    currentDecision: startingDealer,
    originalTurnSuit: turnCard?.suit ?? null,
    forbiddenSuit: null,
    trumpSuit: null,
    hands,
    kitty,
    turnCard,
    currentPlayer: null,
    leadSuit: null,
    currentTrick: [],
    completedTricks: [],
    trickNumber: 0,
    tricksWon: [0, 0],
    scores: previousGame && Array.isArray(previousGame.scores)
      ? previousGame.scores.slice()
      : [0, 0],
    pendingPickupCard: null,
  };
}

function handleDecision(room, ws, data) {
  const state = room.game;
  const seat = room.players.indexOf(ws);
  if (seat === -1) return;
  const action = data?.action;
  switch (state.phase) {
    case "dealerDecision": {
      if (seat !== state.dealer) break;
      if (action === "pickup") {
        dealerPickup(state);
      } else if (action === "pass") {
        state.phase = "orderUp";
        state.orderRound = 1;
        state.currentDecision = nextSeat(state.dealer);
      } else {
        break;
      }
      room.broadcast();
      return;
    }
    case "orderUp": {
      if (seat !== state.currentDecision) break;
      if (action === "orderUp") {
        dealerPickup(state);
      } else if (action === "pass") {
        advanceOrderUp(state);
      } else {
        break;
      }
      room.broadcast();
      return;
    }
    case "callSuit": {
      if (seat !== state.currentDecision) break;
      if (action === "callSuit" && data.suit && suits.includes(data.suit) && data.suit !== state.forbiddenSuit) {
        state.trumpSuit = data.suit;
        beginPlaying(state);
      } else if (action === "pass" && seat !== state.dealer) {
        advanceCallSuit(state);
      } else if (action === "pass" && seat === state.dealer) {
        room.send(ws, { type: "invalidMove" });
        return;
      } else {
        break;
      }
      room.broadcast();
      return;
    }
    case "dealerDiscard": {
      if (seat !== state.dealer) break;
      if (action === "discard") {
        const cardIndex = Number.isInteger(data.cardIndex) ? data.cardIndex : -1;
        const hand = state.hands[state.dealer];
        if (cardIndex < 0 || cardIndex >= hand.length) {
          room.send(ws, { type: "invalidMove" });
          return;
        }
        if (state.pendingPickupCard) {
          const [discarded] = hand.splice(cardIndex, 1);
          state.kitty.push(discarded);
          hand.push(state.pendingPickupCard);
          state.pendingPickupCard = null;
        } else {
          const [card] = hand.splice(cardIndex, 1);
          state.kitty.push(card);
        }
        beginPlaying(state);
        room.broadcast();
        return;
      }
      break;
    }
    default:
      break;
  }
  room.send(ws, { type: "invalidMove" });
}

function serialize(room, seat) {
  const state = room.game;
  return {
    mode: "euchre",
    code: room.code,
    seat,
    dealer: state.dealer,
    phase: state.phase,
    orderRound: state.orderRound,
    currentDecision: state.currentDecision,
    trumpSuit: state.trumpSuit,
    forbiddenSuit: state.forbiddenSuit,
    turnCard: cloneCard(state.turnCard),
    currentPlayer: state.currentPlayer,
    leadSuit: state.leadSuit,
    trickNumber: state.trickNumber,
    tricksWon: state.tricksWon.slice(),
    scores: state.scores.slice(),
    hand: clonePile(state.hands[seat] || []),
    handCounts: state.hands.map((hand) => hand.length),
    currentTrick: state.currentTrick.map((play) => ({ player: play.player, card: cloneCard(play.card) })),
    completedTricks: state.completedTricks.map((trick) => trick.map((play) => ({ player: play.player, card: cloneCard(play.card) }))),
    availableActions: getAvailableActions(state, seat),
  };
}

function handleEuchrePlay(room, ws, data) {
  const seat = room.players.indexOf(ws);
  if (seat === -1) return;
  const cardIndex = Number.isInteger(data.cardIndex) ? data.cardIndex : -1;
  if (cardIndex < 0) return;

  const success = attemptPlayCard(room.game, seat, cardIndex);
  if (success) {
    room.broadcast();
  } else {
    room.send(ws, { type: "invalidMove" });
  }
}

export default {
  name: "euchre",
  createGame,
  serialize,
  handlers: {
    euchreDecision: (room, ws, data) => handleDecision(room, ws, data),
    euchrePlay: (room, ws, data) => handleEuchrePlay(room, ws, data),
  },
};
