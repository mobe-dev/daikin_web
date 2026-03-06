import type { DaikinCapabilities, DaikinControllerState } from '$lib/daikin/properties';
import { defaultCapabilities, defaultState } from '$lib/daikin/properties';

export type WireProtocolMode = 'json-patch' | 'json-state' | 'kv';

export interface DaikinDebugCharacteristic {
	serviceUuid: string;
	characteristicUuid: string;
	properties: string[];
}

export interface DaikinDebugSnapshot {
	connectedAt: string;
	deviceName: string;
	writableCharacteristicIds: string[];
	activeWriteTarget?: string;
	discoveredCharacteristics: DaikinDebugCharacteristic[];
	lastWriteHex?: string;
	lastWriteText?: string;
	lastWriteAt?: string;
	lastNotifyHex?: string;
	lastNotifyAt?: string;
}

export interface DaikinDeviceInfo {
	id: string;
	name: string;
	gattConnected: boolean;
}

export interface WriteOptions {
	mode: WireProtocolMode;
	preferredCharacteristicId?: string;
}

export interface DaikinClient {
	device: DaikinDeviceInfo;
	disconnect: () => void;
	readState: () => Promise<DaikinControllerState>;
	writeState: (partial: Partial<DaikinControllerState>, options?: WriteOptions) => Promise<DaikinControllerState>;
	readCapabilities: () => Promise<DaikinCapabilities>;
	getDebugSnapshot: () => DaikinDebugSnapshot;
}

const OPTIONAL_SERVICES: Array<string | number> = [
	'0000fff0-0000-1000-8000-00805f9b34fb',
	'0000fff1-0000-1000-8000-00805f9b34fb',
	'0000fff2-0000-1000-8000-00805f9b34fb',
	'0000fee0-0000-1000-8000-00805f9b34fb',
	'0000fee7-0000-1000-8000-00805f9b34fb',
	0x1800,
	0x1801,
	0x180a,
	0x181a
];

let inMemoryState = { ...defaultState };

function logDebug(event: string, payload?: unknown): void {
	const stamp = new Date().toISOString();
	if (payload !== undefined) {
		console.debug(`[DaikinBT:${stamp}] ${event}`, payload);
		return;
	}
	console.debug(`[DaikinBT:${stamp}] ${event}`);
}

function hex(bytes: Uint8Array): string {
	return [...bytes].map((v) => v.toString(16).padStart(2, '0')).join(' ');
}

function text(bytes: Uint8Array): string {
	try {
		return new TextDecoder().decode(bytes);
	} catch {
		return '';
	}
}

function encodePatch(
	patch: Partial<DaikinControllerState>,
	fullState: DaikinControllerState,
	mode: WireProtocolMode
): Uint8Array {
	if (mode === 'json-state') {
		return new TextEncoder().encode(JSON.stringify({ type: 'state', payload: fullState }));
	}
	if (mode === 'kv') {
		const lines = Object.entries(patch).map(([key, value]) => `${key}=${JSON.stringify(value)}`);
		return new TextEncoder().encode(lines.join('\n'));
	}
	return new TextEncoder().encode(JSON.stringify({ type: 'patch', payload: patch }));
}

function characteristicId(serviceUuid: string, characteristicUuid: string): string {
	return `${serviceUuid}/${characteristicUuid}`;
}

export async function connectDaikinBluetooth(): Promise<DaikinClient> {
	if (typeof navigator === 'undefined' || !('bluetooth' in navigator)) {
		throw new Error('Web Bluetooth is not available in this browser. Use Chromium-based browser over HTTPS.');
	}

	logDebug('Requesting device', { acceptAllDevices: true, optionalServices: OPTIONAL_SERVICES });
	const bluetooth = (navigator as Navigator & { bluetooth: { requestDevice: (options: unknown) => Promise<any> } }).bluetooth;
	const device = await bluetooth.requestDevice({
		acceptAllDevices: true,
		optionalServices: OPTIONAL_SERVICES
	});

	if (!device.gatt) {
		throw new Error('Selected device does not expose a GATT server.');
	}

	logDebug('Connecting GATT', { id: device.id, name: device.name });
	const server = await device.gatt.connect();
	const services = await server.getPrimaryServices();

	const writableCharacteristics: any[] = [];
	const snapshot: DaikinDebugSnapshot = {
		connectedAt: new Date().toISOString(),
		deviceName: device.name ?? 'Unknown Bluetooth Device',
		writableCharacteristicIds: [],
		discoveredCharacteristics: []
	};

	for (const service of services) {
		const serviceUuid = service.uuid;
		let chars: any[] = [];
		try {
			chars = await service.getCharacteristics();
		} catch (error) {
			logDebug('Failed to enumerate service characteristics', { serviceUuid, error });
			continue;
		}

		for (const characteristic of chars) {
			const characteristicUuid = characteristic.uuid;
			const props = Object.entries(characteristic.properties)
				.filter(([, enabled]) => Boolean(enabled))
				.map(([name]) => name);

			snapshot.discoveredCharacteristics.push({ serviceUuid, characteristicUuid, properties: props });
			const cid = characteristicId(serviceUuid, characteristicUuid);

			if (characteristic.properties.write || characteristic.properties.writeWithoutResponse) {
				writableCharacteristics.push(characteristic);
				snapshot.writableCharacteristicIds.push(cid);
			}

			if (characteristic.properties.notify || characteristic.properties.indicate) {
				try {
					await characteristic.startNotifications();
					characteristic.addEventListener('characteristicvaluechanged', (event: Event) => {
						const target = event.target as any;
						const value = target.value;
						if (!value) return;
						const bytes = new Uint8Array(value.buffer);
						snapshot.lastNotifyHex = hex(bytes);
						snapshot.lastNotifyAt = new Date().toISOString();
						logDebug('Notification', {
							characteristicId: characteristicId(serviceUuid, characteristicUuid),
							hex: snapshot.lastNotifyHex,
							text: text(bytes)
						});
					});
					logDebug('Notification subscribed', { characteristicId: cid });
				} catch (error) {
					logDebug('Failed to subscribe notifications', { characteristicId: cid, error });
				}
			}
		}
	}

	logDebug('GATT discovery complete', {
		serviceCount: services.length,
		writableCount: writableCharacteristics.length,
		discoveredCharacteristics: snapshot.discoveredCharacteristics
	});

	const resolveTarget = (preferredCharacteristicId?: string): any | null => {
		if (!writableCharacteristics.length) {
			return null;
		}
		if (!preferredCharacteristicId) {
			return writableCharacteristics[0];
		}
		return (
			writableCharacteristics.find((ch) => {
				const sid = ch.service?.uuid ?? 'unknown';
				return characteristicId(sid, ch.uuid) === preferredCharacteristicId;
			}) ?? writableCharacteristics[0]
		);
	};

	return {
		device: {
			id: device.id || crypto.randomUUID(),
			name: device.name ?? 'Unknown Bluetooth Device',
			gattConnected: Boolean(device.gatt.connected)
		},
		disconnect: () => {
			logDebug('Disconnect requested');
			device.gatt?.disconnect();
		},
		readCapabilities: async () => {
			logDebug('readCapabilities invoked');
			return defaultCapabilities;
		},
		readState: async () => {
			logDebug('readState invoked', { state: inMemoryState });
			return { ...inMemoryState };
		},
		writeState: async (partial: Partial<DaikinControllerState>, options: WriteOptions = { mode: 'json-patch' }) => {
			inMemoryState = { ...inMemoryState, ...partial };
			const payload = encodePatch(partial, inMemoryState, options.mode);
			const target = resolveTarget(options.preferredCharacteristicId);

			if (!target) {
				logDebug('No writable GATT characteristic found. Patch not sent to device.', { partial });
				throw new Error('No writable GATT characteristic found on this device.');
			}

			const sid = target.service?.uuid ?? 'unknown';
			const cid = characteristicId(sid, target.uuid);
			snapshot.activeWriteTarget = cid;
			snapshot.lastWriteHex = hex(payload);
			snapshot.lastWriteText = text(payload);
			snapshot.lastWriteAt = new Date().toISOString();

			logDebug('Writing payload', {
				partial,
				mode: options.mode,
				target: cid,
				hex: snapshot.lastWriteHex,
				text: snapshot.lastWriteText
			});

			if (target.properties.writeWithoutResponse) {
				await target.writeValueWithoutResponse(payload);
			} else {
				await target.writeValueWithResponse(payload);
			}

			logDebug('Write successful', { target: cid });
			return { ...inMemoryState };
		},
		getDebugSnapshot: () => ({ ...snapshot })
	};
}
