import SCHEDULES from './schedules.json';

type ServiceType = 'weekday' | 'saturday' | 'sunday';
type Dir = '0' | '1';

const data = SCHEDULES as Record<string, Partial<Record<ServiceType, Partial<Record<Dir, number[]>>>>>;

export function getSchedule(lineNumber: string, serviceType: ServiceType = 'weekday'): { dir0: number[]; dir1: number[] } {
  const line = data[lineNumber] ?? data[lineNumber.replace(/^0+/, '')];
  if (!line) return { dir0: [], dir1: [] };
  const svc = line[serviceType] ?? line['weekday'] ?? {};
  return {
    dir0: svc['0'] ?? [],
    dir1: svc['1'] ?? [],
  };
}

export function hasSchedule(lineNumber: string): boolean {
  return !!(data[lineNumber] ?? data[lineNumber.replace(/^0+/, '')]);
}
