import React from 'react';
import { View, StyleSheet, Dimensions } from 'react-native';
import { Text, IconButton, useTheme } from 'react-native-paper';

const COLS = 10;
const ROWS = 18;
const CELL = Math.min(28, Math.floor((Dimensions.get('window').width - 32) / COLS));
const DROP_MS_START = 800;
const DROP_MS_MIN = 200;

interface Props {
  onScoreUpdate: (score: number) => void;
  onGameOver: (finalScore: number) => void;
}

type PieceType = 'I' | 'O' | 'T' | 'S' | 'Z' | 'J' | 'L';

const PIECE_COLORS: Record<PieceType, string> = {
  I: '#4dd0e1',
  O: '#ffd54f',
  T: '#ba68c8',
  S: '#81c784',
  Z: '#e57373',
  J: '#64b5f6',
  L: '#ffb74d',
};

// Her parça için 4 dönüş durumu, 4x4 kutu içindeki [r,c] hücreleri
const SHAPES: Record<PieceType, number[][][]> = {
  I: [
    [[1, 0], [1, 1], [1, 2], [1, 3]],
    [[0, 2], [1, 2], [2, 2], [3, 2]],
    [[2, 0], [2, 1], [2, 2], [2, 3]],
    [[0, 1], [1, 1], [2, 1], [3, 1]],
  ],
  O: [
    [[0, 1], [0, 2], [1, 1], [1, 2]],
    [[0, 1], [0, 2], [1, 1], [1, 2]],
    [[0, 1], [0, 2], [1, 1], [1, 2]],
    [[0, 1], [0, 2], [1, 1], [1, 2]],
  ],
  T: [
    [[0, 1], [1, 0], [1, 1], [1, 2]],
    [[0, 1], [1, 1], [1, 2], [2, 1]],
    [[1, 0], [1, 1], [1, 2], [2, 1]],
    [[0, 1], [1, 0], [1, 1], [2, 1]],
  ],
  S: [
    [[0, 1], [0, 2], [1, 0], [1, 1]],
    [[0, 1], [1, 1], [1, 2], [2, 2]],
    [[1, 1], [1, 2], [2, 0], [2, 1]],
    [[0, 0], [1, 0], [1, 1], [2, 1]],
  ],
  Z: [
    [[0, 0], [0, 1], [1, 1], [1, 2]],
    [[0, 2], [1, 1], [1, 2], [2, 1]],
    [[1, 0], [1, 1], [2, 1], [2, 2]],
    [[0, 1], [1, 0], [1, 1], [2, 0]],
  ],
  J: [
    [[0, 0], [1, 0], [1, 1], [1, 2]],
    [[0, 1], [0, 2], [1, 1], [2, 1]],
    [[1, 0], [1, 1], [1, 2], [2, 2]],
    [[0, 1], [1, 1], [2, 0], [2, 1]],
  ],
  L: [
    [[0, 2], [1, 0], [1, 1], [1, 2]],
    [[0, 1], [1, 1], [2, 1], [2, 2]],
    [[1, 0], [1, 1], [1, 2], [2, 0]],
    [[0, 0], [0, 1], [1, 1], [2, 1]],
  ],
};

const PIECE_TYPES: PieceType[] = ['I', 'O', 'T', 'S', 'Z', 'J', 'L'];

function randomPiece(): PieceType {
  return PIECE_TYPES[Math.floor(Math.random() * PIECE_TYPES.length)];
}

interface ActivePiece {
  type: PieceType;
  rotation: number;
  row: number;
  col: number;
}

function emptyBoard(): (PieceType | null)[][] {
  return Array.from({ length: ROWS }, () => Array(COLS).fill(null));
}

function cells(piece: ActivePiece): [number, number][] {
  return SHAPES[piece.type][piece.rotation].map(([r, c]) => [piece.row + r, piece.col + c]);
}

function canPlace(board: (PieceType | null)[][], piece: ActivePiece): boolean {
  return cells(piece).every(([r, c]) => {
    if (c < 0 || c >= COLS || r >= ROWS) return false;
    if (r < 0) return true;
    return board[r][c] === null;
  });
}

function lockPiece(board: (PieceType | null)[][], piece: ActivePiece): (PieceType | null)[][] {
  const next = board.map((row) => [...row]);
  for (const [r, c] of cells(piece)) {
    if (r >= 0) next[r][c] = piece.type;
  }
  return next;
}

function clearLines(board: (PieceType | null)[][]): { board: (PieceType | null)[][]; cleared: number } {
  const remaining = board.filter((row) => row.some((cell) => cell === null));
  const cleared = ROWS - remaining.length;
  const newRows = Array.from({ length: cleared }, () => Array(COLS).fill(null));
  return { board: [...newRows, ...remaining], cleared };
}

function spawnPiece(type: PieceType): ActivePiece {
  return { type, rotation: 0, row: -1, col: 3 };
}

const LINE_SCORES = [0, 100, 300, 500, 800];

export function GameTetris({ onScoreUpdate, onGameOver }: Props) {
  const theme = useTheme();
  const [board, setBoard] = React.useState(emptyBoard);
  const [piece, setPiece] = React.useState<ActivePiece>(() => spawnPiece(randomPiece()));
  const [nextType, setNextType] = React.useState<PieceType>(randomPiece);
  const [score, setScore] = React.useState(0);
  const [lines, setLines] = React.useState(0);
  const boardRef = React.useRef(board);
  boardRef.current = board;
  const pieceRef = React.useRef(piece);
  pieceRef.current = piece;
  const overRef = React.useRef(false);
  const scoreRef = React.useRef(0);

  const dropMs = Math.max(DROP_MS_MIN, DROP_MS_START - lines * 30);

  const endGame = React.useCallback(() => {
    if (overRef.current) return;
    overRef.current = true;
    onGameOver(scoreRef.current);
  }, [onGameOver]);

  const spawnNext = React.useCallback(() => {
    const type = nextType;
    const fresh = spawnPiece(type);
    if (!canPlace(boardRef.current, fresh)) {
      endGame();
      return;
    }
    setPiece(fresh);
    setNextType(randomPiece());
  }, [nextType, endGame]);

  const lockAndContinue = React.useCallback(() => {
    const locked = lockPiece(boardRef.current, pieceRef.current);
    const { board: cleared, cleared: n } = clearLines(locked);
    setBoard(cleared);
    if (n > 0) {
      setLines((l) => l + n);
      const gained = LINE_SCORES[n] ?? 0;
      const next = scoreRef.current + gained;
      scoreRef.current = next;
      setScore(next);
      onScoreUpdate(next);
    }
    spawnNext();
  }, [onScoreUpdate, spawnNext]);

  const tryMove = React.useCallback((dr: number, dc: number) => {
    if (overRef.current) return false;
    const moved = { ...pieceRef.current, row: pieceRef.current.row + dr, col: pieceRef.current.col + dc };
    if (canPlace(boardRef.current, moved)) {
      setPiece(moved);
      return true;
    }
    return false;
  }, []);

  const softDrop = React.useCallback(() => {
    if (!tryMove(1, 0)) {
      if (!overRef.current) lockAndContinue();
    }
  }, [tryMove, lockAndContinue]);

  const rotate = React.useCallback(() => {
    if (overRef.current) return;
    const cur = pieceRef.current;
    const rotated = { ...cur, rotation: (cur.rotation + 1) % 4 };
    if (canPlace(boardRef.current, rotated)) {
      setPiece(rotated);
    }
  }, []);

  const hardDrop = React.useCallback(() => {
    if (overRef.current) return;
    let cur = pieceRef.current;
    while (canPlace(boardRef.current, { ...cur, row: cur.row + 1 })) {
      cur = { ...cur, row: cur.row + 1 };
    }
    setPiece(cur);
    pieceRef.current = cur;
    lockAndContinue();
  }, [lockAndContinue]);

  React.useEffect(() => {
    if (overRef.current) return;
    const interval = setInterval(softDrop, dropMs);
    return () => clearInterval(interval);
  }, [softDrop, dropMs]);

  const displayBoard = React.useMemo(() => {
    const g = board.map((row) => [...row]);
    for (const [r, c] of cells(piece)) {
      if (r >= 0 && r < ROWS && c >= 0 && c < COLS) g[r][c] = piece.type;
    }
    return g;
  }, [board, piece]);

  return (
    <View style={styles.wrap}>
      <View style={styles.scoreChip}>
        <Text style={styles.scoreText}>{score} · {lines} satır</Text>
      </View>

      <View style={[styles.board, { width: COLS * CELL, height: ROWS * CELL, backgroundColor: theme.colors.surfaceVariant }]}>
        {displayBoard.map((row, r) => (
          <View key={r} style={styles.row}>
            {row.map((cell, c) => (
              <View
                key={c}
                style={[
                  styles.cell,
                  {
                    width: CELL,
                    height: CELL,
                    backgroundColor: cell ? PIECE_COLORS[cell] : 'rgba(0,0,0,0.05)',
                  },
                ]}
              />
            ))}
          </View>
        ))}
      </View>

      <View style={styles.controls}>
        <IconButton mode="contained-tonal" icon="chevron-left" size={26} onPress={() => tryMove(0, -1)} />
        <IconButton mode="contained-tonal" icon="rotate-right" size={26} onPress={rotate} />
        <IconButton mode="contained-tonal" icon="chevron-down" size={26} onPress={softDrop} />
        <IconButton mode="contained-tonal" icon="chevron-double-down" size={26} onPress={hardDrop} />
        <IconButton mode="contained-tonal" icon="chevron-right" size={26} onPress={() => tryMove(0, 1)} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', paddingVertical: 8, gap: 8 },
  scoreChip: {
    backgroundColor: 'rgba(0,0,0,0.75)',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
  },
  scoreText: { fontSize: 15, fontWeight: '800', color: '#fff' },
  board: { borderRadius: 10, overflow: 'hidden' },
  row: { flexDirection: 'row' },
  cell: { borderWidth: 0.5, borderColor: 'rgba(0,0,0,0.06)' },
  controls: { flexDirection: 'row', alignItems: 'center', gap: 2, marginTop: 4 },
});
