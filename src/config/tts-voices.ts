export interface TTSVoice {
  id: string
  name: string
  description: string
  language: string
}

export const TTS_VOICES: TTSVoice[] = [
  {
    id: 'Vivian',
    name: 'Vivian',
    description: 'Bright, slightly edgy young female',
    language: 'Chinese',
  },
  {
    id: 'Serena',
    name: 'Serena',
    description: 'Warm, gentle young female',
    language: 'Chinese',
  },
  {
    id: 'Uncle_Fu',
    name: 'Uncle Fu',
    description: 'Seasoned male, low mellow timbre',
    language: 'Chinese',
  },
  {
    id: 'Dylan',
    name: 'Dylan',
    description: 'Youthful Beijing male, clear natural timbre',
    language: 'Chinese',
  },
  {
    id: 'Eric',
    name: 'Eric',
    description: 'Lively Chengdu male, husky brightness',
    language: 'Chinese',
  },
  {
    id: 'Ryan',
    name: 'Ryan',
    description: 'Dynamic male, strong rhythmic drive',
    language: 'English',
  },
  {
    id: 'Aiden',
    name: 'Aiden',
    description: 'Sunny American male, clear midrange',
    language: 'English',
  },
  {
    id: 'Ono_Anna',
    name: 'Ono Anna',
    description: 'Playful female, light nimble timbre',
    language: 'Japanese',
  },
  {
    id: 'Sohee',
    name: 'Sohee',
    description: 'Warm female, rich emotion',
    language: 'Korean',
  },
]

export const DEFAULT_TTS_VOICE = TTS_VOICES[0].id
