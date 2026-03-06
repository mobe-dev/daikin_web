export type HvacMode = 'auto' | 'cool' | 'heat' | 'dry' | 'fan';
export type FanSpeed = 'auto' | 'quiet' | '1' | '2' | '3' | '4' | '5' | 'turbo';
export type SwingMode = 'off' | 'vertical' | 'horizontal' | 'both';

export interface TimerWindow {
	enabled: boolean;
	hour: number;
	minute: number;
}

export interface DaikinControllerState {
	power: boolean;
	mode: HvacMode;
	targetCelsius: number;
	roomCelsius?: number;
	humidityPercent?: number;
	fanSpeed: FanSpeed;
	swing: SwingMode;
	streamer: boolean;
	econo: boolean;
	powerful: boolean;
	quiet: boolean;
	comfort: boolean;
	holiday: boolean;
	moldProof: boolean;
	demandControlPercent?: number;
	offTimer: TimerWindow;
	onTimer: TimerWindow;
	weeklyTimerEnabled: boolean;
	childLock: boolean;
	beepEnabled: boolean;
}

export interface DaikinCapabilities {
	modes: HvacMode[];
	fanSpeeds: FanSpeed[];
	swingModes: SwingMode[];
	temperatureMinC: number;
	temperatureMaxC: number;
	temperatureStepC: number;
	hasStreamer: boolean;
	hasEcono: boolean;
	hasPowerful: boolean;
	hasQuiet: boolean;
	hasComfort: boolean;
	hasHoliday: boolean;
	hasMoldProof: boolean;
	hasTimers: boolean;
	hasWeeklyTimer: boolean;
	hasDemandControl: boolean;
	hasChildLock: boolean;
	hasBeepToggle: boolean;
}

export const defaultCapabilities: DaikinCapabilities = {
	modes: ['auto', 'cool', 'heat', 'dry', 'fan'],
	fanSpeeds: ['auto', 'quiet', '1', '2', '3', '4', '5', 'turbo'],
	swingModes: ['off', 'vertical', 'horizontal', 'both'],
	temperatureMinC: 16,
	temperatureMaxC: 32,
	temperatureStepC: 0.5,
	hasStreamer: true,
	hasEcono: true,
	hasPowerful: true,
	hasQuiet: true,
	hasComfort: true,
	hasHoliday: true,
	hasMoldProof: true,
	hasTimers: true,
	hasWeeklyTimer: true,
	hasDemandControl: true,
	hasChildLock: true,
	hasBeepToggle: true
};

export const defaultState: DaikinControllerState = {
	power: true,
	mode: 'cool',
	targetCelsius: 24,
	roomCelsius: undefined,
	humidityPercent: undefined,
	fanSpeed: 'auto',
	swing: 'off',
	streamer: false,
	econo: false,
	powerful: false,
	quiet: false,
	comfort: false,
	holiday: false,
	moldProof: false,
	demandControlPercent: undefined,
	offTimer: { enabled: false, hour: 22, minute: 0 },
	onTimer: { enabled: false, hour: 7, minute: 0 },
	weeklyTimerEnabled: false,
	childLock: false,
	beepEnabled: true
};

export const modeLabels: Record<HvacMode, string> = {
	auto: 'Auto',
	cool: 'Cool',
	heat: 'Heat',
	dry: 'Dry',
	fan: 'Fan'
};
