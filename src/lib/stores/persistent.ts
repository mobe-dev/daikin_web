import { persisted } from 'svelte-persisted-store';
import type { DaikinCapabilities, DaikinControllerState } from '$lib/daikin/properties';
import { defaultCapabilities, defaultState } from '$lib/daikin/properties';
import type { WireProtocolMode } from '$lib/bluetooth/daikin';

export interface KnownDevice {
	id: string;
	name: string;
	lastSeenAt: string;
	capabilities?: DaikinCapabilities;
}

export interface UserPreferences {
	temperatureUnit: 'C' | 'F';
	autoReconnect: boolean;
	lastSelectedDeviceId?: string;
}

export interface DebugPreferences {
	wireProtocolMode: WireProtocolMode;
	preferredCharacteristicId?: string;
	verboseConsole: boolean;
}

export const knownDevices = persisted<KnownDevice[]>('daikin-known-devices-v1', []);

export const userPreferences = persisted<UserPreferences>('daikin-user-preferences-v1', {
	temperatureUnit: 'C',
	autoReconnect: false
});

export const debugPreferences = persisted<DebugPreferences>('daikin-debug-preferences-v1', {
	wireProtocolMode: 'madoka-uart',
	preferredCharacteristicId: undefined,
	verboseConsole: true
});

export const lastControllerState = persisted<DaikinControllerState>(
	'daikin-last-controller-state-v1',
	defaultState
);

export const lastCapabilities = persisted<DaikinCapabilities>(
	'daikin-last-capabilities-v1',
	defaultCapabilities
);
