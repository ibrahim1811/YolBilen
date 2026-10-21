export interface User {
  uid: string;
  displayName: string | null;
  email: string | null;
  photoURL: string | null;
  isGuest: boolean;
}

export interface Location {
  name: string;
  latitude: number;
  longitude: number;
}

export interface RouteStop {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
}

export type TransitMode = 'bus' | 'metro' | 'tram' | 'rail' | 'ferry';

export interface RouteStep {
  type: 'walk' | 'transit';
  durationMins: number;
  toStopName?: string;
  distanceMeters?: number;
  lineNumber?: string;
  mode?: TransitMode;
  boardStop?: { name: string; latitude: number; longitude: number };
  alightStop?: { name: string; latitude: number; longitude: number };
  intermediateStops?: Array<{ name: string; latitude: number; longitude: number }>;
  departureTime?: string;
  departureMins?: number;
  headsign?: string;
  dir?: 0 | 1;
  boardStopId?: string;
  isLive?: boolean;
}

export interface Route {
  id: string;
  lineNumber: string;
  lineName: string;
  mode?: TransitMode;
  estimatedDuration: number;
  transfers: Transfer[];
  nextArrival: number;
  crowdLevel: CrowdLevel;
  sunAnalysis?: SunAnalysis;
  boardingStop?: RouteStop;
  alightingStop?: RouteStop;
  steps?: RouteStep[];
  confidence?: number;
  hasIncompleteData?: boolean;
  confidenceDetail?: RouteConfidenceDetail;
  // Gece yarısından dakika (gece yarısını geçerse 1440+); tarifeye göre hesaplanır.
  departAtMins?: number;
  arriveAtMins?: number;
  isWalkOnly?: boolean;
  isNextDay?: boolean;
}

export interface RouteConfidenceDetail {
  score: number;
  hasLiveData: boolean;
  hasScheduleData: boolean;
  directionVerified: boolean;
  stopMatchQuality: 'high' | 'medium' | 'low';
  reasons: string[];
}

export interface Transfer {
  lineNumber: string;
  lineName: string;
  boardStop: RouteStop;
  alightStop: RouteStop;
  walkMins: number;
}

export type CrowdLevel = 'low' | 'medium' | 'high' | 'very_high';

export interface SunAnalysis {
  recommendedSide: 'left' | 'right';
  leftPercentage: number;
  rightPercentage: number;
  description: string;
}

export interface LineStats {
  lineNumber: string;
  totalFeedbacks: number;
  ac_good: number;
  ac_medium: number;
  ac_broken: number;
  comfort_comfortable: number;
  comfort_medium: number;
  comfort_uncomfortable: number;
  crowd_seated: number;
  crowd_standing: number;
  crowd_very_crowded: number;
  temp_cool: number;
  temp_normal: number;
  temp_hot: number;
  lastUpdated: Date;
}

export interface ComfortScore {
  lineNumber: string;
  totalFeedbacks: number;
  acScore: number;
  crowdScore: number;
  comfortScore: number;
  overall: number;
}

export type FavoriteType = 'home' | 'work' | 'school' | 'line' | 'custom';

export interface FavoriteLocation {
  id: string;
  userId: string;
  type: FavoriteType;
  label: string;
  location: Location;
  createdAt: Date;
}

export interface FavoriteLine {
  id: string;
  userId: string;
  lineNumber: string;
  lineName: string;
  createdAt: Date;
}

export interface Feedback {
  id?: string;
  userId: string;
  routeId: string;
  lineNumber: string;
  comfort: 'comfortable' | 'medium' | 'uncomfortable';
  ac: 'good' | 'medium' | 'broken';
  temperature: 'cool' | 'normal' | 'hot';
  crowd: 'seated' | 'standing' | 'very_crowded';
  timestamp: Date;
  busId?: string;
  plateNumber?: string;
  latitude?: number;
  longitude?: number;
}

export interface WeatherData {
  temperature: number;
  feelsLike: number;
  weatherCode: number;
  description: string;
  icon: string;
  isHot: boolean;
  isRainy: boolean;
}

export interface Stop {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  lines: string[];
}

export interface StopArrival {
  lineNumber: string;
  lineName: string;
  minutesAway: number;
  direction: string;
  isLive?: boolean;
  distanceM?: number;
}

export interface JourneyRecord {
  id?: string;
  userId: string;
  lineNumber: string;
  lineName: string;
  originName: string;
  destinationName: string;
  durationMins: number;
  distanceKm: number;
  timestamp: Date;
  dayOfWeek: number;
  hourOfDay: number;
}

export interface CommunityAlert {
  id?: string;
  userId: string;
  lineNumber: string;
  type: 'ac_broken' | 'traffic' | 'crowded' | 'breakdown' | 'delay';
  createdAt: Date;
  expiresAt: Date;
  upvotes: number;
  upvoters?: string[];
}

export type RouteFilterMode = 'fastest' | 'comfortable' | 'cool' | 'least_transfers' | 'night_safe';

export type RootStackParamList = {
  Onboarding: undefined;
  Login: undefined;
  Register: undefined;
  Main: undefined;
  RouteSearch: undefined;
  RouteResults: { origin: Location; destination: Location };
  SunAnalysis: { route: Route };
  LineDetail: { lineNumber: string; lineName: string };
  StopDetail: { stopId: string; stopName: string; latitude: number; longitude: number; lines?: string[] };
  RouteMap: { route: Route };
  JourneyNavigation: { route: Route };
  NearbyStops: undefined;
  JourneyHistory: undefined;
  AdminPanel: undefined;
  BusCard: { plate: string };
  RouteReplay: { route: Route };
};

export interface BusCard {
  plate: string;
  totalReports: number;
  climateScore: number;
  crowdScore: number;
  comfortScore: number;
  satisfactionScore: number;
  overallScore: number;
  updatedAt: Date;
}

export interface NotificationPrefs {
  busArrivals: boolean;
  lineAlerts: boolean;
}

export type TabParamList = {
  Home: undefined;
  Lines: undefined;
  Stops: undefined;
  Community: undefined;
  Games: undefined;
  Profile: undefined;
};

export type GameId = 'game2048' | 'flappy' | 'wordle' | 'tetris';

export type MissionMetric = 'playCount' | 'totalScore' | 'distinctGames' | 'journeyStarted';

export interface DailyMissionDef {
  id: string;
  label: string;
  target: number;
  metric: MissionMetric;
}

export interface DailyMissionState {
  date: string;
  missionIds: string[];
  progress: Record<string, number>;
  claimed: Record<string, boolean>;
}
