export enum Mood {
  HAPPY = 'Happy',
  CRYING = 'Crying',
  SAD = 'Sad',
  SLEEPING = 'Sleeping',
  PLAYFUL = 'Playful',
  NEUTRAL = 'Neutral'
}

export interface ChildProfile {
  name: string;
  birthday: string; // ISO Date string YYYY-MM-DD
}

export interface MemoryImage {
  id: string;
  base64: string;
  mimeType: string;
}

export interface Memory {
  id: string;
  date: string; // The date the photo was taken
  images: MemoryImage[];
  note: string;
  mood: Mood;
  calculatedAge: string; // Pre-calculated string like "2 Months, 5 Days"
  createdAt: number;
}

export interface GeminiAnalysisResult {
  mood: Mood;
  suggestedNote: string;
}
