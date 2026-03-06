<script lang="ts">
	import { onMount } from 'svelte';
	import { get } from 'svelte/store';
	import * as Card from '$lib/components/ui/card';
	import { Button } from '$lib/components/ui/button';
	import { Badge } from '$lib/components/ui/badge';
	import { Input } from '$lib/components/ui/input';
	import * as Select from '$lib/components/ui/select';
	import * as Tabs from '$lib/components/ui/tabs';
	import { Switch } from '$lib/components/ui/switch';
	import { Slider } from '$lib/components/ui/slider';
	import { Separator } from '$lib/components/ui/separator';
	import { connectDaikinBluetooth, type DaikinClient, type DaikinDebugSnapshot, type WireProtocolMode } from '$lib/bluetooth/daikin';
	import { defaultState, modeLabels, type DaikinControllerState, type FanSpeed, type HvacMode } from '$lib/daikin/properties';
	import { debugPreferences, knownDevices, lastCapabilities, lastControllerState, userPreferences } from '$lib/stores/persistent';

	let client: DaikinClient | null = null;
	let status = 'Disconnected';
	let busy = false;
	let controller: DaikinControllerState = defaultState;
	let target = defaultState.targetCelsius;
	let debug: DaikinDebugSnapshot | null = null;
	let protocolMode: WireProtocolMode = get(debugPreferences).wireProtocolMode;
	let preferredCharacteristicId = get(debugPreferences).preferredCharacteristicId ?? '';

	const fanSpeeds: FanSpeed[] = ['auto', 'quiet', '1', '2', '3', '4', '5', 'turbo'];
	const toggles: [string, keyof DaikinControllerState][] = [
		['Econo', 'econo'],
		['Powerful', 'powerful'],
		['Quiet', 'quiet'],
		['Comfort', 'comfort'],
		['Streamer', 'streamer'],
		['Holiday', 'holiday'],
		['Mold proof', 'moldProof'],
		['Child lock', 'childLock'],
		['Beep enabled', 'beepEnabled'],
		['Weekly timer', 'weeklyTimerEnabled']
	];

	function saveDebugPreferences() {
		debugPreferences.update((v) => ({
			...v,
			wireProtocolMode: protocolMode,
			preferredCharacteristicId: preferredCharacteristicId || undefined
		}));
	}

	function refreshDebug() {
		if (!client) return;
		debug = client.getDebugSnapshot();
		if (!preferredCharacteristicId && debug.writableCharacteristicIds.length > 0) {
			preferredCharacteristicId = debug.writableCharacteristicIds[0];
			saveDebugPreferences();
		}
	}

	async function connect() {
		busy = true;
		status = 'Connecting...';
		try {
			client = await connectDaikinBluetooth();
			const capabilities = await client.readCapabilities();
			const currentState = await client.readState();
			controller = currentState;
			target = currentState.targetCelsius;
			lastCapabilities.set(capabilities);
			lastControllerState.set(currentState);
			const existing = get(knownDevices);
			knownDevices.set([
				...existing.filter((d) => d.id !== client?.device.id),
				{ id: client.device.id, name: client.device.name, lastSeenAt: new Date().toISOString(), capabilities }
			]);
			userPreferences.update((v) => ({ ...v, lastSelectedDeviceId: client?.device.id }));
			status = `Connected: ${client.device.name}`;
			refreshDebug();
		} catch (error) {
			status = error instanceof Error ? error.message : 'Failed to connect.';
		} finally {
			busy = false;
		}
	}

	async function update(patch: Partial<DaikinControllerState>) {
		controller = { ...controller, ...patch };
		lastControllerState.set(controller);
		if (!client) return;

		try {
			await client.writeState(patch, {
				mode: protocolMode,
				preferredCharacteristicId: preferredCharacteristicId || undefined
			});
			status = `Sent command (${protocolMode})`;
		} catch (error) {
			status = error instanceof Error ? `Write failed: ${error.message}` : 'Write failed';
		}

		refreshDebug();
	}

	function disconnect() {
		client?.disconnect();
		client = null;
		debug = null;
		status = 'Disconnected';
	}

	onMount(() => {
		const restored = get(lastControllerState) ?? defaultState;
		controller = restored;
		target = restored.targetCelsius;
	});
</script>

<main class="container mx-auto max-w-6xl space-y-6 p-6">
	<header class="space-y-2">
		<h1 class="text-3xl font-bold">Daikin Bluetooth Controller</h1>
		<p class="text-muted-foreground">Local-only Web Bluetooth control for Daikin-compatible controllers.</p>
		<Badge variant={client ? 'default' : 'secondary'}>{status}</Badge>
	</header>

	<Card.Root>
		<Card.Header>
			<Card.Title>Connection</Card.Title>
			<Card.Description>Device picker allows all Bluetooth devices (no filter restrictions).</Card.Description>
		</Card.Header>
		<Card.Content class="flex flex-wrap gap-3">
			<Button onclick={connect} disabled={busy}>Connect device</Button>
			<Button onclick={disconnect} variant="outline" disabled={!client}>Disconnect</Button>
			<Button onclick={refreshDebug} variant="secondary" disabled={!client}>Refresh debug</Button>
		</Card.Content>
	</Card.Root>

	<Tabs.Root value="core">
		<Tabs.List class="grid w-full grid-cols-4">
			<Tabs.Trigger value="core">Core</Tabs.Trigger>
			<Tabs.Trigger value="airflow">Airflow</Tabs.Trigger>
			<Tabs.Trigger value="advanced">Advanced</Tabs.Trigger>
			<Tabs.Trigger value="debug">Debug</Tabs.Trigger>
		</Tabs.List>

		<Tabs.Content value="core">
			<Card.Root>
				<Card.Header><Card.Title>Power & temperature</Card.Title></Card.Header>
				<Card.Content class="space-y-6">
					<div class="flex items-center justify-between">
						<span>Power</span>
						<Switch checked={controller.power} onCheckedChange={(v) => update({ power: v })} />
					</div>
					<div class="space-y-2">
						<p>Mode</p>
						<Select.Root type="single" value={controller.mode} onValueChange={(v) => update({ mode: v as HvacMode })}>
							<Select.Trigger class="w-64">{modeLabels[controller.mode]}</Select.Trigger>
							<Select.Content>
								{#each Object.entries(modeLabels) as [value, label]}
									<Select.Item {value} {label}>{label}</Select.Item>
								{/each}
							</Select.Content>
						</Select.Root>
					</div>
					<div class="space-y-2">
						<p>Target temperature: {target.toFixed(1)}°C</p>
						<Slider
							type="single"
							value={target}
							max={32}
							min={16}
							step={0.5}
							onValueChange={(v: number) => {
								target = v;
								update({ targetCelsius: v });
							}}
						/>
					</div>
				</Card.Content>
			</Card.Root>
		</Tabs.Content>

		<Tabs.Content value="airflow">
			<Card.Root>
				<Card.Header><Card.Title>Fan & swing</Card.Title></Card.Header>
				<Card.Content class="space-y-4">
					<Select.Root type="single" value={controller.fanSpeed} onValueChange={(v) => update({ fanSpeed: v as FanSpeed })}>
						<Select.Trigger class="w-64">{controller.fanSpeed.toUpperCase()}</Select.Trigger>
						<Select.Content>
							{#each fanSpeeds as f}
								<Select.Item value={f} label={f.toUpperCase()}>{f.toUpperCase()}</Select.Item>
							{/each}
						</Select.Content>
					</Select.Root>
					<div class="grid grid-cols-2 gap-4">
						<Button variant={controller.swing === 'vertical' ? 'default' : 'outline'} onclick={() => update({ swing: 'vertical' })}>Vertical swing</Button>
						<Button variant={controller.swing === 'horizontal' ? 'default' : 'outline'} onclick={() => update({ swing: 'horizontal' })}>Horizontal swing</Button>
						<Button variant={controller.swing === 'both' ? 'default' : 'outline'} onclick={() => update({ swing: 'both' })}>3D swing</Button>
						<Button variant={controller.swing === 'off' ? 'default' : 'outline'} onclick={() => update({ swing: 'off' })}>Swing off</Button>
					</div>
				</Card.Content>
			</Card.Root>
		</Tabs.Content>

		<Tabs.Content value="advanced">
			<Card.Root>
				<Card.Header><Card.Title>Special features & timers</Card.Title></Card.Header>
				<Card.Content class="space-y-4">
					<div class="grid gap-3 md:grid-cols-2">
						{#each toggles as [label, key]}
							<div class="flex items-center justify-between rounded-md border p-3">
								<span>{label}</span>
								<Switch
									checked={Boolean(controller[key])}
									onCheckedChange={(v) => update({ [key]: v } as Partial<DaikinControllerState>)}
								/>
							</div>
						{/each}
					</div>
					<Separator />
					<div class="grid gap-4 md:grid-cols-2">
						<div class="space-y-2">
							<p class="text-sm font-medium">On timer</p>
							<Input
								type="time"
								value={`${String(controller.onTimer.hour).padStart(2, '0')}:${String(controller.onTimer.minute).padStart(2, '0')}`}
								onchange={(e) => {
									const [hour, minute] = (e.currentTarget as HTMLInputElement).value.split(':').map(Number);
									update({ onTimer: { ...controller.onTimer, hour, minute } });
								}}
							/>
						</div>
						<div class="space-y-2">
							<p class="text-sm font-medium">Off timer</p>
							<Input
								type="time"
								value={`${String(controller.offTimer.hour).padStart(2, '0')}:${String(controller.offTimer.minute).padStart(2, '0')}`}
								onchange={(e) => {
									const [hour, minute] = (e.currentTarget as HTMLInputElement).value.split(':').map(Number);
									update({ offTimer: { ...controller.offTimer, hour, minute } });
								}}
							/>
						</div>
					</div>
				</Card.Content>
			</Card.Root>
		</Tabs.Content>

		<Tabs.Content value="debug">
			<Card.Root>
				<Card.Header>
					<Card.Title>Debug + Protocol Routing</Card.Title>
					<Card.Description>
						Every command is logged to the browser console with payload text + hex, target characteristic, and notification events.
					</Card.Description>
				</Card.Header>
				<Card.Content class="space-y-4">
					<div class="grid gap-4 md:grid-cols-2">
						<div class="space-y-2">
							<p class="text-sm font-medium">Wire protocol</p>
							<Select.Root
								type="single"
								value={protocolMode}
								onValueChange={(v) => {
									protocolMode = v as WireProtocolMode;
									saveDebugPreferences();
								}}
							>
								<Select.Trigger>{protocolMode}</Select.Trigger>
								<Select.Content>
									<Select.Item value="json-patch" label="json-patch">json-patch</Select.Item>
									<Select.Item value="json-state" label="json-state">json-state</Select.Item>
									<Select.Item value="kv" label="kv">kv</Select.Item>
								</Select.Content>
							</Select.Root>
						</div>
						<div class="space-y-2">
							<p class="text-sm font-medium">Preferred writable characteristic ID</p>
							<Input
								placeholder="serviceUUID/characteristicUUID"
								value={preferredCharacteristicId}
								oninput={(e) => {
									preferredCharacteristicId = (e.currentTarget as HTMLInputElement).value;
									saveDebugPreferences();
								}}
							/>
						</div>
					</div>
					<Separator />
					<div class="space-y-2 text-sm">
						<p class="font-medium">Writable characteristics discovered</p>
						{#if debug && debug.writableCharacteristicIds.length > 0}
							<ul class="list-disc pl-5">
								{#each debug.writableCharacteristicIds as item}
									<li>{item}</li>
								{/each}
							</ul>
						{:else}
							<p class="text-muted-foreground">No writable characteristics found yet.</p>
						{/if}
					</div>
					<div class="space-y-2 text-sm">
						<p class="font-medium">Latest TX / RX</p>
						<p><strong>TX at:</strong> {debug?.lastWriteAt ?? 'n/a'}</p>
						<p><strong>TX text:</strong> {debug?.lastWriteText ?? 'n/a'}</p>
						<p><strong>TX hex:</strong> {debug?.lastWriteHex ?? 'n/a'}</p>
						<p><strong>RX at:</strong> {debug?.lastNotifyAt ?? 'n/a'}</p>
						<p><strong>RX hex:</strong> {debug?.lastNotifyHex ?? 'n/a'}</p>
					</div>
				</Card.Content>
			</Card.Root>
		</Tabs.Content>
	</Tabs.Root>
</main>
