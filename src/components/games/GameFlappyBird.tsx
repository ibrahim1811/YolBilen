import React from 'react';
import { View, StyleSheet, Pressable, Dimensions, Animated } from 'react-native';
import { Text, Button, useTheme } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useAppStore } from '../../store/useAppStore';

const GAME_WIDTH = Math.min(380, Dimensions.get('window').width - 32);
const GAME_HEIGHT = Math.min(520, Dimensions.get('window').height * 0.6);
const BIRD_SIZE = 34;
const BIRD_X = 60;
const GRAVITY = 1400;
const JUMP_VELOCITY = -430;
const PIPE_WIDTH = 60;
const PIPE_CAP_HEIGHT = 18;
const PIPE_CAP_OVERHANG = 6;
const PIPE_GAP = 170;
const PIPE_SPEED = 130;
const PIPE_INTERVAL_MS = 1400;
const GROUND_HEIGHT = 20;
const CLOUDS = [
  { top: 40, left: 0.12, size: 46 },
  { top: 90, left: 0.55, size: 34 },
  { top: 160, left: 0.78, size: 52 },
];

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

type Phase = 'ready' | 'playing' | 'dead';

export function GameFlappyBird({ onScoreUpdate, onGameOver }: Props) {
  const theme = useTheme();
  const highScore = useAppStore((s) => s.highScores.flappy);
  const [score, setScore] = React.useState(0);
  const [phase, setPhase] = React.useState<Phase>('ready');
  const birdY = React.useRef(new Animated.Value(GAME_HEIGHT / 2)).current;
  const birdRotation = React.useRef(new Animated.Value(0)).current;
  const birdYValue = React.useRef(GAME_HEIGHT / 2);
  const velocityRef = React.useRef(0);
  const pipesRef = React.useRef<Pipe[]>([]);
  const [, forceRender] = React.useState(0);
  const lastPipeAtRef = React.useRef(0);
  const scoreRef = React.useRef(0);
  const rafRef = React.useRef<number | null>(null);
  const lastTsRef = React.useRef<number | null>(null);
  const idCounter = React.useRef(0);
  const phaseRef = React.useRef<Phase>('ready');
  phaseRef.current = phase;

  React.useEffect(() => {
    const listenerId = birdY.addListener(({ value }) => {
      birdYValue.current = value;
    });
    return () => birdY.removeListener(listenerId);
  }, [birdY]);

  const endGame = React.useCallback(() => {
    if (phaseRef.current !== 'playing') return;
    setPhase('dead');
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    onGameOver(scoreRef.current);
  }, [onGameOver]);

  React.useEffect(() => {
    if (phase !== 'playing') return;
    function loop(ts: number) {
      if (phaseRef.current !== 'playing') return;
      const last = lastTsRef.current ?? ts;
      const dt = Math.min(0.05, (ts - last) / 1000);
      lastTsRef.current = ts;

      velocityRef.current += GRAVITY * dt;
      const nextY = birdYValue.current + velocityRef.current * dt;
      birdY.setValue(nextY);
      birdRotation.setValue(Math.max(-30, Math.min(70, velocityRef.current / 6)));

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

    lastTsRef.current = null;
    rafRef.current = requestAnimationFrame(loop);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  function handlePress() {
    if (phase === 'dead') return;
    if (phase === 'ready') setPhase('playing');
    velocityRef.current = JUMP_VELOCITY;
  }

  function handleRestart() {
    pipesRef.current = [];
    idCounter.current = 0;
    lastPipeAtRef.current = 0;
    scoreRef.current = 0;
    setScore(0);
    onScoreUpdate(0);
    velocityRef.current = 0;
    birdYValue.current = GAME_HEIGHT / 2;
    birdY.setValue(GAME_HEIGHT / 2);
    birdRotation.setValue(0);
    forceRender((n) => n + 1);
    setPhase('ready');
  }

  return (
    <View style={styles.wrap}>
      <View style={styles.scoreChip}>
        <MaterialCommunityIcons name="star-four-points" size={16} color="#ffb703" />
        <Text style={styles.scoreText}>{score}</Text>
      </View>
      <Pressable onPress={handlePress}>
        <View style={[styles.field, { width: GAME_WIDTH, height: GAME_HEIGHT }]}>
          {CLOUDS.map((cloud, i) => (
            <View
              key={i}
              style={[
                styles.cloud,
                { top: cloud.top, left: GAME_WIDTH * cloud.left, width: cloud.size, height: cloud.size * 0.6 },
              ]}
            />
          ))}

          {pipesRef.current.map((pipe) => (
            <React.Fragment key={pipe.id}>
              <View style={[styles.pipeBody, { left: pipe.x, top: 0, height: pipe.gapY, width: PIPE_WIDTH }]} />
              <View
                style={[
                  styles.pipeCap,
                  { left: pipe.x - PIPE_CAP_OVERHANG, top: pipe.gapY - PIPE_CAP_HEIGHT, width: PIPE_WIDTH + PIPE_CAP_OVERHANG * 2 },
                ]}
              />
              <View
                style={[
                  styles.pipeBody,
                  {
                    left: pipe.x,
                    top: pipe.gapY + PIPE_GAP,
                    height: GAME_HEIGHT - pipe.gapY - PIPE_GAP,
                    width: PIPE_WIDTH,
                  },
                ]}
              />
              <View
                style={[
                  styles.pipeCap,
                  { left: pipe.x - PIPE_CAP_OVERHANG, top: pipe.gapY + PIPE_GAP, width: PIPE_WIDTH + PIPE_CAP_OVERHANG * 2 },
                ]}
              />
            </React.Fragment>
          ))}

          <View style={styles.ground} />

          <Animated.View
            style={[
              styles.bird,
              {
                left: BIRD_X,
                transform: [
                  { translateY: birdY },
                  {
                    rotate: birdRotation.interpolate({
                      inputRange: [-30, 70],
                      outputRange: ['-30deg', '70deg'],
                    }),
                  },
                ],
              },
            ]}
          >
            <MaterialCommunityIcons name="bird" size={BIRD_SIZE} color="#ffb703" />
          </Animated.View>

          {phase === 'ready' && (
            <View style={styles.overlay} pointerEvents="none">
              <MaterialCommunityIcons name="gesture-tap" size={40} color="#fff" />
              <Text style={styles.overlayTitle}>Başlamak için dokun</Text>
            </View>
          )}

          {phase === 'dead' && (
            <View style={styles.overlay}>
              <MaterialCommunityIcons name="emoticon-dead-outline" size={44} color="#fff" />
              <Text style={styles.overlayTitle}>Oyun Bitti</Text>
              <Text style={styles.overlayScore}>Skor: {score}</Text>
              <Text style={styles.overlayHighScore}>En yüksek: {Math.max(highScore, score)}</Text>
              <Button
                mode="contained"
                onPress={handleRestart}
                style={styles.replayBtn}
                buttonColor="#ffb703"
                textColor="#1a1a1a"
              >
                Tekrar Oyna
              </Button>
            </View>
          )}
        </View>
      </Pressable>
      <Text style={[styles.hint, { color: theme.colors.onSurfaceVariant }]}>
        {phase === 'playing' ? 'Ekrana dokunarak zıpla' : ' '}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', paddingVertical: 12, gap: 12 },
  scoreChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(0,0,0,0.75)',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
  },
  scoreText: { fontSize: 18, fontWeight: '800', color: '#fff' },
  field: { borderRadius: 16, overflow: 'hidden', position: 'relative', backgroundColor: '#7ec8e3' },
  cloud: { position: 'absolute', borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.55)' },
  pipeBody: { position: 'absolute', backgroundColor: '#4cb35c', borderLeftWidth: 3, borderRightWidth: 3, borderColor: '#2f7d3d' },
  pipeCap: {
    position: 'absolute',
    height: PIPE_CAP_HEIGHT,
    borderRadius: 4,
    backgroundColor: '#5fcb70',
    borderWidth: 3,
    borderColor: '#2f7d3d',
  },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  overlayTitle: { fontSize: 20, fontWeight: '800', color: '#fff' },
  overlayScore: { fontSize: 15, fontWeight: '700', color: '#fff' },
  overlayHighScore: { fontSize: 13, fontWeight: '500', color: '#e0e0e0', marginBottom: 8 },
  replayBtn: { borderRadius: 10, marginTop: 4 },
  ground: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: GROUND_HEIGHT,
    backgroundColor: '#deb887',
    borderTopWidth: 3,
    borderTopColor: '#8b6b3d',
  },
  bird: { position: 'absolute', width: BIRD_SIZE, height: BIRD_SIZE, alignItems: 'center', justifyContent: 'center' },
  hint: { fontSize: 12 },
});
