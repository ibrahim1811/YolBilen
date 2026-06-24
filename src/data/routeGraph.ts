import { getOrderedStopsForDir, getAllLines, getStopIndex } from './gtfsData';

export interface GraphEdge {
  toStopId: string;
  lineNum: string;
  dir: 0 | 1;
  travelCost: number;     // tahmini dakika (mesafe bazlı)
  distanceMeters: number; // gerçek duraklar arası mesafe
}

export type RouteGraph = Map<string, GraphEdge[]>;

const BUS_SPEED_KMH = 22;
const FALLBACK_STOP_DIST_M = 500;

function haversineM(
  a: { lat: number; lon: number },
  b: { lat: number; lon: number }
): number {
  const R = 6371000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLon = ((b.lon - a.lon) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) *
    Math.cos((b.lat * Math.PI) / 180) *
    Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.asin(Math.sqrt(s));
}

let _graph: RouteGraph | null = null;

export function getGraph(): RouteGraph {
  if (_graph) return _graph;
  _graph = new Map();
  const lines = getAllLines();
  const stopIdx = getStopIndex();

  for (const { lineNum } of lines) {
    for (const dir of [0, 1] as (0 | 1)[]) {
      const stops = getOrderedStopsForDir(lineNum, dir);
      for (let i = 0; i < stops.length - 1; i++) {
        const from = stops[i];
        const to = stops[i + 1];
        const distanceMeters = Math.round(
          haversineM(
            stopIdx.get(from.id) ?? { lat: from.lat, lon: from.lon },
            stopIdx.get(to.id)   ?? { lat: to.lat,   lon: to.lon   }
          )
        ) || FALLBACK_STOP_DIST_M;
        const travelCost = Math.max(1, Math.round((distanceMeters / 1000 / BUS_SPEED_KMH) * 60));
        if (!_graph.has(from.id)) _graph.set(from.id, []);
        _graph.get(from.id)!.push({ toStopId: to.id, lineNum, dir, travelCost, distanceMeters });
      }
    }
  }
  return _graph;
}

export function getNeighbors(stopId: string): GraphEdge[] {
  return getGraph().get(stopId) ?? [];
}

export function getGraphStats(): { nodes: number; edges: number } {
  const g = getGraph();
  let edges = 0;
  g.forEach(v => { edges += v.length; });
  return { nodes: g.size, edges };
}
