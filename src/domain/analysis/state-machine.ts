import type { DetectionStatus } from './issues';
const transitions: Record<DetectionStatus, DetectionStatus[]> = { never: ['queued', 'dirty'], dirty: ['queued', 'stale'], queued: ['analyzing', 'dirty', 'stale'], analyzing: ['analyzed', 'stale', 'error'], analyzed: ['dirty', 'stale'], stale: ['dirty', 'queued'], error: ['queued', 'dirty'] };
export function canTransition(from: DetectionStatus, to: DetectionStatus): boolean { return transitions[from].includes(to); }
export function transition(from: DetectionStatus, to: DetectionStatus): DetectionStatus { if (!canTransition(from, to)) throw new Error(`Invalid detection transition: ${from} -> ${to}`); return to; }
