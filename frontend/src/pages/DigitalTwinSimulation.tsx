'use client'

import React, { useEffect, useMemo, useState } from 'react'
import TrainMap from '../components/TrainMap'
import TimeDistanceChart from '../components/TimeDistanceChart'
import {
	createSimulationEngine,
	Disruption,
	DisruptionType,
	Station,
	TrainConfig,
} from '../simulationEngine'
import { computeKpis } from '../kpiCalculator' 

type Scenario = {
	id: string
	name: string
	disruptions: Disruption[]
}

const STATIONS: Station[] = [
	{ code: 'JBP', name: 'Jabalpur', distanceKm: 0, haltMinutes: 5, lat: 23.1815, lon: 79.9864 },
	{ code: 'MML', name: 'Madan Mahal', distanceKm: 6, haltMinutes: 2, lat: 23.1634, lon: 79.9322 },
	{ code: 'NU', name: 'Narsinghpur', distanceKm: 82, haltMinutes: 3, lat: 22.9485, lon: 79.1977 },
	{ code: 'GAR', name: 'Gadarwara', distanceKm: 130, haltMinutes: 2, lat: 22.9237, lon: 78.7847 },
	{ code: 'BKH', name: 'Bankhedi', distanceKm: 190, haltMinutes: 2, lat: 22.7335, lon: 78.5255 },
	{ code: 'PPI', name: 'Pipariya', distanceKm: 221, haltMinutes: 3, lat: 22.7619, lon: 78.3645 },
	{ code: 'ET', name: 'Itarsi', distanceKm: 338, haltMinutes: 0, lat: 22.606, lon: 77.759 },
]

const TRAINS: TrainConfig[] = [
	{
		trainId: 'P123',
		trainType: 'Passenger',
		speedKmph: 90,
		speedProfile: { cruise: 100, slow: 55 },
		color: '#d32f2f', // red for passenger
		stations: [
			{ stationCode: 'JBP', scheduledTimeMin: 0 },
			{ stationCode: 'MML', scheduledTimeMin: 10 },
			{ stationCode: 'NU', scheduledTimeMin: 90 },
			{ stationCode: 'GAR', scheduledTimeMin: 140 },
			{ stationCode: 'BKH', scheduledTimeMin: 190 },
			{ stationCode: 'PPI', scheduledTimeMin: 220 },
			{ stationCode: 'ET', scheduledTimeMin: 280 },
		],
	},
	{
		trainId: 'F789',
		trainType: 'Freight',
		speedKmph: 70,
		speedProfile: { cruise: 80, slow: 45 },
		color: '#2e7d32', // green for freight
		stations: [
			{ stationCode: 'JBP', scheduledTimeMin: 0 },
			{ stationCode: 'MML', scheduledTimeMin: 12 },
			{ stationCode: 'NU', scheduledTimeMin: 110 },
			{ stationCode: 'GAR', scheduledTimeMin: 170 },
			{ stationCode: 'BKH', scheduledTimeMin: 230 },
			{ stationCode: 'PPI', scheduledTimeMin: 270 },
			{ stationCode: 'ET', scheduledTimeMin: 350 },
		],
	},
]

const SCENARIOS: Scenario[] = [
	{
		id: 'signal',
		name: 'Signal failure (MML→NU)',
		disruptions: [
			{
				id: 'd1',
				type: 'signal_failure',
				description: 'Yellow aspect holding; expect restrictive movement',
				startStation: 'MML',
				endStation: 'NU',
				startAtMin: 25,
				durationMin: 30,
				speedReduction: { Passenger: 0.55, Freight: 0.45 },
			},
		],
	},
	{
		id: 'track-block',
		name: 'Track block (NU→GAR)',
		disruptions: [
			{
				id: 'd2',
				type: 'track_block',
				description: 'Planned maintenance block between NU and GAR',
				startStation: 'NU',
				endStation: 'GAR',
				startAtMin: 70,
				durationMin: 40,
				speedReduction: { Passenger: 0.35, Freight: 0.25 },
			},
		],
	},
	{
		id: 'weather',
		name: 'Weather slowdown (BKH→ET)',
		disruptions: [
			{
				id: 'd3',
				type: 'weather_slowdown',
				description: 'Fog + TSR 45 km/h',
				startStation: 'BKH',
				endStation: 'ET',
				startAtMin: 130,
				durationMin: 90,
				speedReduction: { Passenger: 0.6, Freight: 0.5 },
			},
		],
	},
	{
		id: 'clean',
		name: 'No disruption (baseline)',
		disruptions: [],
	},
]

const disruptionColor: Record<DisruptionType, string> = {
	signal_failure: 'bg-amber-100 text-amber-800 border-amber-200',
	track_block: 'bg-rose-100 text-rose-800 border-rose-200',
	weather_slowdown: 'bg-blue-100 text-blue-800 border-blue-200',
}

export default function DigitalTwinSimulation() {
	const [engine] = useState(() => createSimulationEngine({ stations: STATIONS, trains: TRAINS }))
	const [snapshot, setSnapshot] = useState(engine.getState())
	const [selectedScenario, setSelectedScenario] = useState<Scenario>(SCENARIOS[0])
	const [speedMultiplier, setSpeedMultiplier] = useState(1.5)
	const [showPassenger, setShowPassenger] = useState(true)
	const [showFreight, setShowFreight] = useState(true)
	const viewMode: 'inline' | 'outline' = 'inline'
	const [notif, setNotif] = useState<{
		title: string
		description: string
		variant: 'info' | 'success' | 'warning'
	} | null>(null)
	const prioritizationRecs = useMemo(
		() => [
			{ id: 'r1', action: 'Give precedence: Express 2215 before Passenger 1432', impact: 'Saves ~45 mins cumulative delay' },
			{ id: 'r2', action: 'Hold Freight F902 for 6 mins at Bina Jn.', impact: 'Prevents platform conflict for 12002' },
			{ id: 'r3', action: 'Reroute Passenger 1735 → Platform 3 at Itarsi', impact: 'Avoids clash with Express 2299' },
			{ id: 'r4', action: 'Regulate Passenger 1207 to 50 km/h for next 12 km', impact: 'Prevents bunching; saves ~8 mins' },
		],
		[]
	)
	const showNotif = (payload: { title: string; description: string; variant: 'info' | 'success' | 'warning' }) => {
		setNotif(payload)
		setTimeout(() => setNotif(null), 2400)
	}
	const handleWhy = (rec: { action: string; impact: string }) =>
		showNotif({ title: 'Why this?', description: rec.impact, variant: 'info' })
	const handleApply = (rec: { action: string; impact: string }) =>
		showNotif({ title: 'Applied recommendation', description: rec.action, variant: 'success' })
	const handleOverride = (rec: { action: string; impact: string }) =>
		showNotif({ title: 'Override noted', description: rec.action, variant: 'warning' })
	const visibleTrainIds = useMemo(
		() =>
			TRAINS.filter((t) => {
				if (t.trainType === 'Passenger' && !showPassenger) return false
				if (t.trainType === 'Freight' && !showFreight) return false
				return true
			}).map((t) => t.trainId),
		[showPassenger, showFreight]
	)

	useEffect(() => {
		const unsub = engine.subscribe(setSnapshot)
		return () => unsub()
	}, [engine])

	useEffect(() => {
		engine.setDisruptions(selectedScenario.disruptions)
		engine.reset()
		engine.start()
	}, [engine, selectedScenario])

	useEffect(() => {
		engine.setSpeedMultiplier(speedMultiplier)
	}, [engine, speedMultiplier])

	const kpis = useMemo(() => computeKpis(snapshot, STATIONS, TRAINS), [snapshot])

	const passengerDelay = snapshot.trains['P123']?.delayMin ?? 0
	const freightDelay = snapshot.trains['F789']?.delayMin ?? 0

	return (
		<div className="min-h-screen bg-slate-50 p-6 space-y-6">
			<header className="flex flex-wrap items-center justify-between gap-3">
				<div>
					<h1 className="text-4xl font-extrabold text-slate-900">Jabalpur → Itarsi Digital Twin</h1>
					<p className="text-slate-600">
						Real-time time–distance + map with two trains (Passenger solid, Freight dashed) and live KPIs.
					</p>
				</div>
				<div className="flex items-center gap-3">
					<button
						onClick={() => engine.reset()}
						className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-800 shadow-sm hover:bg-slate-100"
					>
						Reset
					</button>
					<button
						onClick={() => (snapshot.running ? engine.pause() : engine.start())}
						className={`rounded-lg px-4 py-2 text-sm font-semibold shadow-sm ${
							snapshot.running ? 'bg-amber-500 text-white hover:bg-amber-600' : 'bg-emerald-600 text-white hover:bg-emerald-700'
						}`}
					>
						{snapshot.running ? 'Pause' : 'Resume'}
					</button>
				</div>
			</header>

			{/* Top row: chart left, scenario + KPIs right */}
			<section className="grid grid-cols-1 xl:grid-cols-4 gap-4">
				<div className="xl:col-span-3">
					<TimeDistanceChart
						title="Time vs Distance Simulation"
						stations={STATIONS}
						trains={TRAINS}
						snapshot={snapshot}
						visibleTrainIds={visibleTrainIds}
					/>
				</div>
				<div className="xl:col-span-1 space-y-4">
					<div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
						<div className="flex items-center justify-between mb-3">
							<div>
								<div className="text-xs uppercase font-semibold text-slate-500">Scenario</div>
								<div className="text-lg font-bold text-slate-800">{selectedScenario.name}</div>
							</div>
							<select
								value={selectedScenario.id}
								onChange={(e) => {
									const next = SCENARIOS.find((s) => s.id === e.target.value)
									if (next) setSelectedScenario(next)
								}}
								className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-800"
							>
								{SCENARIOS.map((s) => (
									<option key={s.id} value={s.id}>
										{s.name}
									</option>
								))}
							</select>
						</div>
						<div className="space-y-2">
							{selectedScenario.disruptions.length === 0 && (
								<div className="text-sm text-slate-600">No active disruptions. Baseline run.</div>
							)}
							{selectedScenario.disruptions.map((d) => (
								<div
									key={d.id}
									className={`rounded-xl border px-3 py-2 text-sm ${disruptionColor[d.type]}`}
								>
									<div className="font-semibold">{d.description}</div>
									<div className="text-xs">
										{d.startStation} → {d.endStation} • {d.durationMin} min • starts @ {d.startAtMin} min
									</div>
									<div className="text-xs">
										Speed factors P/F: {Math.round(d.speedReduction.Passenger * 100)}% /
										{Math.round(d.speedReduction.Freight * 100)}%
									</div>
								</div>
							))}
						</div>
					</div>

					<div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm space-y-3">
						<div className="text-xs uppercase text-slate-500 font-semibold">Live KPIs</div>
						<div className="grid grid-cols-2 gap-3">
							<div className="rounded-xl bg-blue-50 p-3">
								<div className="text-xs text-blue-700 font-semibold">OTP</div>
								<div className="text-2xl font-bold text-blue-900">{kpis.otpPercent}%</div>
							</div>
							<div className="rounded-xl bg-amber-50 p-3">
								<div className="text-xs text-amber-700 font-semibold">Passenger delay</div>
								<div className="text-xl font-bold text-amber-900">{passengerDelay.toFixed(1)} min</div>
							</div>
							<div className="rounded-xl bg-emerald-50 p-3">
								<div className="text-xs text-emerald-700 font-semibold">Freight delay</div>
								<div className="text-xl font-bold text-emerald-900">{freightDelay.toFixed(1)} min</div>
							</div>
							<div className="rounded-xl bg-slate-50 p-3">
								<div className="text-xs text-slate-700 font-semibold">Delay ratio P/F</div>
								<div className="text-xl font-bold text-slate-900">{kpis.delayRatioPassengerFreight}</div>
							</div>
						</div>
						<div className="grid grid-cols-1 gap-2 text-sm">
							<div className="flex items-center justify-between">
								<span className="text-slate-600">Avg delay Passenger</span>
								<span className="font-semibold text-slate-900">
									{kpis.avgDelayByType['Passenger'] ?? 0} min
								</span>
							</div>
							<div className="flex items-center justify-between">
								<span className="text-slate-600">Avg delay Freight</span>
								<span className="font-semibold text-slate-900">{kpis.avgDelayByType['Freight'] ?? 0} min</span>
							</div>
							<div className="flex items-center justify-between">
								<span className="text-slate-600">Recovery time</span>
								<span className="font-semibold text-slate-900">{kpis.recoveryTimeAfterDisruption} min</span>
							</div>
							<div className="flex items-center justify-between">
								<span className="text-slate-600">Trains affected</span>
								<span className="font-semibold text-slate-900">{kpis.trainsAffected}/2</span>
							</div>
						</div>
					</div>
				</div>
			</section>

			{/* Second row: controls + map */}
			<section className="space-y-4">
				<div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
					<div className="rounded-2xl bg-white border border-slate-200 p-4 shadow-sm">
						<div className="text-xs uppercase text-slate-500 font-semibold">Speed</div>
						<div className="flex items-center gap-3">
							<input
								type="range"
								min={0.5}
								max={3}
								step={0.1}
								value={speedMultiplier}
								onChange={(e) => setSpeedMultiplier(parseFloat(e.target.value))}
								className="w-full accent-blue-600"
							/>
							<div className="text-lg font-bold text-slate-800">{speedMultiplier.toFixed(1)}×</div>
						</div>
						<p className="text-xs text-slate-500 mt-1">requestAnimationFrame paced</p>
					</div>
					<div className="rounded-2xl bg-white border border-slate-200 p-4 shadow-sm">
						<div className="text-xs uppercase text-slate-500 font-semibold mb-2">Visibility</div>
						<div className="flex items-center gap-4 text-sm">
							<label className="flex items-center gap-2">
								<input
									type="checkbox"
									checked={showPassenger}
									onChange={(e) => setShowPassenger(e.target.checked)}
								/>
								<span>Passenger</span>
							</label>
							<label className="flex items-center gap-2">
								<input
									type="checkbox"
									checked={showFreight}
									onChange={(e) => setShowFreight(e.target.checked)}
								/>
								<span>Freight</span>
							</label>
						</div>
					</div>
				</div>

				<div className="grid grid-cols-1 xl:grid-cols-2 gap-4 items-start">
					<TrainMap
						stations={STATIONS}
						trains={TRAINS}
						snapshot={snapshot}
						showPassenger={showPassenger}
						showFreight={showFreight}
						viewMode={viewMode}
					/>

					<div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm h-full">
						<div className="flex items-center justify-between mb-3">
							<div>
								<div className="text-xs uppercase font-semibold text-slate-500">AI Assistant</div>
								<div className="text-lg font-bold text-slate-800">Smart Train Prioritization</div>
							</div>
						</div>
						<div className="space-y-3">
							{prioritizationRecs.map((rec) => (
								<div key={rec.id} className="rounded-xl border border-slate-200 p-3 space-y-2">
									<div className="text-sm font-semibold text-slate-900">{rec.action}</div>
									<div className="text-xs text-slate-600 mt-1">{rec.impact}</div>
									<div className="flex flex-wrap gap-2 text-xs">
										<button
											className="px-3 py-1 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100"
											onClick={() => handleWhy(rec)}
										>
											Why?
										</button>
										<button
											className="px-3 py-1 rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100"
											onClick={() => handleApply(rec)}
										>
											Apply
										</button>
										<button
											className="px-3 py-1 rounded-lg border border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100"
											onClick={() => handleOverride(rec)}
										>
											Override
										</button>
									</div>
								</div>
							))}
						</div>
					</div>
				</div>
			</section>

			{notif && (
				<div
					className={`fixed top-6 right-6 z-50 rounded-xl border shadow-lg px-4 py-3 max-w-xs transition-opacity ${
						notif.variant === 'success'
							? 'bg-emerald-50 border-emerald-200 text-emerald-900'
							: notif.variant === 'warning'
							? 'bg-amber-50 border-amber-200 text-amber-900'
							: 'bg-white border-slate-200 text-slate-900'
					}`}
				>
					<div className="text-sm font-semibold">{notif.title}</div>
					<div className="text-xs mt-1">{notif.description}</div>
				</div>
			)}
		</div>
	)
}


