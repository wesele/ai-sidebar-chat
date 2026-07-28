export type ActivationMode = 'always' | 'panel_open';
export type ActivationAction = 'start' | 'stop' | 'none';
export class ActivationController { constructor(private mode: ActivationMode = 'always', private panelOpen = false) {} update(mode: ActivationMode): ActivationAction { this.mode = mode; return this.active() ? 'start' : 'stop'; } panel(open: boolean): ActivationAction { this.panelOpen = open; return this.mode === 'panel_open' ? (open ? 'start' : 'stop') : 'none'; } active(): boolean { return this.mode === 'always' || this.panelOpen; } }
