import type { DaikinCapabilities, DaikinControllerState } from '$lib/daikin/properties';
import { defaultCapabilities, defaultState } from '$lib/daikin/properties';

interface WebBluetoothDevice {
	id?: string;
	name?: string;
	gatt?: {
		connected?: boolean;
		connect: () => Promise<unknown>;
		disconnect: () => void;
	};
}

export interface DaikinDeviceInfo {
	id: string;
	name: string;
	gattConnected: boolean;
}

export interface DaikinClient {
	device: DaikinDeviceInfo;
	disconnect: () => void;
	readState: () => Promise<DaikinControllerState>;
	writeState: (partial: Partial<DaikinControllerState>) => Promise<DaikinControllerState>;
	readCapabilities: () => Promise<DaikinCapabilities>;
}

let inMemoryState = { ...defaultState };

function toInfo(device: WebBluetoothDevice): DaikinDeviceInfo {
	return {
		id: device.id || crypto.randomUUID(),
		name: device.name ?? 'Unknown Bluetooth Device',
		gattConnected: Boolean(device.gatt?.connected)
	};
}

export async function connectDaikinBluetooth(): Promise<DaikinClient> {
	if (typeof navigator === 'undefined' || !('bluetooth' in navigator)) {
		throw new Error('Web Bluetooth is not available in this browser. Use Chromium-based browser over HTTPS.');
	}

	const bluetooth = (navigator as Navigator & { bluetooth: { requestDevice: (options: unknown) => Promise<WebBluetoothDevice> } }).bluetooth;
	const device = await bluetooth.requestDevice({
		acceptAllDevices: true,
		optionalServices: []
	});

	if (!device.gatt) {
		throw new Error('Selected device does not expose a GATT server.');
	}

	await device.gatt.connect();

	return {
		device: toInfo(device),
		disconnect: () => device.gatt?.disconnect(),
		readCapabilities: async () => defaultCapabilities,
		readState: async () => ({ ...inMemoryState }),
		writeState: async (partial: Partial<DaikinControllerState>) => {
			inMemoryState = { ...inMemoryState, ...partial };
			return { ...inMemoryState };
		}
	};
}
