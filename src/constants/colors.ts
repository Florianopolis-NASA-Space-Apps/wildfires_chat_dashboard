type HexColor = `#${string}`;

export const COLORS = {
  sand: '#cdbea1',
  sandLight: '#f9f6ef',
  sandBlush: '#fff3f0',
  coral: '#ffb8a8',
  chestnut: '#8c2f1c',
  slate950: '#0b1525',
  slate900: '#0f172a',
  slate850: '#1f2a49',
  slate800: '#1f2937',
  slate750: '#1d384f',
  slate700: '#1e293b',
  slate400: '#94a3b8',
  slate300: '#9ca3af',
  charcoal: '#18181b',
  charcoalDark: '#101010',
  charcoalMuted: '#404040',
  neutral100: '#ececf1',
  neutral200: '#d8d8d8',
  neutral300: '#cccccc',
  neutral350: '#aaaaaa',
  neutral400: '#999999',
  neutral450: '#909090',
  neutral500: '#696969',
  navy: '#000080',
  electricBlue: '#0099ff',
  skyBlue: '#0ea5e9',
  emerald: '#22c55e',
  successGreen: '#009900',
  amber: '#fede17',
  orange: '#e85607',
  orangeBright: '#ea580c',
  crimson: '#e22822',
  alertRed: '#dc2626',
  red: '#ff0000',
  redDark: '#cc0000',
  redDeep: '#990000',
  snow: '#f5f5f5',
  alabaster: '#f8fafc',
  white: '#ffffff',
  black: '#000000',
} as const satisfies Record<string, HexColor>;

export type ColorName = keyof typeof COLORS;

const CSS_VARIABLE_PREFIX = '--color-';
const CSS_RGB_SUFFIX = '-rgb';

const toKebabCase = (value: string): string =>
  value
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/([a-zA-Z])([0-9])/g, '$1-$2')
    .replace(/_{1,}/g, '-')
    .toLowerCase();

const normalizeHex = (value: HexColor): string => value.replace('#', '');

const hexToRgb = (hexValue: HexColor): string => {
  const normalized = normalizeHex(hexValue);

  const expanded =
    normalized.length === 3
      ? normalized
          .split('')
          .map((char) => char + char)
          .join('')
      : normalized;

  const matches = expanded.match(/.{2}/g);
  if (!matches || matches.length !== 3) {
    throw new Error(`Invalid hex color provided: ${hexValue}`);
  }

  const [r, g, b] = matches.map((value) => parseInt(value, 16));
  return `${r}, ${g}, ${b}`;
};

const toCssVarName = (colorName: ColorName): string =>
  `${CSS_VARIABLE_PREFIX}${toKebabCase(colorName)}`;

const toRgbCssVarName = (colorName: ColorName): string =>
  `${toCssVarName(colorName)}${CSS_RGB_SUFFIX}`;

export const colorVar = (colorName: ColorName): string =>
  `var(${toCssVarName(colorName)})`;

export const colorRgbVar = (colorName: ColorName): string =>
  `var(${toRgbCssVarName(colorName)})`;

export const initializeColorVariables = (root?: HTMLElement): void => {
  if (typeof document === 'undefined') {
    return;
  }

  const target = root ?? document.documentElement;

  (Object.entries(COLORS) as Array<[ColorName, HexColor]>).forEach(
    ([name, hex]) => {
      target.style.setProperty(toCssVarName(name), hex);
      target.style.setProperty(toRgbCssVarName(name), hexToRgb(hex));
    }
  );
};
