'use client'

import React, { useEffect, useMemo, useState } from 'react'
import TrainMap from '../components/TrainMap'
import TimeDistanceChart from '../components/TimeDistanceChart'
import DisruptionController from '../components/DisruptionController'
import {
	createSimulationEngine,
	Disruption,
	DisruptionType,
	Station,
	TrainConfig,
	PrioritizationDecision,
} from '../simulationEngine'
import { computeKpis } from '../kpiCalculator'
import { fetchDigitalTwinScenarios, type WhatIfScenario } from '../lib/api'
import { analyzePrioritization, type PrioritizationRecommendation } from '../prioritizationAnalyzer'

const division = 'itarsi_bhopal' // Division for loading scenarios 

type Scenario = {
	id: string
	name: string
	disruptions: Disruption[]
}

const STATIONS: Station[] = [
	{ code: 'ET', name: 'Itarsi Junction', distanceKm: 0, haltMinutes: 5, lat: 22.6060, lon: 77.7590 },
	{ code: 'NDPM', name: 'Narmadapuram', distanceKm: 18, haltMinutes: 2, lat: 22.7440, lon: 77.7275 },
	{ code: 'ODG', name: 'Obaidullaganj', distanceKm: 45, haltMinutes: 3, lat: 22.9930, lon: 77.5850 },
	{ code: 'MDDP', name: 'Mandideep', distanceKm: 65, haltMinutes: 2, lat: 23.0825, lon: 77.5290 },
	{ code: 'MSO', name: 'Misrod', distanceKm: 78, haltMinutes: 2, lat: 23.1789, lon: 77.4648 },
	{ code: 'RKMP', name: 'Rani Kamalapati', distanceKm: 90, haltMinutes: 3, lat: 23.2355, lon: 77.4332 },
	{ code: 'BPL', name: 'Bhopal Junction', distanceKm: 96, haltMinutes: 0, lat: 23.2599, lon: 77.4029 },
]

// Generate 10 passenger trains
const generatePassengerTrains = (): TrainConfig[] => {
	const trains: TrainConfig[] = []
	const colors = ['#d32f2f', '#ef4444', '#f87171', '#dc2626', '#b91c1c', '#991b1b', '#7f1d1d', '#991b1b', '#b91c1c', '#dc2626']
	
	for (let i = 0; i < 10; i++) {
		const startTime = i * 45 // Every 45 minutes
		const baseSpeed = 90 + (i % 3) * 5 // Vary speed slightly
		
		trains.push({
			trainId: `P${12900 + i}`,
			trainType: 'Passenger',
			speedKmph: baseSpeed,
			speedProfile: { cruise: baseSpeed + 10, slow: 55 },
			color: colors[i],
			stations: [
				{ stationCode: 'ET', scheduledTimeMin: startTime },
				{ stationCode: 'NDPM', scheduledTimeMin: startTime + 15 },
				{ stationCode: 'ODG', scheduledTimeMin: startTime + 35 },
				{ stationCode: 'MDDP', scheduledTimeMin: startTime + 50 },
				{ stationCode: 'MSO', scheduledTimeMin: startTime + 60 },
				{ stationCode: 'RKMP', scheduledTimeMin: startTime + 70 },
				{ stationCode: 'BPL', scheduledTimeMin: startTime + 80 },
			],
		})
	}
	return trains
}

// Generate 20 freight trains
const generateFreightTrains = (): TrainConfig[] => {
	const trains: TrainConfig[] = []
	const colors = ['#2e7d32', '#16a34a', '#22c55e', '#15803d', '#166534', '#14532d', '#15803d', '#166534', '#14532d', '#16a34a',
	                 '#22c55e', '#15803d', '#166534', '#14532d', '#16a34a', '#22c55e', '#15803d', '#166534', '#14532d', '#16a34a']
	
	for (let i = 0; i < 20; i++) {
		const startTime = i * 30 // Every 30 minutes
		const baseSpeed = 70 + (i % 3) * 3 // Vary speed slightly
		
		trains.push({
			trainId: `F${80000 + i}`,
			trainType: 'Freight',
			speedKmph: baseSpeed,
			speedProfile: { cruise: baseSpeed + 10, slow: 45 },
			color: colors[i],
			stations: [
				{ stationCode: 'ET', scheduledTimeMin: startTime },
				{ stationCode: 'NDPM', scheduledTimeMin: startTime + 20 },
				{ stationCode: 'ODG', scheduledTimeMin: startTime + 50 },
				{ stationCode: 'MDDP', scheduledTimeMin: startTime + 70 },
				{ stationCode: 'MSO', scheduledTimeMin: startTime + 85 },
				{ stationCode: 'RKMP', scheduledTimeMin: startTime + 100 },
				{ stationCode: 'BPL', scheduledTimeMin: startTime + 110 },
			],
		})
	}
	return trains
}

const TRAINS: TrainConfig[] = [
	...generatePassengerTrains(),
	...generateFreightTrains(),
]

// Helper function to convert backend WhatIfScenario to frontend Scenario
const convertScenario = (backendScenario: WhatIfScenario): Scenario => {
	try {
		const disruptions: Disruption[] = (backendScenario.disruptions || []).map((d, idx) => {
			// Map disruption type with fallback
			let type: DisruptionType = 'signal_failure'
			const disruptionType = d.type || 'signal_failure'
			if (disruptionType === 'track_block') type = 'track_block'
			else if (disruptionType === 'weather_slowdown') type = 'weather_slowdown'
			else if (disruptionType === 'rolling_stock') type = 'rolling_stock'
			else if (disruptionType === 'operational') type = 'operational'
			else if (disruptionType === 'platform_issue' || disruptionType === 'platform_congestion') type = 'platform_issue'
			else if (disruptionType === 'emergency') type = 'emergency'
			else if (disruptionType === 'multiple') type = 'multiple'
			else if (disruptionType === 'high_traffic') type = 'high_traffic'
			else if (disruptionType === 'peak_capacity') type = 'peak_capacity'
			
			// Calculate speed reduction based on disruption type and impact
			const speedReductionFactor = d.speedReductionFactor ?? 0.3
			const passengerSpeed = Math.max(0, 1 - (speedReductionFactor * 0.5)) // Passenger gets less reduction
			const freightSpeed = Math.max(0, 1 - speedReductionFactor) // Freight gets full reduction
			
			// For complete blocks, set speed to 0
			const passengerReduction = d.completeBlock ? 0 : Math.max(0.1, passengerSpeed)
			const freightReduction = d.completeBlock ? 0 : Math.max(0.1, freightSpeed)
			
			// Generate description safely
			const typeName = disruptionType.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
			const description = d.description || `${typeName} - ${d.startStation || 'ET'} → ${d.endStation || 'BPL'}`
			
			return {
				id: `d_${backendScenario.id}_${idx}`,
				type,
				description,
				startStation: d.startStation || 'ET',
				endStation: d.endStation || 'BPL',
				startAtMin: d.startDelay ?? 20, // Default start delay
				durationMin: d.durationMinutes ?? 30,
				speedReduction: {
					Passenger: passengerReduction,
					Freight: freightReduction,
				},
			}
		})
		
		return {
			id: backendScenario.id || `scenario_${Date.now()}`,
			name: backendScenario.name || 'Unknown Scenario',
			disruptions,
		}
	} catch (error) {
		console.error('Error converting scenario:', error, backendScenario)
		// Return a safe fallback scenario
		return {
			id: backendScenario.id || `scenario_error_${Date.now()}`,
			name: backendScenario.name || 'Error Loading Scenario',
			disruptions: [],
		}
	}
}

// Default scenarios (fallback if API fails)
const DEFAULT_SCENARIOS: Scenario[] = [
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
	rolling_stock: 'bg-purple-100 text-purple-800 border-purple-200',
	operational: 'bg-orange-100 text-orange-800 border-orange-200',
	platform_issue: 'bg-pink-100 text-pink-800 border-pink-200',
	platform_congestion: 'bg-pink-100 text-pink-800 border-pink-200',
	emergency: 'bg-red-100 text-red-800 border-red-200',
	multiple: 'bg-yellow-100 text-yellow-800 border-yellow-200',
	high_traffic: 'bg-indigo-100 text-indigo-800 border-indigo-200',
	peak_capacity: 'bg-teal-100 text-teal-800 border-teal-200',
}

export default function DigitalTwinSimulation() {
	const [engine] = useState(() => createSimulationEngine({ stations: STATIONS, trains: TRAINS }))
	const [snapshot, setSnapshot] = useState(engine.getState())
	const [scenarios, setScenarios] = useState<Scenario[]>(DEFAULT_SCENARIOS)
	const [selectedScenario, setSelectedScenario] = useState<Scenario>(DEFAULT_SCENARIOS[0])
	const [loadingScenarios, setLoadingScenarios] = useState(true)
	const [showPassenger, setShowPassenger] = useState(true)
	const [showFreight, setShowFreight] = useState(true)
	const viewMode: 'inline' | 'outline' = 'inline'
	const [notif, setNotif] = useState<{
		title: string
		description: string
		variant: 'info' | 'success' | 'warning'
	} | null>(null)
	
	// Load scenarios from backend
	useEffect(() => {
		const loadScenarios = async () => {
			try {
				setLoadingScenarios(true)
				const response = await fetchDigitalTwinScenarios(division)
				const backendScenarios = response?.scenarios || []
				
				// Convert backend scenarios to frontend format with error handling
				const convertedScenarios = backendScenarios
					.map(convertScenario)
					.filter(s => s && s.id && s.name) // Filter out invalid scenarios
				
				// Add baseline scenario at the beginning
				const allScenarios = [
					{
						id: 'clean',
						name: 'No disruption (baseline)',
						disruptions: [],
					},
					...convertedScenarios
				]
				
				if (allScenarios.length > 0) {
					setScenarios(allScenarios)
					// Keep current selection if it exists, otherwise select first
					const currentId = selectedScenario.id
					const existing = allScenarios.find(s => s.id === currentId)
					setSelectedScenario(existing || allScenarios[0])
				} else {
					setScenarios(DEFAULT_SCENARIOS)
					setSelectedScenario(DEFAULT_SCENARIOS[0])
				}
			} catch (err) {
				console.error('Failed to load scenarios:', err)
				// Use default scenarios on error
				setScenarios(DEFAULT_SCENARIOS)
				setSelectedScenario(DEFAULT_SCENARIOS[0])
			} finally {
				setLoadingScenarios(false)
			}
		}
		
		loadScenarios()
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [])
	const prioritizationRecs = useMemo(() => {
		// Always analyze - the analyzer will return empty array if no disruptions
		const recs = analyzePrioritization(snapshot, TRAINS, STATIONS)
		// Debug logging
		if (snapshot.disruptions.length > 0 && recs.length === 0) {
			console.log('Disruptions exist but no recommendations:', {
				disruptions: snapshot.disruptions,
				snapshotTime: snapshot.simTimeMin,
				trainsCount: TRAINS.length
			})
		}
		return recs
	}, [snapshot.disruptions, snapshot.simTimeMin, snapshot.trains, selectedScenario])

	const [selectedRec, setSelectedRec] = useState<PrioritizationRecommendation | null>(null)
	const [showImpactModal, setShowImpactModal] = useState(false)
	const [activeTab, setActiveTab] = useState<'applied' | 'overridden'>('applied')

	const showNotif = (payload: { title: string; description: string; variant: 'info' | 'success' | 'warning' }) => {
		setNotif(payload)
		setTimeout(() => setNotif(null), 4000)
	}

	const handleWhy = (rec: PrioritizationRecommendation) => {
		setSelectedRec(rec)
		setActiveTab('applied')
		setShowImpactModal(true)
	}

	const handleApply = (rec: PrioritizationRecommendation) => {
		const decision: PrioritizationDecision = {
			id: rec.id,
			trainId: rec.trainId,
			action: rec.action,
			description: rec.description,
			impact: rec.impact,
			appliedAt: snapshot.simTimeMin,
			applied: true,
			overridden: false,
			expectedDelayReduction: rec.expectedDelayReduction,
			affectedTrains: rec.affectedTrains,
			stationCode: rec.stationCode,
			durationMin: rec.durationMin,
			speedKmph: rec.speedKmph,
		}
		
		engine.applyPrioritizationDecision(decision)
		
		const systemDelayReduction = Math.round(rec.detailedImpact.whatIfApplied.totalSystemDelayReduction)
		const affectedCount = rec.detailedImpact.affectedTrains.length
		
		showNotif({
			title: '✅ Decision Applied Successfully',
			description: `${rec.description}. Expected system delay reduction: ~${systemDelayReduction} minutes. Affecting ${affectedCount} train(s). Check graph for visualization.`,
			variant: 'success'
		})
	}

	const handleOverride = (rec: PrioritizationRecommendation) => {
		// Mark as overridden if it was already applied
		const existingDecision = snapshot.prioritizationDecisions.find(d => d.id === rec.id)
		if (existingDecision && existingDecision.applied) {
			engine.overridePrioritizationDecision(rec.id)
		} else {
			// Create override decision (marked as overridden from start)
			const decision: PrioritizationDecision = {
				id: rec.id,
				trainId: rec.trainId,
				action: rec.action,
				description: rec.description,
				impact: rec.impact,
				appliedAt: snapshot.simTimeMin,
				applied: false,
				overridden: true,
				expectedDelayReduction: rec.expectedDelayReduction,
				affectedTrains: rec.affectedTrains,
				stationCode: rec.stationCode,
				durationMin: rec.durationMin,
				speedKmph: rec.speedKmph,
			}
			// Add to state but mark as overridden
			engine.applyPrioritizationDecision(decision)
			engine.overridePrioritizationDecision(rec.id)
		}
		
		const systemDelayIncrease = Math.round(rec.detailedImpact.whatIfOverridden.totalSystemDelayIncrease)
		const affectedCount = rec.detailedImpact.affectedTrains.length
		
		showNotif({
			title: '⚠️ Decision Overridden',
			description: `Override: ${rec.description}. Expected system delay increase: ~${systemDelayIncrease} minutes. Affecting ${affectedCount} train(s). Alternative scenario will be applied.`,
			variant: 'warning'
		})
	}
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

	const kpis = useMemo(() => computeKpis(snapshot, STATIONS, TRAINS), [snapshot])

	// Calculate average delays for passenger and freight trains
	const passengerDelays = TRAINS
		.filter(t => t.trainType === 'Passenger')
		.map(t => snapshot.trains[t.trainId]?.delayMin ?? 0)
	const freightDelays = TRAINS
		.filter(t => t.trainType === 'Freight')
		.map(t => snapshot.trains[t.trainId]?.delayMin ?? 0)
	
	const passengerDelay = passengerDelays.length > 0 
		? passengerDelays.reduce((a, b) => a + b, 0) / passengerDelays.length 
		: 0
	const freightDelay = freightDelays.length > 0 
		? freightDelays.reduce((a, b) => a + b, 0) / freightDelays.length 
		: 0

	return (
		<div className="min-h-screen bg-slate-50 p-6 space-y-6">
			{/* Header Section */}
			<header className="flex flex-wrap items-center justify-between gap-4 mb-2">
				<div className="flex-1 min-w-0">
					<h1 className="text-3xl sm:text-4xl font-extrabold text-slate-900 mb-1">Itarsi → Bhopal Digital Twin</h1>
					<p className="text-sm sm:text-base text-slate-600">
						Real-time time–distance + map with {TRAINS.length} trains (10 Passenger, 20 Freight) and live KPIs.
					</p>
				</div>
				<div className="flex items-center gap-3 flex-shrink-0">
					<button
						onClick={() => engine.reset()}
						className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-800 shadow-sm hover:bg-slate-100 transition-colors"
					>
						Reset
					</button>
					<button
						onClick={() => (snapshot.running ? engine.pause() : engine.start())}
						className={`rounded-lg px-4 py-2 text-sm font-semibold shadow-sm transition-colors ${
							snapshot.running ? 'bg-amber-500 text-white hover:bg-amber-600' : 'bg-emerald-600 text-white hover:bg-emerald-700'
						}`}
					>
						{snapshot.running ? 'Pause' : 'Resume'}
					</button>
				</div>
			</header>

			{/* Top row: chart left, scenario + KPIs right */}
			<section className="grid grid-cols-1 xl:grid-cols-4 gap-4">
				{/* Time-Distance Chart */}
				<div className="xl:col-span-3">
					<div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
						<TimeDistanceChart
							title="Time vs Distance Simulation"
							stations={STATIONS}
							trains={TRAINS}
							snapshot={snapshot}
							visibleTrainIds={visibleTrainIds}
						/>
					</div>
				</div>
				
				{/* Right Sidebar: Scenario, Disruption Controller, KPIs */}
				<div className="xl:col-span-1 space-y-4">
					{/* Scenario Panel */}
					<div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
						<div className="mb-3">
							<div className="text-xs uppercase font-semibold text-slate-500 mb-2">Scenario</div>
							<select
								value={selectedScenario.id}
								onChange={(e) => {
									const next = scenarios.find((s) => s.id === e.target.value)
									if (next) setSelectedScenario(next)
								}}
								disabled={loadingScenarios}
								className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-800 disabled:opacity-50 disabled:cursor-not-allowed"
							>
								{loadingScenarios ? (
									<option>Loading scenarios...</option>
								) : (
									scenarios.map((s) => (
										<option key={s.id} value={s.id}>
											{s.name}
										</option>
									))
								)}
							</select>
						</div>
						<div className="space-y-2 max-h-48 overflow-y-auto">
							{selectedScenario.disruptions.length === 0 && (
								<div className="text-sm text-slate-600 py-1">No active disruptions. Baseline run.</div>
							)}
							{selectedScenario.disruptions.map((d) => (
								<div
									key={d.id}
									className={`rounded-xl border px-3 py-2 text-sm ${disruptionColor[d.type]}`}
								>
									<div className="font-semibold text-xs mb-1">{d.description}</div>
									<div className="text-xs opacity-90">
										{d.startStation} → {d.endStation} • {d.durationMin} min • starts @ {d.startAtMin} min
									</div>
									<div className="text-xs opacity-80 mt-1">
										Speed factors P/F: {Math.round(d.speedReduction.Passenger * 100)}% / {Math.round(d.speedReduction.Freight * 100)}%
									</div>
								</div>
							))}
						</div>
					</div>

					{/* Disruption Controller - Below Scenario */}
					<DisruptionController
						stations={STATIONS}
						onApplyDisruption={(disruption) => {
							engine.addDisruption(disruption)
							showNotif({
								title: 'Disruption Applied',
								description: `${disruption.description} at ${disruption.startStation} → ${disruption.endStation}`,
								variant: 'success'
							})
						}}
						onClearDisruptions={() => {
							engine.clearDisruptions()
							showNotif({
								title: 'Disruptions Cleared',
								description: 'All disruptions have been removed',
								variant: 'info'
							})
						}}
					/>

					{/* Live KPIs Panel */}
					<div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm space-y-3">
						<div className="text-xs uppercase text-slate-500 font-semibold mb-2">Live KPIs</div>
						<div className="grid grid-cols-2 gap-3">
							<div className="rounded-xl bg-blue-50 border border-blue-100 p-3">
								<div className="text-xs text-blue-700 font-semibold mb-1">OTP</div>
								<div className="text-2xl font-bold text-blue-900">
									{isNaN(kpis.otpPercent) ? 0 : kpis.otpPercent}%
								</div>
							</div>
							<div className="rounded-xl bg-amber-50 border border-amber-100 p-3">
								<div className="text-xs text-amber-700 font-semibold mb-1">Passenger delay</div>
								<div className="text-xl font-bold text-amber-900">
									{isNaN(passengerDelay) ? '0.0' : passengerDelay.toFixed(1)} min
								</div>
							</div>
							<div className="rounded-xl bg-emerald-50 border border-emerald-100 p-3">
								<div className="text-xs text-emerald-700 font-semibold mb-1">Freight delay</div>
								<div className="text-xl font-bold text-emerald-900">
									{isNaN(freightDelay) ? '0.0' : freightDelay.toFixed(1)} min
								</div>
							</div>
							<div className="rounded-xl bg-slate-50 border border-slate-100 p-3">
								<div className="text-xs text-slate-700 font-semibold mb-1">Delay ratio P/F</div>
								<div className="text-xl font-bold text-slate-900">
									{isNaN(kpis.delayRatioPassengerFreight) || !isFinite(kpis.delayRatioPassengerFreight) 
										? 'N/A' 
										: kpis.delayRatioPassengerFreight.toFixed(2)}
								</div>
							</div>
						</div>
						<div className="grid grid-cols-1 gap-2 text-sm pt-2 border-t border-slate-200">
							<div className="flex items-center justify-between py-1">
								<span className="text-slate-600">Avg delay Passenger</span>
								<span className="font-semibold text-slate-900">
									{kpis.avgDelayByType['Passenger'] ?? 0} min
								</span>
							</div>
							<div className="flex items-center justify-between py-1">
								<span className="text-slate-600">Avg delay Freight</span>
								<span className="font-semibold text-slate-900">{kpis.avgDelayByType['Freight'] ?? 0} min</span>
							</div>
							<div className="flex items-center justify-between py-1">
								<span className="text-slate-600">Recovery time</span>
								<span className="font-semibold text-slate-900">{kpis.recoveryTimeAfterDisruption} min</span>
							</div>
							<div className="flex items-center justify-between py-1">
								<span className="text-slate-600">Trains affected</span>
								<span className="font-semibold text-slate-900">{kpis.trainsAffected}/{TRAINS.length}</span>
							</div>
						</div>
					</div>
				</div>
			</section>

			{/* Second row: Map and AI Assistant */}
			<section className="grid grid-cols-1 xl:grid-cols-2 gap-4">
				{/* Railway Map */}
				<div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
					<div className="p-4 border-b border-slate-200 bg-slate-50">
						<div className="text-xs uppercase font-semibold text-slate-500 mb-1">Railway Network Map</div>
						<div className="flex items-center gap-4 text-sm mt-2">
							<label className="flex items-center gap-2 cursor-pointer">
								<input
									type="checkbox"
									checked={showPassenger}
									onChange={(e) => setShowPassenger(e.target.checked)}
									className="w-4 h-4 text-blue-600 border-slate-300 rounded focus:ring-2 focus:ring-blue-500"
								/>
								<span className="text-slate-700 font-medium">Passenger</span>
							</label>
							<label className="flex items-center gap-2 cursor-pointer">
								<input
									type="checkbox"
									checked={showFreight}
									onChange={(e) => setShowFreight(e.target.checked)}
									className="w-4 h-4 text-green-600 border-slate-300 rounded focus:ring-2 focus:ring-green-500"
								/>
								<span className="text-slate-700 font-medium">Freight</span>
							</label>
						</div>
					</div>
					<TrainMap
						stations={STATIONS}
						trains={TRAINS}
						snapshot={snapshot}
						showPassenger={showPassenger}
						showFreight={showFreight}
						viewMode={viewMode}
					/>
				</div>

				{/* AI Assistant Panel */}
				<div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
					<div className="mb-4 pb-3 border-b border-slate-200">
						<div className="text-xs uppercase font-semibold text-slate-500 mb-1">AI Assistant</div>
						<div className="text-lg font-bold text-slate-800">Smart Train Prioritization</div>
						<div className="text-xs text-slate-600 mt-1">
							{prioritizationRecs.length > 0 
								? `${prioritizationRecs.length} recommendation${prioritizationRecs.length > 1 ? 's' : ''} based on ${snapshot.disruptions.length} disruption${snapshot.disruptions.length > 1 ? 's' : ''}`
								: snapshot.disruptions.length > 0
								? `Analyzing ${snapshot.disruptions.length} disruption${snapshot.disruptions.length > 1 ? 's' : ''}...`
								: 'No active disruptions - monitoring system'}
						</div>
					</div>
					<div className="space-y-3 max-h-[600px] overflow-y-auto">
						{prioritizationRecs.length === 0 ? (
							<div className="text-sm text-slate-500 text-center py-8">
								<div className="text-2xl mb-2">✓</div>
								<div>No prioritization needed</div>
								<div className="text-xs mt-1">System operating normally</div>
							</div>
						) : (
							prioritizationRecs.map((rec) => {
								const isApplied = snapshot.prioritizationDecisions.some(d => d.id === rec.id && d.applied && !d.overridden)
								const isOverridden = snapshot.prioritizationDecisions.some(d => d.id === rec.id && d.overridden)
								
								return (
									<div 
										key={rec.id} 
										className={`rounded-xl border p-3 space-y-2 transition-shadow ${
											isApplied 
												? 'border-emerald-300 bg-emerald-50' 
												: isOverridden
												? 'border-amber-300 bg-amber-50 opacity-75'
												: 'border-slate-200 bg-slate-50 hover:shadow-sm'
										}`}
									>
										<div className="flex items-start justify-between gap-2">
											<div className="flex-1">
												<div className="text-sm font-semibold text-slate-900">{rec.description}</div>
												<div className="text-xs text-slate-600 mt-1">{rec.impact}</div>
												{isApplied && (
													<div className="text-xs text-emerald-700 font-medium mt-1 flex items-center gap-1">
														<span>✓</span> Applied
													</div>
												)}
												{isOverridden && (
													<div className="text-xs text-amber-700 font-medium mt-1 flex items-center gap-1">
														<span>⚠</span> Overridden
													</div>
												)}
											</div>
											{rec.detailedImpact.riskLevel === 'high' && (
												<span className="text-xs px-2 py-0.5 rounded bg-red-100 text-red-800 font-medium">
													High Risk
												</span>
											)}
										</div>
										<div className="flex flex-wrap gap-2 text-xs pt-1">
											<button
												className="px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-100 transition-colors font-medium"
												onClick={() => handleWhy(rec)}
											>
												📊 View Impact
											</button>
											<button
												disabled={isApplied || isOverridden}
												className="px-3 py-1.5 rounded-lg border border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
												onClick={() => handleApply(rec)}
											>
												✓ Apply
											</button>
											<button
												disabled={isOverridden}
												className="px-3 py-1.5 rounded-lg border border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
												onClick={() => handleOverride(rec)}
											>
												⚠ Override
											</button>
										</div>
									</div>
								)
							})
						)}
					</div>
				</div>
			</section>

			{notif && (
				<div
					className={`fixed top-6 right-6 z-50 rounded-xl border shadow-lg px-4 py-3 max-w-sm transition-opacity ${
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

			{/* Impact Analysis Modal - High z-index to overlay map */}
			{showImpactModal && selectedRec && (
				<>
					{/* Backdrop */}
					<div 
						className="fixed inset-0 bg-black bg-opacity-50" 
						onClick={() => setShowImpactModal(false)}
						style={{ 
							zIndex: 99999,
							position: 'fixed',
							top: 0,
							left: 0,
							right: 0,
							bottom: 0
						}}
					/>
					{/* Modal Content */}
					<div 
						className="fixed inset-0 flex items-center justify-center p-4 pointer-events-none" 
						style={{ 
							zIndex: 100000,
							position: 'fixed',
							top: 0,
							left: 0,
							right: 0,
							bottom: 0
						}}
					>
						<div 
							className="bg-white rounded-2xl shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto pointer-events-auto" 
							onClick={(e) => e.stopPropagation()}
							style={{ 
								position: 'relative'
							}}
						>
						<div className="p-6 border-b border-slate-200">
							<div className="flex items-center justify-between">
								<div>
									<div className="text-lg font-bold text-slate-900">Impact Analysis</div>
									<div className="text-sm text-slate-600 mt-1">{selectedRec.description}</div>
								</div>
								<button
									onClick={() => setShowImpactModal(false)}
									className="text-slate-400 hover:text-slate-600 text-2xl"
								>
									×
								</button>
							</div>
						</div>
						<div className="p-6 space-y-4">
							{/* AI Explanation */}
							<div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-lg p-4">
								<div className="flex items-center gap-2 mb-2">
									<span className="text-lg">🤖</span>
									<div className="text-sm font-semibold text-blue-900">AI Explanation</div>
								</div>
								<div className="text-sm text-blue-800 leading-relaxed">{selectedRec.detailedImpact.aiExplanation}</div>
							</div>

							{/* What-If Scenarios Tabs */}
							<div className="border border-slate-200 rounded-lg overflow-hidden">
								<div className="grid grid-cols-2 border-b border-slate-200">
									<button 
										onClick={() => setActiveTab('applied')}
										className={`px-4 py-3 text-sm font-semibold transition-colors ${
											activeTab === 'applied'
												? 'bg-emerald-50 text-emerald-900 border-b-2 border-emerald-600'
												: 'bg-slate-50 text-slate-600 border-b-2 border-transparent hover:bg-slate-100'
										}`}
									>
										✓ If Applied
									</button>
									<button 
										onClick={() => setActiveTab('overridden')}
										className={`px-4 py-3 text-sm font-semibold transition-colors ${
											activeTab === 'overridden'
												? 'bg-amber-50 text-amber-900 border-b-2 border-amber-600'
												: 'bg-slate-50 text-slate-600 border-b-2 border-transparent hover:bg-slate-100'
										}`}
									>
										⚠ If Overridden
									</button>
								</div>
								
								{/* If Applied Section */}
								{activeTab === 'applied' && (
								<div className="p-4 space-y-4 bg-emerald-50/30">
									<div className="grid grid-cols-2 gap-3">
										<div className="bg-white border border-emerald-200 rounded-lg p-3">
											<div className="text-xs text-emerald-700 font-semibold mb-1">System Delay Reduction</div>
											<div className="text-xl font-bold text-emerald-900">
												~{Math.round(selectedRec.detailedImpact.whatIfApplied.totalSystemDelayReduction)} min
											</div>
										</div>
										<div className="bg-white border border-emerald-200 rounded-lg p-3">
											<div className="text-xs text-emerald-700 font-semibold mb-1">Trains Affected</div>
											<div className="text-xl font-bold text-emerald-900">
												{selectedRec.detailedImpact.whatIfApplied.trainPredictions.length}
											</div>
										</div>
									</div>

									{/* Train Predictions */}
									<div>
										<div className="text-sm font-semibold text-slate-900 mb-2">Predicted Train Delays</div>
										<div className="space-y-2">
											{selectedRec.detailedImpact.whatIfApplied.trainPredictions.map((pred) => {
												const train = TRAINS.find(t => t.trainId === pred.trainId)
												const isImprovement = pred.delayChangeIfApplied < 0
												return (
													<div key={pred.trainId} className="bg-white border border-slate-200 rounded-lg p-3">
														<div className="flex items-center justify-between mb-2">
															<div className="font-semibold text-sm text-slate-900">{pred.trainId}</div>
															<span className="text-xs px-2 py-0.5 rounded bg-slate-100 text-slate-700">
																{train?.trainType}
															</span>
														</div>
														<div className="grid grid-cols-3 gap-2 text-xs">
															<div>
																<div className="text-slate-600">Current</div>
																<div className="font-semibold text-slate-900">{pred.currentDelay.toFixed(1)} min</div>
															</div>
															<div>
																<div className="text-slate-600">Predicted</div>
																<div className={`font-semibold ${isImprovement ? 'text-emerald-600' : 'text-amber-600'}`}>
																	{pred.predictedDelayIfApplied.toFixed(1)} min
																</div>
															</div>
															<div>
																<div className="text-slate-600">Change</div>
																<div className={`font-semibold ${isImprovement ? 'text-emerald-600' : 'text-amber-600'}`}>
																	{isImprovement ? '' : '+'}{pred.delayChangeIfApplied.toFixed(1)} min
																</div>
															</div>
														</div>
													</div>
												)
											})}
										</div>
									</div>

									{/* Key Benefits */}
									<div>
										<div className="text-sm font-semibold text-emerald-900 mb-2">Key Benefits</div>
										<ul className="space-y-1">
											{selectedRec.detailedImpact.whatIfApplied.keyBenefits.map((benefit, idx) => (
												<li key={idx} className="flex items-start gap-2 text-sm text-emerald-800">
													<span className="text-emerald-600 mt-0.5">✓</span>
													<span>{benefit}</span>
												</li>
											))}
										</ul>
									</div>

									{/* Potential Risks */}
									{selectedRec.detailedImpact.whatIfApplied.potentialRisks.length > 0 && (
										<div>
											<div className="text-sm font-semibold text-amber-900 mb-2">Potential Risks</div>
											<ul className="space-y-1">
												{selectedRec.detailedImpact.whatIfApplied.potentialRisks.map((risk, idx) => (
													<li key={idx} className="flex items-start gap-2 text-sm text-amber-800">
														<span className="text-amber-600 mt-0.5">⚠</span>
														<span>{risk}</span>
													</li>
												))}
											</ul>
										</div>
									)}
								</div>
								)}

								{/* If Overridden Section */}
								{activeTab === 'overridden' && (
								<div className="p-4 space-y-4 bg-amber-50/30">
									<div className="bg-amber-100 border border-amber-300 rounded-lg p-3">
										<div className="text-xs text-amber-800 font-semibold mb-1">Alternative Scenario</div>
										<div className="text-sm text-amber-900">{selectedRec.detailedImpact.whatIfOverridden.alternativeScenario}</div>
									</div>

									<div className="grid grid-cols-2 gap-3">
										<div className="bg-white border border-amber-200 rounded-lg p-3">
											<div className="text-xs text-amber-700 font-semibold mb-1">System Delay Increase</div>
											<div className="text-xl font-bold text-amber-900">
												+{Math.round(selectedRec.detailedImpact.whatIfOverridden.totalSystemDelayIncrease)} min
											</div>
										</div>
										<div className="bg-white border border-amber-200 rounded-lg p-3">
											<div className="text-xs text-amber-700 font-semibold mb-1">Trains Affected</div>
											<div className="text-xl font-bold text-amber-900">
												{selectedRec.detailedImpact.whatIfOverridden.trainPredictions.length}
											</div>
										</div>
									</div>

									{/* Train Predictions for Override */}
									<div>
										<div className="text-sm font-semibold text-slate-900 mb-2">Predicted Train Delays (If Overridden)</div>
										<div className="space-y-2">
											{selectedRec.detailedImpact.whatIfOverridden.trainPredictions.map((pred) => {
												const train = TRAINS.find(t => t.trainId === pred.trainId)
												const isWorse = pred.delayChangeIfOverridden > 0
												return (
													<div key={pred.trainId} className="bg-white border border-slate-200 rounded-lg p-3">
														<div className="flex items-center justify-between mb-2">
															<div className="font-semibold text-sm text-slate-900">{pred.trainId}</div>
															<span className="text-xs px-2 py-0.5 rounded bg-slate-100 text-slate-700">
																{train?.trainType}
															</span>
														</div>
														<div className="grid grid-cols-3 gap-2 text-xs">
															<div>
																<div className="text-slate-600">Current</div>
																<div className="font-semibold text-slate-900">{pred.currentDelay.toFixed(1)} min</div>
															</div>
															<div>
																<div className="text-slate-600">Predicted</div>
																<div className={`font-semibold ${isWorse ? 'text-red-600' : 'text-slate-900'}`}>
																	{pred.predictedDelayIfOverridden.toFixed(1)} min
																</div>
															</div>
															<div>
																<div className="text-slate-600">Change</div>
																<div className={`font-semibold ${isWorse ? 'text-red-600' : 'text-slate-900'}`}>
																	{isWorse ? '+' : ''}{pred.delayChangeIfOverridden.toFixed(1)} min
																</div>
															</div>
														</div>
													</div>
												)
											})}
										</div>
									</div>

									{/* Consequences */}
									<div>
										<div className="text-sm font-semibold text-red-900 mb-2">Consequences</div>
										<ul className="space-y-1">
											{selectedRec.detailedImpact.whatIfOverridden.consequences.map((consequence, idx) => (
												<li key={idx} className="flex items-start gap-2 text-sm text-red-800">
													<span className="text-red-600 mt-0.5">⚠</span>
													<span>{consequence}</span>
												</li>
											))}
										</ul>
									</div>
								</div>
								)}
							</div>

							{/* Risk Level */}
							<div className="flex items-center gap-2 pt-2 border-t border-slate-200">
								<div className="text-sm font-semibold text-slate-900">Risk Level:</div>
								<span className={`px-3 py-1 rounded-lg text-xs font-medium ${
									selectedRec.detailedImpact.riskLevel === 'low'
										? 'bg-emerald-100 text-emerald-800'
										: selectedRec.detailedImpact.riskLevel === 'medium'
										? 'bg-amber-100 text-amber-800'
										: 'bg-red-100 text-red-800'
								}`}>
									{selectedRec.detailedImpact.riskLevel.toUpperCase()}
								</span>
							</div>

							{/* Action Buttons */}
							<div className="flex gap-3 pt-4 border-t border-slate-200">
								<button
									onClick={() => {
										handleApply(selectedRec)
										setShowImpactModal(false)
									}}
									className="flex-1 px-4 py-2 rounded-lg bg-emerald-600 text-white font-semibold hover:bg-emerald-700 transition-colors"
								>
									✓ Apply Decision
								</button>
								<button
									onClick={() => {
										handleOverride(selectedRec)
										setShowImpactModal(false)
									}}
									className="flex-1 px-4 py-2 rounded-lg border border-amber-300 bg-amber-50 text-amber-800 font-semibold hover:bg-amber-100 transition-colors"
								>
									⚠ Override
								</button>
							</div>
						</div>
					</div>
					</div>
				</>
			)}
		</div>
	)
}


