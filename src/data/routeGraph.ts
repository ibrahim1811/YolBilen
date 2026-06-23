import { getOrderedStopsForDir, getAllLines } from './gtfsData';

export interface GraphEdge {
  toStopId: string;
  lineNum: string;
  dir: 0 | 1;
  travelCost: number; // tahmini dakika
}

export type RouteGraph = Map<string, GraphEdge[]>;

const MINS_PER_STOP = 1.5;

let _graph: RouteGraph | null = null;

export function getGraph(): RouteGraph {
  if (_graph) return _graph;
  _graph = new Map();
  const lines = getAllLines();

  for (const { lineNum } of lines) {
    for (const dir of [0, 1] as (0 | 1)[]) {
      const stops = getOrderedStopsForDir(lineNum, dir);
      for (let i = 0; i < stops.length - 1; i++) {
        const from = stops[i];
        const to = stops[i + 1];
        if (!_graph.has(from.id)) _graph.set(from.id, []);
        _graph.get(from.id)!.push({ toStopId: to.id, lineNum, dir, travelCost: MINS_PER_STOP });
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
