import SunCalc from 'suncalc';
import type { SunAnalysis, Location } from '../../types';

interface RouteSegment {
  from: Location;
  to: Location;
  departureTime: Date;
}

function getBearing(from: Location, to: Location): number {
  const lat1 = (from.latitude * Math.PI) / 180;
  const lat2 = (to.latitude * Math.PI) / 180;
  const dLon = ((to.longitude - from.longitude) * Math.PI) / 180;

  const y = Math.sin(dLon) * Math.cos(lat2);
  const x =
    Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);

  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

function getSunRelativeAngle(
  sunAzimuth: number,
  routeBearing: number
): { side: 'left' | 'right'; intensity: number } {
  let relative = ((sunAzimuth - routeBearing + 360) % 360);

  if (relative > 180) {
    relative = 360 - relative;
    return { side: 'left', intensity: Math.cos((relative * Math.PI) / 180) };
  }
  return { side: 'right', intensity: Math.cos((relative * Math.PI) / 180) };
}

export function analyzeSunExposure(segment: RouteSegment): SunAnalysis {
  const midLat = (segment.from.latitude + segment.to.latitude) / 2;
  const midLon = (segment.from.longitude + segment.to.longitude) / 2;

  const sunPos = SunCalc.getPosition(segment.departureTime, midLat, midLon);
  const sunAzimuth = ((sunPos.azimuth * 180) / Math.PI + 180) % 360;

  const bearing = getBearing(segment.from, segment.to);
  const { side, intensity } = getSunRelativeAngle(sunAzimuth, bearing);

  const rightPct = side === 'right' ? Math.round(50 + intensity * 50) : Math.round(50 - intensity * 50);
  const leftPct = 100 - rightPct;

  const recommendedSide = rightPct > leftPct ? 'left' : 'right';

  return {
    recommendedSide,
    leftPercentage: leftPct,
    rightPercentage: rightPct,
    description:
      recommendedSide === 'left'
        ? '☀️ Sağ taraf daha fazla güneş alıyor.\n🌤️ Sol taraf daha serin.'
        : '☀️ Sol taraf daha fazla güneş alıyor.\n🌤️ Sağ taraf daha serin.',
  };
}

// Gerçek güzergah boyunca ağırlıklı ortalama yön ile güneş analizi
export function analyzeSunExposureAlongRoute(
  waypoints: Array<{ latitude: number; longitude: number }>,
  departureTime: Date,
  avgSpeedKmh = 22
): SunAnalysis | null {
  if (waypoints.length < 2) return null;

  function segDistKm(
    a: { latitude: number; longitude: number },
    b: { latitude: number; longitude: number }
  ): number {
    const R = 6371;
    const dLat = ((b.latitude - a.latitude) * Math.PI) / 180;
    const dLon = ((b.longitude - a.longitude) * Math.PI) / 180;
    const s =
      Math.sin(dLat / 2) ** 2 +
      Math.cos((a.latitude * Math.PI) / 180) *
      Math.cos((b.latitude * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.asin(Math.sqrt(s));
  }

  let rightWeightedSum = 0;
  let totalWeight = 0;
  let elapsedHours = 0;

  for (let i = 0; i < waypoints.length - 1; i++) {
    const a = waypoints[i];
    const b = waypoints[i + 1];
    const distKm = segDistKm(a, b);
    if (distKm < 0.001) continue;

    const segTime = new Date(departureTime.getTime() + elapsedHours * 3600000);
    elapsedHours += distKm / avgSpeedKmh;

    const midLat = (a.latitude + b.latitude) / 2;
    const midLon = (a.longitude + b.longitude) / 2;
    const sunPos = SunCalc.getPosition(segTime, midLat, midLon);

    if (sunPos.altitude <= 0) continue;

    const sunAzimuth = ((sunPos.azimuth * 180) / Math.PI + 180) % 360;
    const bearing = getBearing(
      { name: '', latitude: a.latitude, longitude: a.longitude },
      { name: '', latitude: b.latitude, longitude: b.longitude }
    );
    const { side, intensity } = getSunRelativeAngle(sunAzimuth, bearing);

    const weight = distKm * Math.sin(sunPos.altitude);
    const rightPct = side === 'right' ? 50 + intensity * 50 : 50 - intensity * 50;

    rightWeightedSum += rightPct * weight;
    totalWeight += weight;
  }

  // Güneş yolculuk boyunca ufkun altında: gösterilecek bir taraf yok
  if (totalWeight === 0) return null;

  const rightPct = Math.round(rightWeightedSum / totalWeight);
  const leftPct = 100 - rightPct;
  const recommendedSide = rightPct > leftPct ? 'left' : 'right';

  return {
    recommendedSide,
    leftPercentage: leftPct,
    rightPercentage: rightPct,
    description:
      recommendedSide === 'left'
        ? '☀️ Sağ taraf daha fazla güneş alıyor.\n🌤️ Sol taraf daha serin.'
        : '☀️ Sol taraf daha fazla güneş alıyor.\n🌤️ Sağ taraf daha serin.',
  };
}

export function getMockSunAnalysis(): SunAnalysis {
  return analyzeSunExposure({
    from: { name: 'Başlangıç', latitude: 38.4192, longitude: 27.1287 },
    to: { name: 'Varış', latitude: 38.4560, longitude: 27.1150 },
    departureTime: new Date(),
  });
}
