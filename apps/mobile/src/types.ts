// Response shapes from apps/api (kept in step with the API's DTOs; api.test.ts checks a fixture).
export type Phase = "live" | "developing" | "unlocked";

export interface Me {
  id: string;
  name: string;
  hue: number;
  city: string | null;
  cityOptIn: boolean;
  gender: string;
  funLine: string | null;
  nightModePref: "auto" | "always" | "never";
  tz: string;
  ageVerified: boolean;
  is21: boolean;
  codeOfConductAccepted: boolean;
  isDemo: boolean;
  nightMode: boolean;
  liveNight: { id: string; crewId: string | null; title: string | null } | null;
  unreadNotifications: number;
  pendingTags: number;
  pendingDeferred: number;
  now: string;
  mode: "mock" | "prod";
}

export interface Member {
  id: string;
  name: string;
  hue: number;
  role: string;
  city: string | null;
}

export interface AlbumSummary {
  id: string;
  title: string | null;
  venue: string | null;
  startedAt: string;
  phase: Phase;
  unlockAt: string;
  people: number;
  coverUrl: string | null;
  isDemo: boolean;
}

export interface Crew {
  id: string;
  name: string;
  emoji: string;
  kind: "local" | "long_distance";
  tz: string;
  myRole: "owner" | "member";
  moment: { weekday: number; hour: number; minute: number; durationMinutes: number; label: string };
  reunion: { label: string; at: string } | null;
  members: Member[];
  liveNight: {
    id: string;
    title: string | null;
    startedBy: string | null;
    startedAt: string;
    joined: boolean;
    people: number;
  } | null;
  albums: AlbumSummary[];
  isDemo: boolean;
}

export interface Shot {
  id: string;
  authorId: string;
  takenAt: string;
  url: string;
  width: number | null;
  height: number | null;
  mine: boolean;
  status: string;
  hiddenFromOthers: boolean;
  reactions: Record<string, number>;
  myReaction: string | null;
  tags: { userId: string; status: string }[];
}

export interface Participant {
  id: string;
  name: string;
  hue: number;
  ready: boolean;
  shots: number;
  via: string;
}

export interface Night {
  id: string;
  kind: "night" | "moment" | "city";
  crew: { id: string; name: string; emoji: string } | null;
  title: string | null;
  venue: string | null;
  tz: string;
  phase: Phase;
  startedAt: string;
  startedBy: string | null;
  autoEndAt: string;
  unlockAt: string;
  earliestUnlockAt: string;
  endedAt: string | null;
  unlockedAt: string | null;
  unlockReason: string | null;
  unlockAtLabel: string;
  earliestUnlockLabel: string;
  code: string | null;
  rollSize: number;
  me: {
    isParticipant: boolean;
    ready: boolean;
    canEnd: boolean;
    shotsTaken: number;
    shotsLeft: number;
    canMarkReady: boolean;
    readyCountsFrom: string | null;
  };
  participants: Participant[];
  total: number;
  shots: Shot[];
  pendingTagsForMe: { shotId: string; taggerId: string }[];
  isDemo: boolean;
}

export interface Notification {
  id: string;
  kind: string;
  payload: Record<string, unknown>;
  createdAt: string;
  read: boolean;
}

export interface CityEvent {
  id: string;
  city: string;
  title: string;
  theme: string;
  venue: string;
  area: string | null;
  startsAt: string;
  revealAt: string;
  tableMin: number;
  tableMax: number;
  signedUp: boolean;
  count: number;
  revealed: boolean;
  waitlisted: boolean;
  table: {
    id: string;
    label: string;
    nightId: string | null;
    people: {
      id: string;
      name: string;
      hue: number;
      funLine: string | null;
      me: boolean;
      keepInTouch: boolean | null;
    }[];
  } | null;
  isDemo: boolean;
}

export interface Recaps {
  onThisNight: {
    nightId: string;
    title: string | null;
    yearsAgo: number;
    startedAt: string;
    coverUrl: string | null;
  }[];
  thisMonth: {
    nights: number;
    photos: number;
    people: number;
    cities: string[];
    label: string;
    topShotUrl: string | null;
  };
  lastMonth: {
    nights: number;
    photos: number;
    people: number;
    cities: string[];
    label: string;
    topShotUrl: string | null;
  };
}
