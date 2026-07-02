import React from 'react';
import { View, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { Text, useTheme } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { pickRandomWord } from '../../constants/wordlePool';

const WORD_LENGTH = 5;
const MAX_ATTEMPTS = 6;

type LetterState = 'correct' | 'present' | 'absent' | 'empty';

interface Props {
  onScoreUpdate: (score: number) => void;
  onGameOver: (finalScore: number) => void;
}

const KEYBOARD_ROWS = [
  ['E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P', 'Ğ', 'Ü'],
  ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L', 'Ş', 'İ'],
  ['ENTER', 'Z', 'C', 'V', 'B', 'N', 'M', 'Ö', 'Ç', 'BACK'],
];

function evaluateGuess(guess: string, target: string): LetterState[] {
  const result: LetterState[] = Array(WORD_LENGTH).fill('absent');
  const targetChars = target.split('');
  const used = Array(WORD_LENGTH).fill(false);

  for (let i = 0; i < WORD_LENGTH; i++) {
    if (guess[i] === targetChars[i]) {
      result[i] = 'correct';
      used[i] = true;
    }
  }
  for (let i = 0; i < WORD_LENGTH; i++) {
    if (result[i] === 'correct') continue;
    const idx = targetChars.findIndex((c, j) => c === guess[i] && !used[j]);
    if (idx !== -1) {
      result[i] = 'present';
      used[idx] = true;
    }
  }
  return result;
}

export function GameWordle({ onScoreUpdate, onGameOver }: Props) {
  const theme = useTheme();
  const [target] = React.useState(() => pickRandomWord());
  const [guesses, setGuesses] = React.useState<string[]>([]);
  const [evaluations, setEvaluations] = React.useState<LetterState[][]>([]);
  const [current, setCurrent] = React.useState('');
  const [finished, setFinished] = React.useState(false);
  const [message, setMessage] = React.useState<string | null>(null);

  const keyStates = React.useMemo(() => {
    const map: Record<string, LetterState> = {};
    evaluations.forEach((evalRow, i) => {
      evalRow.forEach((state, j) => {
        const letter = guesses[i][j];
        const rank = { correct: 3, present: 2, absent: 1, empty: 0 };
        if (!map[letter] || rank[state] > rank[map[letter]]) map[letter] = state;
      });
    });
    return map;
  }, [evaluations, guesses]);

  function handleKey(key: string) {
    if (finished) return;
    if (key === 'BACK') {
      setCurrent((c) => c.slice(0, -1));
      return;
    }
    if (key === 'ENTER') {
      if (current.length !== WORD_LENGTH) {
        setMessage(`${WORD_LENGTH} harf gerekli`);
        return;
      }
      const evalResult = evaluateGuess(current, target);
      const nextGuesses = [...guesses, current];
      const nextEvals = [...evaluations, evalResult];
      setGuesses(nextGuesses);
      setEvaluations(nextEvals);
      setCurrent('');
      setMessage(null);

      const won = current === target;
      const attemptsUsed = nextGuesses.length;
      if (won) {
        const finalScore = Math.max(100, (MAX_ATTEMPTS - attemptsUsed + 1) * 100);
        setFinished(true);
        setMessage('Doğru bildin! 🎉');
        onScoreUpdate(finalScore);
        setTimeout(() => onGameOver(finalScore), 800);
      } else if (attemptsUsed >= MAX_ATTEMPTS) {
        setFinished(true);
        setMessage(`Kelime: ${target}`);
        onScoreUpdate(0);
        setTimeout(() => onGameOver(0), 1200);
      }
      return;
    }
    if (current.length < WORD_LENGTH) {
      setCurrent((c) => c + key);
    }
  }

  const cellColor = (state: LetterState) => {
    switch (state) {
      case 'correct': return '#6aaa64';
      case 'present': return '#c9b458';
      case 'absent': return '#787c7e';
      default: return theme.colors.surfaceVariant;
    }
  };

  const rows = Array.from({ length: MAX_ATTEMPTS }, (_, i) => {
    if (i < guesses.length) return { letters: guesses[i].split(''), states: evaluations[i] };
    if (i === guesses.length) {
      const letters = current.padEnd(WORD_LENGTH, ' ').split('');
      return { letters, states: Array(WORD_LENGTH).fill('empty') as LetterState[] };
    }
    return { letters: Array(WORD_LENGTH).fill(' '), states: Array(WORD_LENGTH).fill('empty') as LetterState[] };
  });

  return (
    <View style={styles.wrap}>
      <Text style={[styles.title, { color: theme.colors.onSurface }]}>{WORD_LENGTH} Harfli Kelime</Text>
      <View style={styles.grid}>
        {rows.map((row, i) => (
          <View key={i} style={styles.row}>
            {row.letters.map((letter, j) => (
              <View key={j} style={[styles.cell, { backgroundColor: cellColor(row.states[j]) }]}>
                <Text style={[styles.cellText, { color: row.states[j] === 'empty' ? theme.colors.onSurface : '#fff' }]}>
                  {letter.trim()}
                </Text>
              </View>
            ))}
          </View>
        ))}
      </View>
      {message && <Text style={[styles.message, { color: theme.colors.onSurface }]}>{message}</Text>}
      {!finished && (
        <View style={styles.keyboard}>
          {KEYBOARD_ROWS.map((row, i) => (
            <ScrollView key={i} horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.keyRow}>
              {row.map((key) => (
                <TouchableOpacity
                  key={key}
                  onPress={() => handleKey(key)}
                  style={[
                    styles.key,
                    key.length > 1 && styles.wideKey,
                    { backgroundColor: keyStates[key] ? cellColor(keyStates[key]) : theme.colors.surfaceVariant },
                  ]}
                >
                  {key === 'BACK' ? (
                    <MaterialCommunityIcons name="backspace-outline" size={18} color={theme.colors.onSurface} />
                  ) : (
                    <Text style={[styles.keyText, { color: keyStates[key] ? '#fff' : theme.colors.onSurface }]}>
                      {key === 'ENTER' ? 'GİR' : key}
                    </Text>
                  )}
                </TouchableOpacity>
              ))}
            </ScrollView>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', paddingVertical: 12, gap: 12 },
  title: { fontSize: 16, fontWeight: '700' },
  grid: { gap: 6 },
  row: { flexDirection: 'row', gap: 6 },
  cell: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 6 },
  cellText: { fontSize: 18, fontWeight: '800', color: '#fff' },
  message: { fontSize: 14, fontWeight: '600' },
  keyboard: { gap: 6, width: '100%' },
  keyRow: { gap: 4, paddingHorizontal: 8, justifyContent: 'center' },
  key: { minWidth: 30, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 6, paddingHorizontal: 6 },
  wideKey: { minWidth: 50 },
  keyText: { fontSize: 13, fontWeight: '700' },
});
