import type { Film } from '../lib/types';

export function Swatch({ film, hex, finish, size = 40, square = false, className = '' }: { film?: Film | null; hex?: string; finish?: string; size?: number; square?: boolean; className?: string }) {
  const f = finish || film?.finish || 'gloss';
  const style = { width: size, height: size, '--c': hex || film?.hex || '#888', '--c2': film?.hex2 || '#fff' } as React.CSSProperties;
  return <span aria-hidden className={`swatch ${f} ${square ? 'square' : ''} ${className}`} style={style} />;
}
