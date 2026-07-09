export const colors = {
  bg: '#0D1117',
  card: '#161B22',
  cardAlt: '#1C2128',
  border: '#30363D',
  text: '#E6EDF3',
  textDim: '#8B949E',
  textLight: '#6E7681',
  accent: '#6366F1',
  accentLight: 'rgba(99,102,241,0.12)',
  accentDark: '#4F46E5',
  accentText: '#A5B4FC',
  success: '#3FB950',
  easy: '#3FB950',
  medium: '#D29922',
  hard: '#F85149',
  tabBar: '#161B22',
  // Redesign additions — existing keys unchanged so current screens render identically.
  streak: '#FF8A3D',
  gold: '#E8B34B',
};

export const space = (n: number) => n * 4;
export const radius = { sm: 6, md: 10, lg: 14, xl: 18 };

export const shadow = {
  sm: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 2,
  },
  md: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 4,
  },
};
