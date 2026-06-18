export interface IzmirStop {
  id: string;
  name: string;
  lat: number;
  lon: number;
}

type StopRoutes = Record<string, string[]>;

let _stops: IzmirStop[] | null = null;
let _stopRoutes: StopRoutes | null = null;
let _stopIndex: Map<string, IzmirStop> | null = null;
let _lineStopsIndex: Map<string, IzmirStop[]> | null = null;

export function getStops(): IzmirStop[] {
  if (!_stops) _stops = require('./izmir-stops.json') as IzmirStop[];
  return _stops;
}

export function getStopRoutes(): StopRoutes {
  if (!_stopRoutes) _stopRoutes = require('./izmir-stop-routes.json') as StopRoutes;
  return _stopRoutes;
}

export function getStopIndex(): Map<string, IzmirStop> {
  if (!_stopIndex) {
    _stopIndex = new Map();
    for (const s of getStops()) _stopIndex.set(s.id, s);
  }
  return _stopIndex;
}

export function getLineStopsIndex(): Map<string, IzmirStop[]> {
  if (!_lineStopsIndex) {
    _lineStopsIndex = new Map();
    const sr = getStopRoutes();
    for (const stop of getStops()) {
      const lines = sr[stop.id] ?? [];
      for (const line of lines) {
        if (!_lineStopsIndex.has(line)) _lineStopsIndex.set(line, []);
        _lineStopsIndex.get(line)!.push(stop);
      }
    }
  }
  return _lineStopsIndex;
}
