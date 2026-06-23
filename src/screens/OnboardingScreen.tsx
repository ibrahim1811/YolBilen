import React, { useRef, useState } from 'react';
import { View, StyleSheet, Dimensions, FlatList } from 'react-native';
import { Text, Button, useTheme } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../types';

type Props = NativeStackScreenProps<RootStackParamList, 'Onboarding'>;

const { width } = Dimensions.get('window');

const SLIDES = [
  {
    icon: 'bus' as const,
    title: 'İzmir\'de Kolay Ulaşım',
    desc: 'Binlerce ESHOT hattı, gerçek zamanlı araç konumları ve aktarmalı rota önerileri.',
    color: '#1A73E8',
  },
  {
    icon: 'white-balance-sunny' as const,
    title: 'Serin Tarafı Bul',
    desc: 'Güneş analizi ile otobüste hangi tarafın daha serin olduğunu öğren.',
    color: '#FF8F00',
  },
  {
    icon: 'account-group' as const,
    title: 'Topluluk Deneyimleri',
    desc: 'Otobüs konforunu değerlendir, diğer yolcuların yorumlarını gör.',
    color: '#34A853',
  },
];

export function OnboardingScreen({ navigation }: Props) {
  const theme = useTheme();
  const [index, setIndex] = useState(0);
  const listRef = useRef<FlatList>(null);

  async function finish() {
    await AsyncStorage.setItem('onboarding_done', '1');
    navigation.replace('Login');
  }

  function next() {
    if (index < SLIDES.length - 1) {
      listRef.current?.scrollToIndex({ index: index + 1 });
      setIndex(index + 1);
    } else {
      void finish();
    }
  }

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: theme.colors.background }]}>
      <FlatList
        ref={listRef}
        data={SLIDES}
        horizontal
        pagingEnabled
        scrollEnabled={false}
        showsHorizontalScrollIndicator={false}
        keyExtractor={(_, i) => String(i)}
        renderItem={({ item }) => (
          <View style={[styles.slide, { width }]}>
            <View style={[styles.iconWrap, { backgroundColor: item.color + '20' }]}>
              <MaterialCommunityIcons name={item.icon} size={72} color={item.color} />
            </View>
            <Text style={[styles.title, { color: theme.colors.onSurface }]}>{item.title}</Text>
            <Text style={[styles.desc, { color: theme.colors.onSurfaceVariant }]}>{item.desc}</Text>
          </View>
        )}
      />

      <View style={styles.dots}>
        {SLIDES.map((_, i) => (
          <View
            key={i}
            style={[styles.dot, { backgroundColor: i === index ? theme.colors.primary : theme.colors.outline }]}
          />
        ))}
      </View>

      <View style={styles.footer}>
        {index < SLIDES.length - 1 ? (
          <Button onPress={() => void finish()} textColor={theme.colors.onSurfaceVariant}>Atla</Button>
        ) : <View />}
        <Button mode="contained" onPress={next} style={styles.nextBtn}>
          {index === SLIDES.length - 1 ? 'Başla' : 'Devam'}
        </Button>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  slide: { alignItems: 'center', justifyContent: 'center', padding: 40, gap: 24 },
  iconWrap: { width: 140, height: 140, borderRadius: 70, justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: 26, fontWeight: '800', textAlign: 'center' },
  desc: { fontSize: 16, textAlign: 'center', lineHeight: 24 },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 8, marginBottom: 16 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  footer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 24 },
  nextBtn: { flex: 1, marginLeft: 8 },
});
