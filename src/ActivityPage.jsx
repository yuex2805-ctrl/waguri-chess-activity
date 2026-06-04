import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import html2canvas from "html2canvas";
import { Chess } from "chess.js";
import { initDiscordSdk } from "./discordSdk.js";

const DEFAULT_FEN = new Chess().fen();

const PIECES = {
  wp: "♙",
  wn: "♘",
  wb: "♗",
  wr: "♖",
  wq: "♕",
  wk: "♔",
  bp: "♟",
  bn: "♞",
  bb: "♝",
  br: "♜",
  bq: "♛",
  bk: "♚"
};

function squareName(row, col) {
  const file = "abcdefgh"[col];
  const rank = 8 - row;
  return `${file}${rank}`;
}

function formatMoves(sanMoves) {
  if (!sanMoves.length) return "No moves yet.";

  const pairs = [];

  for (let i = 0; i < sanMoves.length; i += 2) {
    const moveNo = Math.floor(i / 2) + 1;
    const white = sanMoves[i] ?? "";
    const black = sanMoves[i + 1] ?? "";

    pairs.push(`${moveNo}. ${white}${black ? ` ${black}` : ""}`);
  }

  return pairs.join("  ");
}

function buildGameFromMoves(moves, startFen = DEFAULT_FEN) {
  const replayGame = new Chess(startFen);

  for (const san of moves) {
    replayGame.move(san);
  }

  return replayGame;
}

export default function ActivityPage() {
  const [initialFen, setInitialFen] = useState(DEFAULT_FEN);
  const [sanMoves, setSanMoves] = useState([]);
  const [currentPly, setCurrentPly] = useState(0);
  const [selected, setSelected] = useState(null);
  const [pendingPromotion, setPendingPromotion] = useState(null);
  const [isFlipped, setIsFlipped] = useState(false);
  const [status, setStatus] = useState("Loading Discord SDK...");

  const boardRef = useRef(null);

  const game = useMemo(() => {
    return buildGameFromMoves(sanMoves.slice(0, currentPly), initialFen);
  }, [sanMoves, currentPly, initialFen]);

  const fen = game.fen();
  const board = game.board();

  const displayBoard = useMemo(() => {
    const normalBoard = board.map((row, rowIndex) =>
      row.map((piece, colIndex) => ({
        piece,
        square: squareName(rowIndex, colIndex),
        dark: (rowIndex + colIndex) % 2 === 1
      }))
    );

    if (!isFlipped) return normalBoard;

    return [...normalBoard].reverse().map((row) => [...row].reverse());
  }, [board, isFlipped]);

  const legalTargets = useMemo(() => {
    if (!selected) return new Set();

    return new Set(
      game.moves({ square: selected, verbose: true }).map((move) => move.to)
    );
  }, [game, selected]);

  const isBoardLocked =
    game.isCheckmate() ||
    game.isStalemate() ||
    game.isThreefoldRepetition() ||
    game.isInsufficientMaterial() ||
    game.isDraw();

  useEffect(() => {
    let alive = true;

    initDiscordSdk().then((result) => {
      if (!alive) return;
      setStatus(result.message);
    });

    return () => {
      alive = false;
    };
  }, []);

  function getGameStateText() {
    const sideToMove = game.turn() === "w" ? "White" : "Black";
    const winner = game.turn() === "w" ? "Black" : "White";

    if (game.isCheckmate()) {
      return `${winner} wins by checkmate.`;
    }

    if (game.isStalemate()) {
      return "Draw by stalemate.";
    }

    if (game.isThreefoldRepetition()) {
      return "Draw by threefold repetition.";
    }

    if (game.isInsufficientMaterial()) {
      return "Draw by insufficient material.";
    }

    if (game.isDraw()) {
      return "Draw by 50-move rule or another draw rule.";
    }

    if (game.isCheck()) {
      return `${sideToMove} to move — check.`;
    }

    return `${sideToMove} to move.`;
  }

  function isPromotionMove(from, to) {
    const piece = game.get(from);

    if (!piece || piece.type !== "p") return false;

    return game
      .moves({ square: from, verbose: true })
      .some(
        (move) =>
          move.to === to && (move.promotion || move.flags?.includes("p"))
      );
  }

  function makeMove(from, to) {
    if (isBoardLocked || pendingPromotion) return false;

    if (isPromotionMove(from, to)) {
      setPendingPromotion({ from, to });
      setSelected(null);
      return true;
    }

    return completeMove(from, to);
  }

  function completeMove(from, to, promotion) {
    try {
      const nextGame = buildGameFromMoves(
        sanMoves.slice(0, currentPly),
        initialFen
      );

      const moveData = { from, to };

      if (promotion) {
        moveData.promotion = promotion;
      }

      const move = nextGame.move(moveData);

      if (!move) return false;

      const nextMoves = [...sanMoves.slice(0, currentPly), move.san];

      setSanMoves(nextMoves);
      setCurrentPly(nextMoves.length);
      setSelected(null);
      setPendingPromotion(null);

      return true;
    } catch {
      return false;
    }
  }

  function handleSquareClick(square, piece) {
    if (isBoardLocked || pendingPromotion) return;

    if (!selected) {
      if (piece && piece.color === game.turn()) {
        setSelected(square);
      }

      return;
    }

    if (selected === square) {
      setSelected(null);
      return;
    }

    const moved = makeMove(selected, square);

    if (moved) return;

    if (piece && piece.color === game.turn()) {
      setSelected(square);
    } else {
      setSelected(null);
    }
  }

  function choosePromotion(piece) {
    if (!pendingPromotion) return;

    completeMove(pendingPromotion.from, pendingPromotion.to, piece);
  }

  function cancelPromotion() {
    setPendingPromotion(null);
    setSelected(null);
  }

  function handleDragStart(event, square, piece) {
    if (
      isBoardLocked ||
      pendingPromotion ||
      !piece ||
      piece.color !== game.turn()
    ) {
      event.preventDefault();
      return;
    }

    setSelected(square);
    event.dataTransfer.setData("text/plain", square);
    event.dataTransfer.effectAllowed = "move";
  }

  function handleDragOver(event) {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  }

  function handleDrop(event, targetSquare) {
    event.preventDefault();

    if (isBoardLocked || pendingPromotion) return;

    const fromSquare = event.dataTransfer.getData("text/plain");

    if (!fromSquare) return;

    const moved = makeMove(fromSquare, targetSquare);

    if (!moved) {
      setSelected(null);
    }
  }

  function handleDragEnd() {
    setSelected(null);
  }

  function resetBoard() {
    setInitialFen(DEFAULT_FEN);
    setSanMoves([]);
    setCurrentPly(0);
    setSelected(null);
    setPendingPromotion(null);
    setStatus("Board reset.");
  }

  function undoMove() {
    if (!sanMoves.length) return;

    const nextMoves = sanMoves.slice(0, -1);

    setSanMoves(nextMoves);
    setCurrentPly((oldPly) => Math.min(oldPly, nextMoves.length));
    setSelected(null);
    setPendingPromotion(null);
  }

  function goToStart() {
    setCurrentPly(0);
    setSelected(null);
    setPendingPromotion(null);
  }

  function goBack() {
    setCurrentPly((oldPly) => Math.max(0, oldPly - 1));
    setSelected(null);
    setPendingPromotion(null);
  }

  function goForward() {
    setCurrentPly((oldPly) => Math.min(sanMoves.length, oldPly + 1));
    setSelected(null);
    setPendingPromotion(null);
  }

  function goToEnd() {
    setCurrentPly(sanMoves.length);
    setSelected(null);
    setPendingPromotion(null);
  }

  async function exportPgn() {
    const fullGame = buildGameFromMoves(sanMoves, initialFen);
    const pgn = fullGame.pgn();

    if (!pgn) {
      setStatus("No PGN to export.");
      return;
    }

    try {
      await navigator.clipboard.writeText(pgn);
      setStatus("PGN copied to clipboard.");
    } catch {
      window.prompt("Copy PGN:", pgn);
    }
  }

  function importPgn() {
    const text = window.prompt("Paste PGN here:");

    if (!text) return;

    try {
      const importedGame = new Chess();
      importedGame.loadPgn(text.trim());

      const importedMoves = importedGame.history();

      setInitialFen(DEFAULT_FEN);
      setSanMoves(importedMoves);
      setCurrentPly(importedMoves.length);
      setSelected(null);
      setPendingPromotion(null);
      setStatus("PGN imported.");
    } catch {
      setStatus("Invalid PGN.");
    }
  }

  function importFen() {
    const text = window.prompt("Paste FEN here:");

    if (!text) return;

    try {
      const importedGame = new Chess(text.trim());

      setInitialFen(importedGame.fen());
      setSanMoves([]);
      setCurrentPly(0);
      setSelected(null);
      setPendingPromotion(null);
      setStatus("FEN imported.");
    } catch {
      setStatus("Invalid FEN.");
    }
  }

  async function exportBoardPng() {
    if (!boardRef.current) return;

    try {
      const canvas = await html2canvas(boardRef.current, {
        backgroundColor: null,
        scale: 2
      });

      const link = document.createElement("a");

      link.download = `waguri-board-${Date.now()}.png`;
      link.href = canvas.toDataURL("image/png");
      link.click();

      setStatus("Board PNG exported.");
    } catch {
      setStatus("Could not export PNG.");
    }
  }

  return (
    <main className="app-shell">
      {pendingPromotion && (
        <div className="promotion-backdrop">
          <div className="promotion-card">
            <h3>Choose promotion</h3>

            <div className="promotion-options">
              <button onClick={() => choosePromotion("q")}>♕ Queen</button>
              <button onClick={() => choosePromotion("r")}>♖ Rook</button>
              <button onClick={() => choosePromotion("b")}>♗ Bishop</button>
              <button onClick={() => choosePromotion("n")}>♘ Knight</button>
            </div>

            <button className="promotion-cancel" onClick={cancelPromotion}>
              Cancel
            </button>
          </div>
        </div>
      )}

     <section className="hero-card">
  <div className="hero-top">
    <div>
      <p className="eyebrow">Waguri Chess Lab</p>
      <h1>Discord Chess Activity MVP</h1>
      <p className="subtitle">
        Click or drag a piece. Legal moves only — powered by chess.js.
      </p>
    </div>

  <Link to="/" className="home-button icon-home" aria-label="Go to home" title="Home">
  🏠
</Link>
  </div>
</section>

      <section className="layout">
        <div className="board-wrap">
          <div ref={boardRef} className="board" aria-label="Chess board">
            {displayBoard.map((row) =>
              row.map(({ piece, square, dark }) => {
                const pieceKey = piece ? `${piece.color}${piece.type}` : null;
                const isSelected = selected === square;
                const isLegal = legalTargets.has(square);

                return (
                  <button
                    key={square}
                    className={`square ${dark ? "dark" : "light"} ${
                      isSelected ? "selected" : ""
                    } ${isLegal ? "legal" : ""} ${
                      isLegal && piece ? "capture" : ""
                    } ${isBoardLocked ? "locked" : ""}`}
                    onClick={() => handleSquareClick(square, piece)}
                    draggable={Boolean(
                      !isBoardLocked &&
                        !pendingPromotion &&
                        piece &&
                        piece.color === game.turn()
                    )}
                    onDragStart={(event) =>
                      handleDragStart(event, square, piece)
                    }
                    onDragOver={handleDragOver}
                    onDrop={(event) => handleDrop(event, square)}
                    onDragEnd={handleDragEnd}
                    disabled={isBoardLocked}
                    title={square}
                  >
                    <span className="coord">{square}</span>
                    <span className="piece">
                      {pieceKey ? PIECES[pieceKey] : ""}
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </div>

        <aside className="panel">
          <div className="status-box">
            <h2>{getGameStateText()}</h2>
            <p>{status}</p>
          </div>

          <div className="button-row">
            <button onClick={() => setIsFlipped((value) => !value)}>
              Flip
            </button>

            <button onClick={undoMove} disabled={!sanMoves.length}>
              Undo
            </button>

            <button onClick={resetBoard}>Reset</button>
          </div>

          <div className="button-row">
            <button onClick={goToStart} disabled={currentPly === 0}>
              ⏮
            </button>

            <button onClick={goBack} disabled={currentPly === 0}>
              ◀
            </button>

            <button
              onClick={goForward}
              disabled={currentPly === sanMoves.length}
            >
              ▶
            </button>

            <button
              onClick={goToEnd}
              disabled={currentPly === sanMoves.length}
            >
              ⏭
            </button>
          </div>

          <div className="button-row">
            <button onClick={exportPgn} disabled={!sanMoves.length}>
              Copy PGN
            </button>

            <button onClick={importPgn}>Import PGN</button>

            <button onClick={importFen}>Import FEN</button>

            <button onClick={exportBoardPng}>Export PNG</button>
          </div>

          <div className="info-box">
            <h3>FEN</h3>
            <code>{fen}</code>
          </div>

          <div className="info-box">
            <h3>Moves</h3>

            <p className="move-counter">
              Viewing move {currentPly} / {sanMoves.length}
            </p>

            <p className="moves">{formatMoves(sanMoves)}</p>
          </div>
        </aside>
      </section>
    </main>
  );
}