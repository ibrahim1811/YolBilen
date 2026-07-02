import React from 'react';
import { View, StyleSheet, TouchableOpacity, Dimensions } from 'react-native';
import { Text, useTheme } from 'react-native-paper';

const GRID_SIZE = 8;
const BOARD_WIDTH = Math.min(340, Dimensions.get('window').width - 40);
const CELL = Math.floor(BOARD_WIDTH / GRID_SIZE);
const TRAY_CELL = 18;

interface Props {
  onScoreUpdate: (score: number) => void;
  onGameOver: (finalScore: number) => void;
}

type Shape = [number, number][];

const SHAPE_POOL: Shape[] = [
  [[0, 0]],
  [[0, 0], [0, 1]],
  [[0, 0], [1, 0]],
  [[0, 0], [0, 1], [0, 2]],
  [[0, 0], [1, 0], [2, 0]],
  [[0, 0], [0, 1], [1, 0], [1, 1]],
  [[0, 0], [0, 1], [0, 2], [1, 0]],
  [[0, 0], [0, 1], [0, 2], [1, 2]],
  [[0, 0], [1, 0], [1, 1], [1, 2]],
  [[0, 2], [1, 0], [1, 1], [1, 2]],
  [[0, 0], [0, 1], [1, 1], [1, 2]],
  [[0, 1], [0, 2], [1, 0], [1, 1]],
  [[0, 0], [0, 1], [0, 2], [0, 3]],
  [[0, 0], [1, 0], [2, 0], [3, 0]],
  [[0, 0], [0, 1], [1, 0], [1, 1], [2, 0], [2, 1]],
];

function randomShape(): Shape {
  return SHAPE_POOL[Math.floor(Math.random() * SHAPE_POOL.length)];
}

function shapeSize(shape: Shape): { rows: number; cols: number } {
  const rows = Math.max(...shape.map(([r]) => r)) + 1;
  const cols = Math.max(...shape.map(([, c]) => c)) + 1;
  return { rows, cols };
}

function canPlaceAt(board: boolean[][], shape: Shape, row: number, col: number): boolean {
  return shape.every(([dr, dc]) => {
    const r = row + dr;
    const c = col + dc;
    if (r < 0 || r >= GRID_SIZE || c < 0 || c >= GRID_SIZE) return false;
    return !board[r][c];
  });
}

function canPlaceAnywhere(board: boolean[][], shape: Shape): boolean {
  for (let r = 0; r < GRID_SIZE; r++) {
    for (let c = 0; c < GRID_SIZE; c++) {
      if (canPlaceAt(board, shape, r, c)) return true;
    }
  }
  return false;
}

function emptyBoard(): boolean[][] {
  return Array.from({ length: GRID_SIZE }, () => Array(GRID_SIZE).fill(false));
}

export function GameBlockBlast({ onScoreUpdate, onGameOver }: Props) {
  const theme = useTheme();
  const [board, setBoard] = React.useState(emptyBoard);
  const [tray, setTray] = React.useState<(Shape | null)[]>(() => [randomShape(), randomShape(), randomShape()]);
  const [selected, setSelected] = React.useState<number | null>(null);
  const [score, setScore] = React.useState(0);
  const overRef = React.useRef(false);
  const scoreRef = React.useRef(0);

  const checkGameOver = React.useCallback((b: boolean[][], t: (Shape | null)[]) => {
    const active = t.filter((s): s is Shape => s !== null);
    if (active.length === 0) return false;
    const stuck = active.every((s) => !canPlaceAnywhere(b, s));
    if (stuck) {
      overRef.current = true;
      onGameOver(scoreRef.current);
    }
    return stuck;
  }, [onGameOver]);

  function handleSelect(idx: number) {
    if (overRef.current || !tray[idx]) return;
    setSelected(idx === selected ? null : idx);
  }

  function handlePlace(row: number, col: number) {
    if (overRef.current || selected === null) return;
    const shape = tray[selected];
    if (!shape || !canPlaceAt(board, shape, row, col)) return;

    const next = board.map((r) => [...r]);
    for (const [dr, dc] of shape) next[row + dr][col + dc] = true;

    let cleared = 0;
    const fullRows = next.map((r, i) => (r.every(Boolean) ? i : -1)).filter((i) => i >= 0);
    const fullCols = Array.from({ length: GRID_SIZE }, (_, c) => c).filter((c) => next.every((r) => r[c]));
    for (const r of fullRows) next[r] = Array(GRID_SIZE).fill(false);
    for (const c of fullCols) for (let r = 0; r < GRID_SIZE; r++) next[r][c] = false;
    cleared = fullRows.length + fullCols.length;

    const gained = shape.length * 10 + cleared * 50;
    const total = scoreRef.current + gained;
    scoreRef.current = total;
    setScore(total);
    onScoreUpdate(total);

    let nextTray = tray.map((s, i) => (i === selected ? null : s));
    if (nextTray.every((s) => s === null)) {
      nextTray = [randomShape(), randomShape(), randomShape()];
    }

    setBoard(next);
    setTray(nextTray);
    setSelected(null);
    checkGameOver(next, nextTray);
  }

  return (
    <View style={styles.wrap}>
      <View style={styles.scoreChip}>
        <Text style={styles.scoreText}>{score}</Text>
      </View>

      <View style={[styles.board, { width: GRID_SIZE * CELL, height: GRID_SIZE * CELL, backgroundColor: theme.colors.surfaceVariant }]}>
        {board.map((row, r) => (
          <View key={r} style={styles.row}>
            {row.map((filled, c) => (
              <TouchableOpacity
                key={c}
                activeOpacity={0.7}
                onPress={() => handlePlace(r, c)}
                style={[
                  styles.cell,
                  {
                    width: CELL,
                    height: CELL,
                    backgroundColor: filled ? '#5b8def' : 'rgba(0,0,0,0.05)',
                  },
                ]}
              />
            ))}
          </View>
        ))}
      </View>

      <Text style={[styles.hint, { color: theme.colors.onSurfaceVariant }]}>
        {selected !== null ? 'Yerleştirmek için tahtaya dokun' : 'Bir parça seç'}
      </Text>

      <View style={styles.tray}>
        {tray.map((shape, idx) => {
          if (!shape) return <View key={idx} style={styles.trayEmpty} />;
          const { rows, cols } = shapeSize(shape);
          const filled = new Set(shape.map(([r, c]) => `${r}_${c}`));
          return (
            <TouchableOpacity
              key={idx}
              onPress={() => handleSelect(idx)}
              style={[
                styles.trayItem,
                {
                  backgroundColor: selected === idx ? theme.colors.primaryContainer : theme.colors.surface,
                  borderColor: selected === idx ? theme.colors.primary : 'transparent',
                },
              ]}
            >
              {Array.from({ length: rows }).map((_, r) => (
                <View key={r} style={{ flexDirection: 'row' }}>
                  {Array.from({ length: cols }).map((_, c) => (
                    <View
                      key={c}
                      style={{
                        width: TRAY_CELL,
                        height: TRAY_CELL,
                        margin: 1,
                        borderRadius: 2,
                        backgroundColor: filled.has(`${r}_${c}`) ? '#5b8def' : 'transparent',
                      }}
                    />
                  ))}
                </View>
              ))}
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', paddingVertical: 8, gap: 10 },
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
  hint: { fontSize: 12 },
  tray: { flexDirection: 'row', gap: 12, alignItems: 'center', minHeight: 70 },
  trayItem: { padding: 6, borderRadius: 10, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  trayEmpty: { width: 70, height: 60 },
});
