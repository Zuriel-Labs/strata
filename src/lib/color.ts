export function getContrastingTextColor(color: string) {
  const normalized = color.replace('#', '');
  if (normalized.length !== 6) return '#ffffff';

  const red = Number.parseInt(normalized.slice(0, 2), 16);
  const green = Number.parseInt(normalized.slice(2, 4), 16);
  const blue = Number.parseInt(normalized.slice(4, 6), 16);
  const luminance = (red * 0.299) + (green * 0.587) + (blue * 0.114);

  return luminance > 160 ? '#111827' : '#ffffff';
}
