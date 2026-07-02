import { storage } from '@/src/utils/storage';

const BASE = process.env.EXPO_PUBLIC_BACKEND_URL as string;
const TOKEN_KEY = 'creator_ai_token';

async function getToken(): Promise<string | null> {
  const v = await storage.getItem<string | null>(TOKEN_KEY, null);
  return typeof v === 'string' ? v : null;
}

export async function setToken(t: string | null) {
  if (t) await storage.setItem(TOKEN_KEY, t);
  else await storage.removeItem(TOKEN_KEY);
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = await getToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(init.headers as Record<string, string> | undefined),
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${BASE}/api${path}`, { ...init, headers });
  const text = await res.text();
  let body: any = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  if (!res.ok) {
    const msg = (body && body.detail) || `HTTP ${res.status}`;
    throw new Error(typeof msg === 'string' ? msg : JSON.stringify(msg));
  }
  return body as T;
}

// ---- types ----
export type User = {
  id: string;
  email: string;
  name: string;
  niche?: string | null;
  goals: string[];
  onboarded: boolean;
  created_at: string;
};

export type AuthResp = { token: string; user: User };

export type Content = {
  id: string;
  ideas: string[];
  script: string;
  voiceover_text: string;
  thumbnail_idea: string;
  caption: string;
  hashtags: string[];
  viral_score: number;
  viral_reasoning: string;
  niche: string;
  duration: string;
  language: string;
  tone: string;
  created_at: string;
  saved: boolean;
  scheduled_at?: string | null;
  voiceover_ready?: boolean;
  voiceover_voice?: string | null;
  video_ready?: boolean;
  thumbnail_ready?: boolean;
  thumbnail_tone?: string | null;
};

export type ThumbnailResp = {
  id: string;
  image_url: string;
  prompt_used: string;
};

export type VoiceoverResp = {
  id: string;
  audio_base64: string;
  voice: string;
  duration_hint: string;
};

export type VideoResp = { id: string; video_url: string };

export type Stats = {
  total_generated: number;
  total_scheduled: number;
  current_streak: number;
  best_streak: number;
  week_counts: number[];
};

// ---- auth ----
export const api = {
  signup: (email: string, password: string, name: string) =>
    request<AuthResp>('/auth/signup', {
      method: 'POST',
      body: JSON.stringify({ email, password, name }),
    }),
  login: (email: string, password: string) =>
    request<AuthResp>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),
  me: () => request<User>('/auth/me'),
  onboarding: (niche: string, goals: string[]) =>
    request<User>('/auth/onboarding', {
      method: 'POST',
      body: JSON.stringify({ niche, goals }),
    }),

  // content
  generate: (payload: {
    niche: string;
    target_audience?: string;
    tone: string;
    duration: string;
    language: string;
    topic?: string;
  }) =>
    request<Content>('/content/generate', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  listContent: () => request<Content[]>('/content/list'),
  getContent: (id: string) => request<Content>(`/content/${id}`),
  deleteContent: (id: string) =>
    request<{ ok: boolean }>(`/content/${id}`, { method: 'DELETE' }),

  // voiceover + video + thumbnail
  voiceover: (id: string, voice = 'nova', speed = 1.0) =>
    request<VoiceoverResp>(`/content/${id}/voiceover`, {
      method: 'POST',
      body: JSON.stringify({ voice, speed }),
    }),
  video: (id: string) =>
    request<VideoResp>(`/content/${id}/video`, { method: 'POST' }),
  thumbnail: (id: string, style?: string) =>
    request<ThumbnailResp>(`/content/${id}/thumbnail`, {
      method: 'POST',
      body: JSON.stringify({ style: style ?? null }),
    }),

  // batch
  batch: (payload: {
    seed_idea: string; niche: string; tone: string;
    duration: string; language: string; count: number;
  }) =>
    request<Content[]>('/content/batch', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  // schedule
  schedule: (content_id: string, scheduled_at: string) =>
    request<Content>('/schedule', {
      method: 'POST',
      body: JSON.stringify({ content_id, scheduled_at }),
    }),
  listSchedule: () => request<Content[]>('/schedule/list'),

  // stats
  stats: () => request<Stats>('/stats'),
};
