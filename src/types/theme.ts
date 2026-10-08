export interface ThemeColors {
  primary: string;
  primaryContainer: string;
  secondary: string;
  secondaryContainer: string;
  tertiary: string;
  surface: string;
  surfaceDim: string;
  surfaceBright: string;
  surfaceContainerLowest: string;
  surfaceContainerLow: string;
  surfaceContainer: string;
  surfaceContainerHigh: string;
  surfaceContainerHighest: string;
  onSurface: string;
  onSurfaceVariant: string;
  outline: string;
  outlineVariant: string;
}

export type FontFamilyChoice = 'Geist' | 'JetBrains Mono' | 'Inter' | 'Fira Code' | 'System';
export type DensityChoice = 'compact' | 'standard' | 'spacious';
export type RadiusChoice = 'sharp' | 'standard' | 'rounded';

export interface ThemePreset {
  id: string;
  name: string;
  description: string;
  badge: string;
  isCustom?: boolean;
  colors: ThemeColors;
  fontFamily: FontFamilyChoice;
  density: DensityChoice;
  radius: RadiusChoice;
}

export const DEFAULT_PRESETS: ThemePreset[] = [
  {
    id: 'emerald-dark',
    name: 'Emerald Obsidian',
    description: 'Tema default pgStudio: hijau zamrud elektrik dengan latar pitch obsidian pekat.',
    badge: 'DEFAULT',
    colors: {
      primary: '#4edea3',
      primaryContainer: '#10b981',
      secondary: '#4cd7f6',
      secondaryContainer: '#03b5d3',
      tertiary: '#7bd0ff',
      surface: '#0b1326',
      surfaceDim: '#0b1326',
      surfaceBright: '#31394d',
      surfaceContainerLowest: '#060e20',
      surfaceContainerLow: '#131b2e',
      surfaceContainer: '#171f33',
      surfaceContainerHigh: '#222a3d',
      surfaceContainerHighest: '#2d3449',
      onSurface: '#dae2fd',
      onSurfaceVariant: '#bbcabf',
      outline: '#86948a',
      outlineVariant: '#3c4a42',
    },
    fontFamily: 'Geist',
    density: 'compact',
    radius: 'standard',
  },
  {
    id: 'tokyo-night',
    name: 'Tokyo Night Cyber',
    description: 'Gradasi malam Tokyo dengan neon cyan, ungu violet, dan latar biru gelap mendalam.',
    badge: 'POPULAR',
    colors: {
      primary: '#7aa2f7',
      primaryContainer: '#3d59a1',
      secondary: '#bb9af7',
      secondaryContainer: '#9d7cd8',
      tertiary: '#7dcfff',
      surface: '#1a1b26',
      surfaceDim: '#16161e',
      surfaceBright: '#292e42',
      surfaceContainerLowest: '#13141c',
      surfaceContainerLow: '#1f2335',
      surfaceContainer: '#24283b',
      surfaceContainerHigh: '#2f3549',
      surfaceContainerHighest: '#3b4261',
      onSurface: '#c0caf5',
      onSurfaceVariant: '#9aa5ce',
      outline: '#565f89',
      outlineVariant: '#414868',
    },
    fontFamily: 'JetBrains Mono',
    density: 'compact',
    radius: 'standard',
  },
  {
    id: 'catppuccin-mocha',
    name: 'Catppuccin Mocha',
    description: 'Nuansa pastel menenangkan dengan aksen lavender, peach, dan latar mocha hangat.',
    badge: 'PASTEL',
    colors: {
      primary: '#cba6f7',
      primaryContainer: '#b4befe',
      secondary: '#89b4fa',
      secondaryContainer: '#74c7ec',
      tertiary: '#fab387',
      surface: '#1e1e2e',
      surfaceDim: '#181825',
      surfaceBright: '#313244',
      surfaceContainerLowest: '#11111b',
      surfaceContainerLow: '#181825',
      surfaceContainer: '#24273a',
      surfaceContainerHigh: '#313244',
      surfaceContainerHighest: '#45475a',
      onSurface: '#cdd6f4',
      onSurfaceVariant: '#bac2de',
      outline: '#6c7086',
      outlineVariant: '#45475a',
    },
    fontFamily: 'Geist',
    density: 'compact',
    radius: 'rounded',
  },
  {
    id: 'dracula-pro',
    name: 'Dracula Gothic',
    description: 'Tema gelap legendaris kontras tinggi dengan aksen ungu misterius dan hijau vampir.',
    badge: 'LEGEND',
    colors: {
      primary: '#bd93f9',
      primaryContainer: '#ff79c6',
      secondary: '#50fa7b',
      secondaryContainer: '#8be9fd',
      tertiary: '#f1fa8c',
      surface: '#282a36',
      surfaceDim: '#21222c',
      surfaceBright: '#44475a',
      surfaceContainerLowest: '#191a21',
      surfaceContainerLow: '#21222c',
      surfaceContainer: '#282a36',
      surfaceContainerHigh: '#343746',
      surfaceContainerHighest: '#44475a',
      onSurface: '#f8f8f2',
      onSurfaceVariant: '#bfbfbf',
      outline: '#6272a4',
      outlineVariant: '#44475a',
    },
    fontFamily: 'JetBrains Mono',
    density: 'compact',
    radius: 'standard',
  },
  {
    id: 'nord-aurora',
    name: 'Nordic Frost',
    description: 'Palet kutub artik Arktik yang sejuk, stabil, dan sangat ramah di mata untuk coding lama.',
    badge: 'CLEAN',
    colors: {
      primary: '#88c0d0',
      primaryContainer: '#81a1c1',
      secondary: '#a3be8c',
      secondaryContainer: '#5e81ac',
      tertiary: '#ebcb8b',
      surface: '#2e3440',
      surfaceDim: '#242933',
      surfaceBright: '#434c5e',
      surfaceContainerLowest: '#1e222a',
      surfaceContainerLow: '#272c36',
      surfaceContainer: '#3b4252',
      surfaceContainerHigh: '#434c5e',
      surfaceContainerHighest: '#4c566a',
      onSurface: '#eceff4',
      onSurfaceVariant: '#d8dee9',
      outline: '#4c566a',
      outlineVariant: '#3b4252',
    },
    fontFamily: 'Inter',
    density: 'compact',
    radius: 'standard',
  },
  {
    id: 'github-dark',
    name: 'GitHub Dark Slate',
    description: 'Standar industri developer: kontras abu-abu arang netral dengan aksen biru GitHub.',
    badge: 'PRO',
    colors: {
      primary: '#58a6ff',
      primaryContainer: '#1f6feb',
      secondary: '#3fb950',
      secondaryContainer: '#238636',
      tertiary: '#d29922',
      surface: '#0d1117',
      surfaceDim: '#010409',
      surfaceBright: '#21262d',
      surfaceContainerLowest: '#010409',
      surfaceContainerLow: '#0d1117',
      surfaceContainer: '#161b22',
      surfaceContainerHigh: '#21262d',
      surfaceContainerHighest: '#30363d',
      onSurface: '#e6edf3',
      onSurfaceVariant: '#8d96a0',
      outline: '#6e7681',
      outlineVariant: '#30363d',
    },
    fontFamily: 'Geist',
    density: 'compact',
    radius: 'standard',
  },
  {
    id: 'cyberpunk-acid',
    name: 'Cyberpunk OLED Lime',
    description: 'Latar hitam murni 100% OLED dengan neon acid lime dan hot pink untuk monitor OLED.',
    badge: 'OLED',
    colors: {
      primary: '#a3e635',
      primaryContainer: '#65a30d',
      secondary: '#f43f5e',
      secondaryContainer: '#e11d48',
      tertiary: '#06b6d4',
      surface: '#000000',
      surfaceDim: '#000000',
      surfaceBright: '#27272a',
      surfaceContainerLowest: '#000000',
      surfaceContainerLow: '#09090b',
      surfaceContainer: '#121215',
      surfaceContainerHigh: '#1c1c20',
      surfaceContainerHighest: '#27272a',
      onSurface: '#f4f4f5',
      onSurfaceVariant: '#a1a1aa',
      outline: '#52525b',
      outlineVariant: '#27272a',
    },
    fontFamily: 'JetBrains Mono',
    density: 'compact',
    radius: 'sharp',
  },
  {
    id: 'solarized-amber',
    name: 'Monokai Amber Warm',
    description: 'Warna hangat nyaman dengan aksen emas amber, oranye hangat, dan latar arang cokelat.',
    badge: 'WARM',
    colors: {
      primary: '#ffd866',
      primaryContainer: '#fc9867',
      secondary: '#ff6188',
      secondaryContainer: '#ab9df2',
      tertiary: '#78dce8',
      surface: '#221f22',
      surfaceDim: '#19181a',
      surfaceBright: '#363236',
      surfaceContainerLowest: '#131214',
      surfaceContainerLow: '#1c1a1d',
      surfaceContainer: '#2d2a2e',
      surfaceContainerHigh: '#3a373b',
      surfaceContainerHighest: '#49464b',
      onSurface: '#fcfcfa',
      onSurfaceVariant: '#939293',
      outline: '#727072',
      outlineVariant: '#49464b',
    },
    fontFamily: 'Inter',
    density: 'compact',
    radius: 'standard',
  },
];

const STORAGE_ACTIVE_KEY = 'pgstudio_active_theme_id';
const STORAGE_CUSTOM_KEY = 'pgstudio_custom_presets_v1';

export function getSavedCustomPresets(): ThemePreset[] {
  try {
    const raw = localStorage.getItem(STORAGE_CUSTOM_KEY);
    if (raw) {
      return JSON.parse(raw);
    }
  } catch (err) {
    console.error('Failed to parse custom presets from localStorage', err);
  }
  return [];
}

export function saveCustomPresets(presets: ThemePreset[]): void {
  try {
    localStorage.setItem(STORAGE_CUSTOM_KEY, JSON.stringify(presets));
  } catch (err) {
    console.error('Failed to save custom presets', err);
  }
}

export function getSavedActiveThemeId(): string {
  try {
    return localStorage.getItem(STORAGE_ACTIVE_KEY) || 'emerald-dark';
  } catch {
    return 'emerald-dark';
  }
}

export function saveActiveThemeId(id: string): void {
  try {
    localStorage.setItem(STORAGE_ACTIVE_KEY, id);
  } catch {
    // ignore
  }
}

export function applyThemeToDOM(theme: ThemePreset): void {
  const root = document.documentElement;

  // Apply colors to CSS custom properties
  root.style.setProperty('--color-primary', theme.colors.primary);
  root.style.setProperty('--color-primary-container', theme.colors.primaryContainer);
  root.style.setProperty('--color-primary-fixed', theme.colors.primary);
  root.style.setProperty('--color-primary-fixed-dim', theme.colors.primary);

  root.style.setProperty('--color-secondary', theme.colors.secondary);
  root.style.setProperty('--color-secondary-container', theme.colors.secondaryContainer);
  root.style.setProperty('--color-secondary-fixed', theme.colors.secondary);
  root.style.setProperty('--color-secondary-fixed-dim', theme.colors.secondary);

  root.style.setProperty('--color-tertiary', theme.colors.tertiary);

  root.style.setProperty('--color-surface', theme.colors.surface);
  root.style.setProperty('--color-surface-dim', theme.colors.surfaceDim);
  root.style.setProperty('--color-surface-bright', theme.colors.surfaceBright);
  root.style.setProperty('--color-surface-container-lowest', theme.colors.surfaceContainerLowest);
  root.style.setProperty('--color-surface-container-low', theme.colors.surfaceContainerLow);
  root.style.setProperty('--color-surface-container', theme.colors.surfaceContainer);
  root.style.setProperty('--color-surface-container-high', theme.colors.surfaceContainerHigh);
  root.style.setProperty('--color-surface-container-highest', theme.colors.surfaceContainerHighest);
  root.style.setProperty('--color-surface-variant', theme.colors.surfaceContainerHigh);

  root.style.setProperty('--color-on-surface', theme.colors.onSurface);
  root.style.setProperty('--color-on-surface-variant', theme.colors.onSurfaceVariant);

  root.style.setProperty('--color-outline', theme.colors.outline);
  root.style.setProperty('--color-outline-variant', theme.colors.outlineVariant);

  root.style.setProperty('--color-background', theme.colors.surface);
  root.style.setProperty('--color-on-background', theme.colors.onSurface);

  // Apply Font Family
  if (theme.fontFamily === 'JetBrains Mono') {
    root.style.setProperty(
      '--font-body',
      "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace"
    );
  } else if (theme.fontFamily === 'Inter') {
    root.style.setProperty(
      '--font-body',
      "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
    );
  } else if (theme.fontFamily === 'Fira Code') {
    root.style.setProperty(
      '--font-body',
      "'Fira Code', 'JetBrains Mono', ui-monospace, monospace"
    );
  } else if (theme.fontFamily === 'System') {
    root.style.setProperty(
      '--font-body',
      "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"
    );
  } else {
    root.style.setProperty(
      '--font-body',
      "'Geist', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
    );
  }

  // Update body background
  document.body.style.backgroundColor = theme.colors.surface;
  document.body.style.color = theme.colors.onSurface;
}
