const RANK_ORDER = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];

export function getRankValue(rank) {
  const index = RANK_ORDER.indexOf(rank);
  return index === -1 ? 0 : index + 1;
}

export function getCardColor(card) {
  if (!card) return "#000";
  return (card.suit === "♥" || card.suit === "♦") ? "#e22" : "#000";
}

export function drawCard(ctx, card, x, y, width = 80, height = 110) {
  ctx.save();
  ctx.translate(x, y);
  ctx.strokeStyle = "#000";
  ctx.lineWidth = 2;
  ctx.fillStyle = "#fff";
  ctx.strokeRect(0, 0, width, height);
  ctx.fillRect(0, 0, width, height);

  if (!card || card.faceUp === false) {
    ctx.fillStyle = "#006";
    ctx.fillRect(0, 0, width, height);
    ctx.restore();
    return;
  }

  const valueColor = getCardColor(card);
  ctx.fillStyle = valueColor;

  const cornerFontSize = Math.round(height * 0.18);
  ctx.font = `${cornerFontSize}px serif`;
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  const cornerPadX = Math.max(4, Math.round(width * 0.05));
  const cornerPadY = Math.max(4, Math.round(height * 0.05));
  ctx.fillText(`${card.rank}${card.suit}`, cornerPadX, cornerPadY);

  ctx.textAlign = "right";
  ctx.textBaseline = "bottom";
  ctx.fillText(`${card.rank}${card.suit}`, width - cornerPadX, height - cornerPadY);

  const faceRanks = new Set(["J", "Q", "K", "A"]);
  if (faceRanks.has(card.rank)) {
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    if (card.rank === "A") {
      const aceFont = Math.round(height * 0.58);
      ctx.font = `${aceFont}px serif`;
      ctx.fillText(card.suit, width / 2, height / 2 + 4);
    } else {
      const rankFont = Math.round(height * 0.52);
      ctx.font = `${rankFont}px serif`;
      ctx.fillText(card.rank, width / 2, height / 2);
    }
    ctx.restore();
    return;
  }

  const pipCount = getRankValue(card.rank);
  const maxCols = pipCount >= 7 ? 3 : pipCount >= 4 ? 2 : 1;
  const cols = Math.min(maxCols, pipCount);
  const rows = Math.ceil(pipCount / cols);
  const marginX = width * 0.3;
  const marginY = height * 0.36;
  const innerWidth = width - marginX * 2;
  const innerHeight = height - marginY * 2;
  const pipSize = Math.max(16, Math.round(height * 0.18));
  ctx.font = `${pipSize}px serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const rowSpacing = rows === 1 ? 0 : innerHeight / (rows - 1);

  let remaining = pipCount;
  for (let row = 0; row < rows; row += 1) {
    const countThisRow = Math.min(cols, remaining);
    remaining -= countThisRow;
    const totalWidth = countThisRow === 1 ? 0 : innerWidth;
    const centerY = rows === 1 ? height / 2 : marginY + rowSpacing * row;
    for (let col = 0; col < countThisRow; col += 1) {
      let offset = 0;
      if (countThisRow > 1) {
        offset = (-totalWidth / 2) + (col * (innerWidth / (countThisRow - 1)));
      }
      const cx = width / 2 + offset;
      ctx.fillText(card.suit, cx, centerY);
    }
  }

  ctx.restore();
}
