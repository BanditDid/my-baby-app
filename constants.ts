import { Mood } from './types';
import { Smile, Frown, CloudRain, Moon, Gamepad2, Meh } from 'lucide-react';

export const MOOD_CONFIG: Record<Mood, { color: string; icon: any; label: string }> = {
  [Mood.HAPPY]: { color: 'bg-yellow-100 text-yellow-700 border-yellow-300', icon: Smile, label: 'Happy' },
  [Mood.CRYING]: { color: 'bg-blue-100 text-blue-700 border-blue-300', icon: CloudRain, label: 'Crying' },
  [Mood.SAD]: { color: 'bg-slate-100 text-slate-700 border-slate-300', icon: Frown, label: 'Sad' },
  [Mood.SLEEPING]: { color: 'bg-indigo-100 text-indigo-700 border-indigo-300', icon: Moon, label: 'Sleeping' },
  [Mood.PLAYFUL]: { color: 'bg-green-100 text-green-700 border-green-300', icon: Gamepad2, label: 'Playful' },
  [Mood.NEUTRAL]: { color: 'bg-gray-100 text-gray-700 border-gray-300', icon: Meh, label: 'Neutral' },
};
