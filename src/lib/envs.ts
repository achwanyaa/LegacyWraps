import type { EnvName } from './types';

/** Stage environments, shared by the spin view and the 3D view. */
export const ENVS: Record<EnvName, { label: string; bg: [string, string]; exposure: number; env: number; key: string; fill: string; rim: [string, string] | null; ink: 'dark' | 'light' }> = {
  studio: { label: 'Studio', bg: ['#f3f1ec', '#d8d5ce'], exposure: 1.0, env: 1.0, key: '#ffffff', fill: '#dfe6ff', rim: null, ink: 'dark' },
  dusk: { label: 'Golden hour', bg: ['#f6c79a', '#7a4b6a'], exposure: 0.95, env: 0.8, key: '#ffb37a', fill: '#7d6bff', rim: ['#ff7a3d', '#6a5cff'], ink: 'dark' },
  night: { label: 'Night garage', bg: ['#16171c', '#050506'], exposure: 0.85, env: 0.45, key: '#c9d6ff', fill: '#2a3550', rim: ['#00e0ff', '#ff2bd6'], ink: 'light' },
};
