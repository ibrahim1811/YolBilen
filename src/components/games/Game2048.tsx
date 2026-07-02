import React from 'react';
import { View, StyleSheet, PanResponder, Dimensions } from 'react-native';
import { Text, useTheme } from 'react-native-paper';

const SIZE = 4;
const BOARD_WIDTH = Math.min(320, Dimensions.get('window').width - 64);
const CELL_GAP = 8;
const CELL_SIZE = (BOARD_WIDTH - CELL_GAP * (SIZE + 1)) / SIZE;

type Board = number[][];
type Direction = 'up' | 'down' | 'left' | 'right';

interface Props {
  onScoreUpdate: (score: number) => void;
  onGameOver: (finalScore: number) => void;
}

function emptyBoard(): Board {
  return Array.from({ length: SIZE }, () => Array(SIZE).fill(0));
}

function cloneBoard(board: Board): Board {
  return board.map((row) => [...row]);
}

function addRandomTile(board: Board): Board {
  const empties: [number, number][] = [];
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      if (board[r][c] === 0) empties.push([r, c]);
    }
  }
  if (empties.length === 0) return board;
  const [r, c] = empties[Math.floor(Math.random() * empties.length)];
  const next = cloneBoard(board);
  next[r][c] = Math.random() < 0.9 ? 2 : 4;
  return next;
}

function slideRow(row: number[]): { row: number[]; gained: number } {
  const values = row.filter((v) => v !== 0);
  const result: number[] = [];
  let gained = 0;
  for (let i = 0; i < values.length; i++) {
    if (values[i] === values[i + 1]) {
      const merged = values[i] * 2;
      result.push(merged);
      gained += merged;
      i++;
    } else {
      result.push(values[i]);
    }
  }
  while (result.length < SIZE) result.push(0);
  return { row: result, gained };
}

function rotateBoard(board: Board): Board {
  const next = emptyBoard();
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      next[c][SIZE - 1 - r] = board[r][c];
    }
  }
  return next;
}

function moveBoard(board: Board, direction: Direction): { board: Board; gained: number; moved: boolean } {
  let rotations = 0;
  if (direction === 'up') rotations = 3;
  if (direction === 'right') rotations = 2;
  if (direction === 'down') rotations = 1;

  let working = board;
  for (let i = 0; i < rotations; i++) working = rotateBoard(working);

  let gained = 0;
  const movedRows = working.map((row) => {
    const { row: newRow, gained: rowGain } = slideRow(row);
    gained += rowGain;
    return newRow;
  });

  let result = movedRows;
  for (let i = 0; i < (4 - rotations) % 4; i++) result = rotateBoard(result);

  const moved = JSON.stringify(result) !== JSON.stringify(board);
  return { board: result, gained, moved };
}

function canMove(board: Board): boolean {
  for (const dir of ['up', 'down', 'left', 'right'] as Direction[]) {
    if (moveBoard(board, dir).moved) return true;
  }
  return false;
}

function tileColor(value: number, theme: { colors: { primary: string } }): string {
  const colors: Record<number, string> = {
    2: '#eee4da',
    4: '#ede0c8',
    8: '#f2b179',
    16: '#f59563',
    32: '#f67c5f',
    64: '#f65e3b',
    128: '#edcf72',
    256: '#edcc61',
    512: '#edc850',
    1024: '#edc53f',
    2048: '#edc22e',
  };
  return colors[value] ?? theme.colors.primary;
}

export function Game2048({ onScoreUpdate, onGameOver }: Props) {
  const theme = useTheme();
  const [board, setBoard] = React.useState<Board>(() => addRandomTile(addRandomTile(emptyBoard())));
  const [score, setScore] = React.useState(0);
  const boardRef = React.useRef(board);
  boardRef.current = board;
  const overRef = React.useRef(false);

  const applyMove = React.useCallback(
    (direction: Direction) => {
      if (overRef.current) return;
      const { board: moved, gained, moved: didMove } = moveBoard(boardRef.current, direction);
      if (!didMove) return;
      const withTile = addRandomTile(moved);
      setBoard(withTile);
      setScore((s) => {
        const next = s + gained;
        onScoreUpdate(next);
        return next;
      });
      if (!canMove(withTile)) {
        overRef.current = true;
        setTimeout(() => onGameOver(score + gained), 300);
      }
    },
    [onGameOver, onScoreUpdate, score]
  );

  const panResponder = React.useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gesture) => Math.abs(gesture.dx) > 10 || Math.abs(gesture.dy) > 10,
      onPanResponderRelease: (_, gesture) => {
        const { dx, dy } = gesture;
        if (Math.abs(dx) > Math.abs(dy)) {
          applyMove(dx > 0 ? 'right' : 'left');
        } else {
          applyMove(dy > 0 ? 'down' : 'up');
        }
      },
    })
  ).current;

  return (
    <View style={styles.wrap}>
      <Text style={[styles.scoreText, { color: theme.colors.onSurface }]}>Skor: {score}</Text>
      <View
        {...panResponder.panHandlers}
        style={[styles.board, { width: BOARD_WIDTH, backgroundColor: theme.colors.surfaceVariant }]}
      >
        {board.map((row, r) => (
          <View key={r} style={styles.row}>
            {row.map((value, c) => (
              <View
                key={c}
                style={[
                  styles.cell,
                  {
                    width: CELL_SIZE,
                    height: CELL_SIZE,
                    backgroundColor: value === 0 ? 'rgba(0,0,0,0.06)' : tileColor(value, theme),
                  },
                ]}
              >
                {value !== 0 && (
                  <Text style={[styles.cellText, { fontSize: value >= 1024 ? 18 : 22 }]}>{value}</Text>
                )}
              </View>
            ))}
          </View>
        ))}
      </View>
      <Text style={[styles.hint, { color: theme.colors.onSurfaceVariant }]}>Kaydırarak birleştir</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', paddingVertical: 12, gap: 12 },
  scoreText: { fontSize: 18, fontWeight: '700' },
  board: { padding: CELL_GAP, borderRadius: 12, gap: CELL_GAP },
  row: { flexDirection: 'row', gap: CELL_GAP },
  cell: { borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  cellText: { fontWeight: '800', color: '#3c3a32' },
  hint: { fontSize: 12 },
});
