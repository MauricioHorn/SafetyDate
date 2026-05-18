/**
 * Design System do SafetyDate
 * Paleta inspirada em segurança, confiança e empoderamento feminino
 * Dark mode first com acentos em rosa/coral
 */

export const colors = {
  // Base
  background: '#0F0F1A',
  surface: '#1A1A2E',
  surfaceElevated: '#232338',
  border: '#2A2A42',
  
  // Primary - Rosa coral (empoderamento, acolhimento)
  primary: '#FF4D7E',
  primaryDark: '#E63E6B',
  primaryLight: '#FF7FA3',
  primarySubtle: 'rgba(255, 77, 126, 0.12)',
  
  // Accent - Violeta (confiança, tecnologia)
  accent: '#A78BFA',
  accentDark: '#8B6FE8',
  
  // Flags de risco (tons abafados sobre fundo dark)
  // Green = verde musgo profundo, texto verde claro
  flagGreen: '#86EFAC',
  flagGreenBg: 'rgba(20, 83, 45, 0.55)',
  flagGreenBorder: 'rgba(134, 239, 172, 0.25)',
  // Yellow = âmbar quente, texto creme
  flagYellow: '#FCD34D',
  flagYellowBg: 'rgba(120, 53, 15, 0.55)',
  flagYellowBorder: 'rgba(252, 211, 77, 0.25)',
  // Red = bordô profundo, texto rosa claro
  flagRed: '#FCA5A5',
  flagRedBg: 'rgba(127, 29, 29, 0.55)',
  flagRedBorder: 'rgba(252, 165, 165, 0.25)',
  
  // Text
  text: '#FFFFFF',
  textSecondary: '#B4B4C7',
  textMuted: '#7A7A94',
  textOnPrimary: '#FFFFFF',
  
  // Status
  success: '#10B981',
  warning: '#F59E0B',
  danger: '#EF4444',
  info: '#3B82F6',
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
};

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  full: 999,
};

export const typography = {
  h1: {
    fontSize: 32,
    fontWeight: '800' as const,
    letterSpacing: -0.5,
  },
  h2: {
    fontSize: 24,
    fontWeight: '700' as const,
    letterSpacing: -0.3,
  },
  h3: {
    fontSize: 20,
    fontWeight: '700' as const,
  },
  body: {
    fontSize: 16,
    fontWeight: '400' as const,
  },
  bodyBold: {
    fontSize: 16,
    fontWeight: '600' as const,
  },
  caption: {
    fontSize: 14,
    fontWeight: '400' as const,
  },
  small: {
    fontSize: 12,
    fontWeight: '400' as const,
  },
};

export const shadows = {
  sm: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 2,
  },
  md: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  lg: {
    shadowColor: '#FF4D7E',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 8,
  },
};
