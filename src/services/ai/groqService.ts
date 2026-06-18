import type { Route, WeatherData, ComfortScore } from '../../types';

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_MODEL = 'llama-3.1-8b-instant';

const CROWD_MAP: Record<string, string> = {
  low: 'az yoğun',
  medium: 'orta yoğun',
  high: 'yoğun',
  very_high: 'çok yoğun',
};

function buildPrompt(
  route: Route,
  weather?: WeatherData | null,
  comfort?: ComfortScore | null
): string {
  const lines: string[] = [
    `Hat: ${route.lineNumber} (${route.lineName})`,
    `Tahmini süre: ${route.estimatedDuration} dakika`,
    `Sonraki geliş: ${route.nextArrival} dakika sonra`,
    `Yoğunluk: ${CROWD_MAP[route.crowdLevel] ?? route.crowdLevel}`,
  ];

  if (weather) {
    lines.push(`Hava: ${weather.description}, ${weather.temperature}°C (hissedilen ${weather.feelsLike}°C)`);
    if (weather.isHot) lines.push('Uyarı: Hava çok sıcak.');
    if (weather.isRainy) lines.push('Uyarı: Yağış var.');
  }

  if (comfort) {
    lines.push(`Konfor skoru: ${comfort.overall.toFixed(1)}/10`);
    lines.push(`Klima skoru: ${comfort.acScore.toFixed(1)}/10`);
    lines.push(`Kalabalık skoru: ${comfort.crowdScore.toFixed(1)}/10`);
  }

  if (route.sunAnalysis) {
    const side = route.sunAnalysis.recommendedSide === 'left' ? 'sol' : 'sağ';
    lines.push(`Güneş analizi: ${side} taraf daha serin (sol %${route.sunAnalysis.leftPercentage} / sağ %${route.sunAnalysis.rightPercentage} güneş)`);
  }

  return `Sen YolBilen uygulamasının akıllı toplu taşıma asistanısın.
Aşağıdaki yolculuk verilerine göre kullanıcıya kısa, samimi ve pratik bir Türkçe özet yaz.
Özet 2-3 cümle olsun. Kullanıcıya nereye oturması gerektiğini, ne beklemesi gerektiğini söyle.
Sadece özeti yaz, başlık veya ek açıklama ekleme.

Yolculuk Verileri:
${lines.join('\n')}`;
}

export async function generateTravelSummary(
  route: Route,
  weather?: WeatherData | null,
  comfort?: ComfortScore | null
): Promise<string> {
  const apiKey = process.env.EXPO_PUBLIC_GROQ_API_KEY;
  if (!apiKey || apiKey === 'your_groq_api_key_here') {
    throw new Error('GROQ_API_KEY eksik');
  }

  const res = await fetch(GROQ_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      messages: [{ role: 'user', content: buildPrompt(route, weather, comfort) }],
      max_tokens: 200,
      temperature: 0.7,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Groq API hatası: ${res.status} — ${err}`);
  }

  const data = await res.json();
  return data.choices?.[0]?.message?.content?.trim() ?? '';
}
