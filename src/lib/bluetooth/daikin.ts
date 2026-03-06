import type { DaikinCapabilities, DaikinControllerState, FanSpeed, HvacMode } from '$lib/daikin/properties';
import { defaultCapabilities, defaultState } from '$lib/daikin/properties';

export type WireProtocolMode = 'madoka-uart';

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
	lastResponseHex?: string;
	lastError?: string;
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
	getGeneralInfo: () => Promise<Record<number, Uint8Array>>;
	getSensorInformation: () => Promise<Record<number, Uint8Array>>;
	getMaintenanceInformation: () => Promise<Record<number, Uint8Array>>;
	getEyeBrightness: () => Promise<number | undefined>;
	setEyeBrightness: (value: number) => Promise<void>;
	disableCleanFilterIndicator: () => Promise<void>;
}

type ArgMap = Record<number, Uint8Array>;

const MADOKA_SERVICE_AC = '2141e110-213a-11e6-b67b-9e71128cae77';
const MADOKA_CHAR_NOTIFY = '2141e111-213a-11e6-b67b-9e71128cae77';
const MADOKA_CHAR_WRITE = '2141e112-213a-11e6-b67b-9e71128cae77';

const MADOKA_SERVICE_FW = '2141e100-213a-11e6-b67b-9e71128cae77';

const OPTIONAL_SERVICES: Array<string | number> = [MADOKA_SERVICE_AC, MADOKA_SERVICE_FW, 0x1800, 0x1801, 0x180a, 0x181a];

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

function u16be(value: number): Uint8Array {
	return new Uint8Array([(value >> 8) & 0xff, value & 0xff]);
}

function decodeSfloat(value: Uint8Array): number | undefined {
	if (value.length < 2) return undefined;
	const raw = value[0] | (value[1] << 8);
	let mantissa = raw & 0x0fff;
	let exponent = raw >> 12;
	if (mantissa >= 0x0800) mantissa = -((0x1000 - mantissa) & 0x0fff);
	if (exponent >= 0x0008) exponent = -((0x0010 - exponent) & 0x000f);
	return mantissa * Math.pow(10, exponent);
}

function encodeSfloat(temp: number): Uint8Array {
	const exponent = -1;
	let mantissa = Math.round(temp * 10);
	if (mantissa < 0) mantissa = (0x1000 + mantissa) & 0x0fff;
	const expNibble = (0x10 + exponent) & 0x0f;
	const raw = (expNibble << 12) | (mantissa & 0x0fff);
	return new Uint8Array([raw & 0xff, (raw >> 8) & 0xff]);
}

function parseArgs(payload: Uint8Array): ArgMap {
	const args: ArgMap = {};
	let offset = 0;
	while (offset + 2 <= payload.length) {
		const id = payload[offset];
		const size = payload[offset + 1];
		offset += 2;
		if (offset + size > payload.length) break;
		args[id] = payload.slice(offset, offset + size);
		offset += size;
	}
	return args;
}

function encodeRequest(functionId: number, args: Array<{ id: number; value: Uint8Array }>): Uint8Array {
	const chunks: number[] = [];
	chunks.push((functionId >> 16) & 0xff, (functionId >> 8) & 0xff, functionId & 0xff);
	if (args.length === 0) {
		chunks.push(0x00, 0x00);
	} else {
		for (const arg of args) {
			chunks.push(arg.id & 0xff, arg.value.length & 0xff, ...arg.value);
		}
	}
	return new Uint8Array(chunks);
}

function buildTransportChunks(payload: Uint8Array): Uint8Array[] {
	const chunks: Uint8Array[] = [];
	const totalWithLen = payload.length + 1;
	const firstDataLen = Math.min(18, payload.length);
	const first = new Uint8Array(2 + firstDataLen);
	first[0] = 0x00;
	first[1] = totalWithLen & 0xff;
	first.set(payload.slice(0, firstDataLen), 2);
	chunks.push(first);
	let offset = firstDataLen;
	let chunkId = 0x01;
	while (offset < payload.length) {
		const len = Math.min(19, payload.length - offset);
		const chunk = new Uint8Array(1 + len);
		chunk[0] = chunkId & 0xff;
		chunk.set(payload.slice(offset, offset + len), 1);
		chunks.push(chunk);
		offset += len;
		chunkId += 1;
	}
	return chunks;
}

function parseFunctionId(bytes: Uint8Array): number {
	if (bytes.length < 3) return -1;
	return (bytes[0] << 16) | (bytes[1] << 8) | bytes[2];
}

function mapModeFromMadoka(v?: number): HvacMode {
	switch (v) {
		case 0:
			return 'fan';
		case 1:
			return 'dry';
		case 2:
			return 'auto';
		case 3:
			return 'cool';
		case 4:
			return 'heat';
		default:
			return 'auto';
	}
}

function mapModeToMadoka(v: HvacMode): number {
	switch (v) {
		case 'fan':
			return 0;
		case 'dry':
			return 1;
		case 'auto':
			return 2;
		case 'cool':
			return 3;
		case 'heat':
			return 4;
	}
}

function mapFanFromMadoka(v?: number): FanSpeed {
	switch (v) {
		case 1:
			return '1';
		case 2:
			return '2';
		case 3:
			return '3';
		case 4:
			return '4';
		case 5:
			return '5';
		default:
			return 'auto';
	}
}

function mapFanToMadoka(v: FanSpeed): number {
	switch (v) {
		case '1':
			return 1;
		case '2':
			return 2;
		case '3':
			return 3;
		case '4':
			return 4;
		case '5':
			return 5;
		default:
			return 3;
	}
}

export async function connectDaikinBluetooth(): Promise<DaikinClient> {
	if (typeof navigator === 'undefined' || !('bluetooth' in navigator)) {
		throw new Error('Web Bluetooth is not available in this browser. Use Chromium-based browser over HTTPS.');
	}

	logDebug('Requesting device', { acceptAllDevices: true, optionalServices: OPTIONAL_SERVICES });
	const bluetooth = (navigator as Navigator & { bluetooth: { requestDevice: (options: unknown) => Promise<any> } }).bluetooth;
	const device = await bluetooth.requestDevice({ acceptAllDevices: true, optionalServices: OPTIONAL_SERVICES });
	if (!device.gatt) throw new Error('Selected device does not expose a GATT server.');

	const server = await device.gatt.connect();
	const services = await server.getPrimaryServices();
	const snapshot: DaikinDebugSnapshot = {
		connectedAt: new Date().toISOString(),
		deviceName: device.name ?? 'Unknown Bluetooth Device',
		writableCharacteristicIds: [],
		discoveredCharacteristics: []
	};

	let tx: any | null = null;
	let rx: any | null = null;

	for (const service of services) {
		let chars: any[] = [];
		try {
			chars = await service.getCharacteristics();
		} catch {
			continue;
		}
		for (const characteristic of chars) {
			const props = Object.entries(characteristic.properties)
				.filter(([, enabled]) => Boolean(enabled))
				.map(([name]) => name);
			snapshot.discoveredCharacteristics.push({
				serviceUuid: service.uuid,
				characteristicUuid: characteristic.uuid,
				properties: props
			});
			const cid = `${service.uuid}/${characteristic.uuid}`;
			if (characteristic.properties.write || characteristic.properties.writeWithoutResponse) snapshot.writableCharacteristicIds.push(cid);
			if (service.uuid === MADOKA_SERVICE_AC && characteristic.uuid === MADOKA_CHAR_WRITE) tx = characteristic;
			if (service.uuid === MADOKA_SERVICE_AC && characteristic.uuid === MADOKA_CHAR_NOTIFY) rx = characteristic;
		}
	}

	if (!tx || !rx) {
		snapshot.lastError = 'Madoka AC TX/RX characteristics not found.';
		logDebug('Madoka AC characteristics missing', snapshot.discoveredCharacteristics);
		throw new Error('Madoka AC management characteristics not found on this device.');
	}

	const pendingChunks = new Map<number, Uint8Array>();
	const pendingRequests = new Map<number, { resolve: (v: Uint8Array) => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout> }>();

	const onNotify = (event: Event) => {
		const target = event.target as any;
		const value = target.value;
		if (!value) return;
		const chunk = new Uint8Array(value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength));
		snapshot.lastNotifyHex = hex(chunk);
		snapshot.lastNotifyAt = new Date().toISOString();
		logDebug('RX chunk', { hex: snapshot.lastNotifyHex, text: text(chunk) });

		const chunkId = chunk[0];
		pendingChunks.set(chunkId, chunk.slice(1));
		const first = pendingChunks.get(0x00);
		if (!first || first.length < 1) return;
		const totalLen = first[0];
		const assembled: number[] = [];
		let i = 0;
		while (pendingChunks.has(i)) {
			const part = pendingChunks.get(i)!;
			if (i === 0) assembled.push(...part.slice(1));
			else assembled.push(...part);
			i += 1;
			if (assembled.length >= totalLen - 1) break;
		}
		if (assembled.length < totalLen - 1) return;

		for (let c = 0; c < i; c += 1) pendingChunks.delete(c);
		const payload = new Uint8Array(assembled.slice(0, totalLen - 1));
		snapshot.lastResponseHex = hex(payload);
		logDebug('RX payload assembled', { hex: snapshot.lastResponseHex, text: text(payload) });

		const fn = parseFunctionId(payload);
		const pending = pendingRequests.get(fn);
		if (pending) {
			clearTimeout(pending.timer);
			pendingRequests.delete(fn);
			pending.resolve(payload);
		}
	};

	await rx.startNotifications();
	rx.addEventListener('characteristicvaluechanged', onNotify);

	const sendRequest = async (functionId: number, args: Array<{ id: number; value: Uint8Array }> = []): Promise<ArgMap> => {
		const payload = encodeRequest(functionId, args);
		const chunks = buildTransportChunks(payload);
		logDebug('TX payload', { functionId, hex: hex(payload), args: args.map((a) => ({ id: a.id, hex: hex(a.value) })) });

		const responsePromise = new Promise<Uint8Array>((resolve, reject) => {
			const timer = setTimeout(() => {
				pendingRequests.delete(functionId);
				reject(new Error(`Timeout waiting response for function ${functionId}`));
			}, 5000);
			pendingRequests.set(functionId, { resolve, reject, timer });
		});

		for (const chunk of chunks) {
			snapshot.activeWriteTarget = `${MADOKA_SERVICE_AC}/${MADOKA_CHAR_WRITE}`;
			snapshot.lastWriteHex = hex(chunk);
			snapshot.lastWriteText = text(chunk);
			snapshot.lastWriteAt = new Date().toISOString();
			await tx.writeValueWithoutResponse(chunk);
			logDebug('TX chunk', { hex: snapshot.lastWriteHex });
		}

		const response = await responsePromise;
		const responseFn = parseFunctionId(response);
		if (responseFn !== functionId) {
			throw new Error(`Unexpected response function ${responseFn}, expected ${functionId}`);
		}
		return parseArgs(response.slice(3));
	};

	const getGeneralInfo = () => sendRequest(0x000000);
	const getSettingStatus = () => sendRequest(0x000020);
	const setSettingStatus = (on: boolean) => sendRequest(0x004020, [{ id: 0x20, value: new Uint8Array([on ? 1 : 0]) }]);
	const getOperationMode = () => sendRequest(0x000030);
	const setOperationMode = (mode: HvacMode) => sendRequest(0x004030, [{ id: 0x20, value: new Uint8Array([mapModeToMadoka(mode)]) }]);
	const getSetpoint = () => sendRequest(0x000040);
	const setSetpoint = (cooling?: number, heating?: number) => {
		const args: Array<{ id: number; value: Uint8Array }> = [];
		if (cooling !== undefined) args.push({ id: 0x20, value: encodeSfloat(cooling) });
		if (heating !== undefined) args.push({ id: 0x21, value: encodeSfloat(heating) });
		return sendRequest(0x004040, args);
	};
	const getFanSpeed = () => sendRequest(0x000050);
	const setFanSpeed = (cooling: FanSpeed, heating: FanSpeed) =>
		sendRequest(0x004050, [
			{ id: 0x20, value: new Uint8Array([mapFanToMadoka(cooling)]) },
			{ id: 0x21, value: new Uint8Array([mapFanToMadoka(heating)]) }
		]);
	const disableCleanFilterIndicator = () => sendRequest(0x004220, [{ id: 0x51, value: new Uint8Array([0x01]) }]).then(() => undefined);
	const getSensorInformation = () => sendRequest(0x000110);
	const getMaintenanceInformation = () => sendRequest(0x000130);
	const getEyeBrightnessRaw = () => sendRequest(0x000302, [{ id: 0x33, value: new Uint8Array([0x00]) }]);
	const setEyeBrightness = (value: number) => sendRequest(0x004302, [{ id: 0x33, value: new Uint8Array([Math.max(0, Math.min(19, value))]) }]).then(() => undefined);

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
		readCapabilities: async () => defaultCapabilities,
		readState: async () => {
			const [status, mode, setpoint, fan, sensors] = await Promise.all([
				getSettingStatus(),
				getOperationMode(),
				getSetpoint(),
				getFanSpeed(),
				getSensorInformation()
			]);
			const currentMode = mapModeFromMadoka(mode[0x20]?.[0]);
			const coolingSetpoint = decodeSfloat(setpoint[0x20]);
			const heatingSetpoint = decodeSfloat(setpoint[0x21]);
			const temp = sensors[0x40]?.[0];
			inMemoryState = {
				...inMemoryState,
				power: status[0x20]?.[0] === 1,
				mode: currentMode,
				targetCelsius:
					currentMode === 'heat' ? (heatingSetpoint ?? inMemoryState.targetCelsius) : (coolingSetpoint ?? inMemoryState.targetCelsius),
				fanSpeed: mapFanFromMadoka((currentMode === 'heat' ? fan[0x21] : fan[0x20])?.[0]),
				roomCelsius: temp !== undefined && temp !== 0xff ? temp : inMemoryState.roomCelsius
			};
			return { ...inMemoryState };
		},
		writeState: async (partial: Partial<DaikinControllerState>) => {
			inMemoryState = { ...inMemoryState, ...partial };
			if (partial.power !== undefined) await setSettingStatus(partial.power);
			if (partial.mode !== undefined) await setOperationMode(partial.mode);
			if (partial.targetCelsius !== undefined) {
				if (inMemoryState.mode === 'heat') await setSetpoint(undefined, partial.targetCelsius);
				else await setSetpoint(partial.targetCelsius, undefined);
			}
			if (partial.fanSpeed !== undefined) await setFanSpeed(partial.fanSpeed, partial.fanSpeed);
			return { ...inMemoryState };
		},
		getDebugSnapshot: () => ({ ...snapshot }),
		getGeneralInfo,
		getSensorInformation,
		getMaintenanceInformation,
		getEyeBrightness: async () => {
			const r = await getEyeBrightnessRaw();
			return r[0x33]?.[0];
		},
		setEyeBrightness,
		disableCleanFilterIndicator
	};
}
