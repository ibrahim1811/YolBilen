import { getStops, getLinesNearOrigin, getStopIndex } from '../../data/gtfsData';
import { getGraph } from '../../data/routeGraph';
import { nearestIztekStopId } from '../iztek/iztekService';

let _warmedUp = false;

export function warmupRouting(): void {
  if (_warmedUp) return;
  _warmedUp = true;
  setTimeout(() => {
    try {
      getStops();
      getStopIndex();
      getLinesNearOrigin({ lat: 38.4189, lon: 27.1287 }, 0.1);
      nearestIztekStopId(38.4189, 27.1287);
      getGraph();
    } catch {}
  }, 2000);
}
