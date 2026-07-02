import React from 'react';
import { View, StyleSheet, Pressable, Dimensions, Animated } from 'react-native';
import { Text, useTheme } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';

const GAME_WIDTH = Math.min(340, Dimensions.get('window').width - 48);
const GAME_HEIGHT = 420;
const BIRD_SIZE = 32;
const BIRD_X = 60;
const GRAVITY = 1400;
const JUMP_VELOCITY = -430;
const PIPE_WIDTH = 60;
const PIPE_GAP = 160;
const PIPE_SPEED = 130;
const PIPE_INTERVAL_MS = 1400;

interface Pipe {
  id: number;
  x: number;
  gapY: number;
  passed: boolean;
}

interface Props {
  onScoreUpdate: (score: number) => void;
  onGameOver: (finalScore: number) => void;
}

export function GameFlappyBird({ onScoreUpdate, onGameOver }: Props) {
  const theme = useTheme();
  const [score, setScore] = React.useState(0);
  const [running, setRunning] = React.useState(true);
  const birdY = React.useRef(new Animated.Value(GAME_HEIGHT / 2)).current;
  const birdYValue = React.useRef(GAME_HEIGHT / 2);
  const velocityRef = React.useRef(0);
  const pipesRef = React.useRef<Pipe[]>([]);
  const [, forceRender] = React.useState(0);
  const lastPipeAtRef = React.useRef(0);
  const scoreRef = React.useRef(0);
  const rafRef = React.useRef<number | null>(null);
  const lastTsRef = React.useRef<number | null>(null);
  const idCounter = React.useRef(0);

  React.useEffect(() => {
    const listenerId = birdY.addListener(({ value }) => {
      birdYValue.current = value;
    });
    return () => birdY.removeListener(listenerId);
  }, [birdY]);

  const endGame = React.useCallback(() => {
    if (!running) return;
    setRunning(false);
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    onGameOver(scoreRef.current);
  }, [onGameOver, running]);

  React.useEffect(() => {
    function loop(ts: number) {
      if (!running) return;
      const last = lastTsRef.current ?? ts;
      const dt = Math.min(0.05, (ts - last) / 1000);
      lastTsRef.current = ts;

      velocityRef.current += GRAVITY * dt;
      const nextY = birdYValue.current + velocityRef.current * dt;
      birdY.setValue(nextY);

      if (nextY < 0 || nextY > GAME_HEIGHT - BIRD_SIZE) {
        endGame();
        return;
      }

      if (ts - lastPipeAtRef.current > PIPE_INTERVAL_MS) {
        lastPipeAtRef.current = ts;
        idCounter.current += 1;
        const gapY = 60 + Math.random() * (GAME_HEIGHT - PIPE_GAP - 120);
        pipesRef.current = [...pipesRef.current, { id: idCounter.current, x: GAME_WIDTH, gapY, passed: false }];
      }

      pipesRef.current = pipesRef.current
        .map((p) => ({ ...p, x: p.x - PIPE_SPEED * dt }))
        .filter((p) => p.x > -PIPE_WIDTH);

      for (const pipe of pipesRef.current) {
        const birdLeft = BIRD_X;
        const birdRight = BIRD_X + BIRD_SIZE;
        const birdTop = nextY;
        const birdBottom = nextY + BIRD_SIZE;
        const pipeLeft = pipe.x;
        const pipeRight = pipe.x + PIPE_WIDTH;
        const overlapsX = birdRight > pipeLeft && birdLeft < pipeRight;
        if (overlapsX) {
          const inGap = birdTop > pipe.gapY && birdBottom < pipe.gapY + PIPE_GAP;
          if (!inGap) {
            endGame();
            return;
          }
        }
        if (!pipe.passed && pipe.x + PIPE_WIDTH < birdLeft) {
          pipe.passed = true;
          scoreRef.current += 1;
          setScore(scoreRef.current);
          onScoreUpdate(scoreRef.current);
        }
      }

      forceRender((n) => n + 1);
      rafRef.current = requestAnimationFrame(loop);
    }

    rafRef.current = requestAnimationFrame(loop);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running]);

  function handleJump() {
    if (!running) return;
    velocityRef.current = JUMP_VELOCITY;
  }

  return (
    <View style={styles.wrap}>
      <Text style={[styles.scoreText, { color: theme.colors.onSurface }]}>Skor: {score}</Text>
      <Pressable onPress={handleJump}>
        <View style={[styles.field, { width: GAME_WIDTH, height: GAME_HEIGHT, backgroundColor: '#bfe6f5' }]}>
          {pipesRef.current.map((pipe) => (
            <React.Fragment key={pipe.id}>
              <View
                style={[
                  styles.pipe,
                  { left: pipe.x, top: 0, height: pipe.gapY, width: PIPE_WIDTH, backgroundColor: '#3fa34d' },
                ]}
              />
              <View
                style={[
                  styles.pipe,
                  {
                    left: pipe.x,
                    top: pipe.gapY + PIPE_GAP,
                    height: GAME_HEIGHT - pipe.gapY - PIPE_GAP,
                    width: PIPE_WIDTH,
                    backgroundColor: '#3fa34d',
                  },
                ]}
              />
            </React.Fragment>
          ))}
          <Animated.View style={[styles.bird, { left: BIRD_X, transform: [{ translateY: birdY }] }]}>
            <MaterialCommunityIcons name="bird" size={BIRD_SIZE} color="#ffb703" />
          </Animated.View>
        </View>
      </Pressable>
      <Text style={[styles.hint, { color: theme.colors.onSurfaceVariant }]}>Ekrana dokunarak zıpla</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', paddingVertical: 12, gap: 12 },
  scoreText: { fontSize: 18, fontWeight: '700' },
  field: { borderRadius: 12, overflow: 'hidden', position: 'relative' },
  pipe: { position: 'absolute', borderRadius: 4 },
  bird: { position: 'absolute', width: BIRD_SIZE, height: BIRD_SIZE },
  hint: { fontSize: 12 },
});
