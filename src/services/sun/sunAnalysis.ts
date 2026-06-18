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

export function getMockSunAnalysis(): SunAnalysis {
  return analyzeSunExposure({
    from: { name: 'Başlangıç', latitude: 38.4192, longitude: 27.1287 },
    to: { name: 'Varış', latitude: 38.4560, longitude: 27.1150 },
    departureTime: new Date(),
  });
}
