'use client'

import React, { useEffect, useMemo, useState } from 'react'
import TrainMap from '../components/TrainMap'
import TimeDistanceChart from '../components/TimeDistanceChart'
import ScheduleTimeDistanceChart from '../components/ScheduleTimeDistanceChart'
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
import BlockDiagram from '../components/BlockDiagram'

const division = 'ktv_psa' // Division for loading scenarios 

type Scenario = {
	id: string
	name: string
	disruptions: Disruption[]
}

const STATIONS: Station[] = [
	{ code: 'KTV', name: 'Kottavalasa Jn.', distanceKm: 0, haltMinutes: 5, lat: 17.89, lon: 83.19 },
	{ code: 'KPL', name: 'Kantakapalle', distanceKm: 7.74, haltMinutes: 2, lat: 17.95, lon: 83.21 },
	{ code: 'ALM', name: 'Alamanda', distanceKm: 16.97, haltMinutes: 2, lat: 18.01, lon: 83.27 },
	{ code: 'KUK', name: 'Koru Konda', distanceKm: 24.08, haltMinutes: 2, lat: 18.05, lon: 83.32 },
	{ code: 'VZM', name: 'Vizianagaram Jn.', distanceKm: 34.73, haltMinutes: 3, lat: 18.11, lon: 83.4 },
	{ code: 'NML', name: 'Nellimarla', distanceKm: 46.47, haltMinutes: 2, lat: 18.19, lon: 83.46 },
	{ code: 'GVI', name: 'Garividi', distanceKm: 58.8, haltMinutes: 2, lat: 18.27, lon: 83.53 },
	{ code: 'CPP', name: 'Chipurupalle', distanceKm: 65.37, haltMinutes: 2, lat: 18.32, lon: 83.57 },
	{ code: 'BTVA', name: 'Batuva P.H.', distanceKm: 69.8, haltMinutes: 2, lat: 18.34, lon: 83.62 },
	{ code: 'SGDM', name: 'Sigadam', distanceKm: 78.64, haltMinutes: 2, lat: 18.36, lon: 83.68 },
	{ code: 'PDU', name: 'Ponduru', distanceKm: 88.71, haltMinutes: 2, lat: 18.36, lon: 83.78 },
	{ code: 'DUSI', name: 'Dusi', distanceKm: 97.53, haltMinutes: 2, lat: 18.37, lon: 83.86 },
	{ code: 'CHE', name: 'Srikakulam Road', distanceKm: 103.99, haltMinutes: 3, lat: 18.41, lon: 83.9 },
	{ code: 'ULM', name: 'Urlam', distanceKm: 114.03, haltMinutes: 2, lat: 18.44, lon: 83.99 },
	{ code: 'TIU', name: 'Tilaru', distanceKm: 123.66, haltMinutes: 2, lat: 18.47, lon: 84.07 },
	{ code: 'HCM', name: 'Harischandrapuram', distanceKm: 129.09, haltMinutes: 2, lat: 18.48, lon: 84.12 },
	{ code: 'KBM', name: 'Kotabommali', distanceKm: 137.38, haltMinutes: 2, lat: 18.49, lon: 84.2 },
	{ code: 'DGB', name: 'Dandu Gopalapuram', distanceKm: 145.36, haltMinutes: 2, lat: 18.54, lon: 84.24 },
	{ code: 'NWP', name: 'Naupada Jn.', distanceKm: 151.3, haltMinutes: 3, lat: 18.58, lon: 84.28 },
	{ code: 'RMZ', name: 'Routhpuram Halt', distanceKm: 158.31, haltMinutes: 2, lat: 18.62, lon: 84.34 },
	{ code: 'PUN', name: 'Pundi', distanceKm: 164.54, haltMinutes: 2, lat: 18.67, lon: 84.37 },
	{ code: 'PSA', name: 'Palasa', distanceKm: 176.83, haltMinutes: 0, lat: 18.76, lon: 84.42 },
]

const orderedDownRoute = [...STATIONS].sort((a, b) => a.distanceKm - b.distanceKm)
const orderedUpRoute = [...orderedDownRoute].reverse()

const buildTimetable = (route: Station[], startTime: number, speedKmph: number) => {
	let time = startTime
	return route.map((station, idx) => {
		if (idx > 0) {
			const prev = route[idx - 1]
			const deltaKm = Math.abs(station.distanceKm - prev.distanceKm)
			time += (deltaKm / Math.max(speedKmph, 1)) * 60
		}
		const scheduledTimeMin = Math.round(time + (station.haltMinutes || 0))
		time = scheduledTimeMin
		return { stationCode: station.code, scheduledTimeMin }
	})
}

// Generate passenger trains - both downline (KTV to PSA) and upline (PSA to KTV)
const generatePassengerTrains = (): TrainConfig[] => {
	const trains: TrainConfig[] = []
	
	// Downline trains (KTV → PSA) - 8 trains
	for (let i = 0; i < 8; i++) {
		const startTime = i * 50 // Every 50 minutes
		const baseSpeed = 90 + (i % 3) * 5 // Vary speed slightly
		
		trains.push({
			trainId: `P${12900 + i}DN`, // DN for downline
			trainType: 'Passenger',
			speedKmph: baseSpeed,
			speedProfile: { cruise: baseSpeed + 10, slow: 55 },
			color: '#b91c1c', // Will be overridden by direction-based colors
			stations: buildTimetable(orderedDownRoute, startTime, baseSpeed),
		})
	}
	
	// Upline trains (PSA → KTV) - 6 trains
	for (let i = 0; i < 6; i++) {
		const startTime = 100 + i * 55 // Start after some downline trains
		const baseSpeed = 88 + (i % 3) * 5 // Vary speed slightly
		
		trains.push({
			trainId: `P${13000 + i}UP`, // UP for upline
			trainType: 'Passenger',
			speedKmph: baseSpeed,
			speedProfile: { cruise: baseSpeed + 10, slow: 55 },
			color: '#2563eb', // Will be overridden by direction-based colors
			stations: buildTimetable(orderedUpRoute, startTime, baseSpeed),
		})
	}
	
	return trains
}

// Generate freight trains - both downline (KTV to PSA) and upline (PSA to KTV)
const generateFreightTrains = (): TrainConfig[] => {
	const trains: TrainConfig[] = []
	
	// Downline trains (KTV → PSA) - 12 trains
	for (let i = 0; i < 12; i++) {
		const startTime = i * 35 // Every 35 minutes
		const baseSpeed = 70 + (i % 3) * 3 // Vary speed slightly
		
		trains.push({
			trainId: `F${80000 + i}DN`, // DN for downline
			trainType: 'Freight',
			speedKmph: baseSpeed,
			speedProfile: { cruise: baseSpeed + 10, slow: 45 },
			color: '#065f46', // Will be overridden by direction-based colors
			stations: buildTimetable(orderedDownRoute, startTime, baseSpeed),
		})
	}
	
	// Upline trains (PSA → KTV) - 10 trains
	for (let i = 0; i < 10; i++) {
		const startTime = 120 + i * 40 // Start after some downline trains
		const baseSpeed = 68 + (i % 3) * 3 // Vary speed slightly
		
		trains.push({
			trainId: `F${80100 + i}UP`, // UP for upline
			trainType: 'Freight',
			speedKmph: baseSpeed,
			speedProfile: { cruise: baseSpeed + 10, slow: 45 },
			color: '#7c3aed', // Will be overridden by direction-based colors
			stations: buildTimetable(orderedUpRoute, startTime, baseSpeed),
		})
	}
	
	return trains
}

const TRAINS: TrainConfig[] = [
	...generatePassengerTrains(),
	...generateFreightTrains(),
]

const PASSENGER_TRAIN_COUNT = TRAINS.filter(t => t.trainType === 'Passenger').length
const FREIGHT_TRAIN_COUNT = TRAINS.filter(t => t.trainType === 'Freight').length

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
			else if (disruptionType === 'maintenance') type = 'maintenance'
			
			// Calculate speed reduction based on disruption type and impact
			const speedReductionFactor = d.speedReductionFactor ?? 0.3
			const passengerSpeed = Math.max(0, 1 - (speedReductionFactor * 0.5)) // Passenger gets less reduction
			const freightSpeed = Math.max(0, 1 - speedReductionFactor) // Freight gets full reduction
			
			// For complete blocks, set speed to 0
			const passengerReduction = d.completeBlock ? 0 : Math.max(0.1, passengerSpeed)
			const freightReduction = d.completeBlock ? 0 : Math.max(0.1, freightSpeed)
			
			// Generate description safely
			const typeName = disruptionType.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
			const description = d.description || `${typeName} - ${d.startStation || 'KTV'} → ${d.endStation || 'PSA'}`
			
			return {
				id: `d_${backendScenario.id}_${idx}`,
				type,
				description,
				startStation: d.startStation || 'KTV',
				endStation: d.endStation || 'PSA',
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
	maintenance: 'bg-slate-100 text-slate-800 border-slate-200',
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
		// KPIs will automatically update via snapshot subscription
		
		const systemDelayReduction = Math.round(rec.detailedImpact.whatIfApplied.totalSystemDelayReduction)
		const affectedCount = rec.detailedImpact.affectedTrains.length
		
		showNotif({
			title: '✅ Decision Applied Successfully',
			description: `${rec.description}. Expected system delay reduction: ~${systemDelayReduction} minutes. Affecting ${affectedCount} train(s). KPIs updating in real-time.`,
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
		// KPIs will automatically update via snapshot subscription
		
		const systemDelayIncrease = Math.round(rec.detailedImpact.whatIfOverridden.totalSystemDelayIncrease)
		const affectedCount = rec.detailedImpact.affectedTrains.length
		
		showNotif({
			title: '⚠️ Decision Overridden',
			description: `Override: ${rec.description}. Expected system delay increase: ~${systemDelayIncrease} minutes. Affecting ${affectedCount} train(s). KPIs updating in real-time.`,
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

	// Quick live operational KPIs
	const runningCount = Object.values(snapshot.trains).filter(t => t.status === 'running').length
	const completedCount = Object.values(snapshot.trains).filter(t => t.status === 'completed').length
	const haltedCount = Object.values(snapshot.trains).filter(t => t.status === 'halted').length
	const activeDisruptionsCount = snapshot.disruptions.filter(
		(d) => snapshot.simTimeMin >= d.startAtMin && snapshot.simTimeMin <= d.startAtMin + d.durationMin
	).length
	const completedPercent = Math.round((completedCount / TRAINS.length) * 100)

	// Network / train level live stats
	const blockList = Object.values(snapshot.blockStates || {})
	const closedBlocks = blockList.filter((b) => b.closed).length
	const occupiedBlocks = blockList.filter((b) => !!b.occupiedBy).length
	const queuedBlocks = blockList.reduce((sum, b) => sum + (b.queue?.length || 0), 0)

	const avgSpeedByType = (type: 'Passenger' | 'Freight') => {
		const speeds: number[] = []
		for (const cfg of TRAINS) {
			if (cfg.trainType !== type) continue
			const rt = snapshot.trains[cfg.trainId]
			if (!rt) continue
			if (rt.speedSamples?.length) {
				const active = rt.speedSamples.filter((s) => s > 0)
				if (active.length) speeds.push(active.reduce((a, b) => a + b, 0) / active.length)
			} else if (rt.currentSpeedKmph > 0) {
				speeds.push(rt.currentSpeedKmph)
			}
		}
		if (!speeds.length) return 0
		return speeds.reduce((a, b) => a + b, 0) / speeds.length
	}

	const maxDelayByType = (type: 'Passenger' | 'Freight') => {
		const delays: number[] = []
		for (const cfg of TRAINS) {
			if (cfg.trainType !== type) continue
			const rt = snapshot.trains[cfg.trainId]
			if (!rt) continue
			delays.push(rt.delayMin ?? 0)
		}
		return delays.length ? Math.max(...delays) : 0
	}

	const avgSpeedPassenger = avgSpeedByType('Passenger')
	const avgSpeedFreight = avgSpeedByType('Freight')
	const maxDelayPassenger = maxDelayByType('Passenger')
	const maxDelayFreight = maxDelayByType('Freight')

	const throughputPerHour =
		snapshot.simTimeMin > 0 ? Number((completedCount / (snapshot.simTimeMin / 60)).toFixed(1)) : 0

	const fmt = (val: number | undefined, digits = 1) =>
		Number.isFinite(val ?? NaN) ? (val as number).toFixed(digits) : '—'
	const fmtPair = (a?: number, b?: number, digits = 1) => `${fmt(a, digits)} / ${fmt(b, digits)}`
	const safeDelayRatio =
		Number.isFinite(kpis.delayRatioPassengerFreight) && kpis.delayRatioPassengerFreight !== 999
			? kpis.delayRatioPassengerFreight
			: 0


	return (
		<div className="min-h-screen bg-gradient-to-br from-blue-50 via-blue-100 to-indigo-50 p-6 space-y-6">
			{/* Header Section */}
			<header className="flex flex-wrap items-center justify-between gap-4 mb-2">
				<div className="flex-1 min-w-0">
					<h1 className="text-3xl sm:text-4xl font-extrabold text-slate-900 mb-1">Kottavalasa → Palasa Digital Twin</h1>
					<p className="text-sm sm:text-base text-slate-600">
						Real-time time–distance + map with {TRAINS.length} trains ({PASSENGER_TRAIN_COUNT} Passenger, {FREIGHT_TRAIN_COUNT} Freight) and live KPIs.
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

			{/* Live KPI strip */}
			<section className="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-6 gap-3">
				<div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 shadow-sm">
					<div className="text-[11px] uppercase font-semibold text-emerald-700">On-time %</div>
					<div className="text-2xl font-bold text-emerald-900">{kpis.otpPercent}%</div>
					<div className="text-[11px] text-emerald-700 mt-1">Trains affected: {kpis.trainsAffected}</div>
				</div>
				<div className="rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 shadow-sm">
					<div className="text-[11px] uppercase font-semibold text-blue-700">Avg Delay (P/F)</div>
					<div className="text-lg font-bold text-blue-900">{fmtPair(kpis.avgDelayByType['Passenger'], kpis.avgDelayByType['Freight'])}m</div>
					<div className="text-[11px] text-blue-700 mt-1">Ratio P/F: {fmt(safeDelayRatio, 2)}</div>
				</div>
				<div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 shadow-sm">
					<div className="text-[11px] uppercase font-semibold text-amber-700">Recovery</div>
					<div className="text-2xl font-bold text-amber-900">
						{kpis.recoveryTimeAfterDisruption ? `${fmt(kpis.recoveryTimeAfterDisruption, 1)} min` : '—'}
					</div>
					<div className="text-[11px] text-amber-700 mt-1">Active disruptions: {activeDisruptionsCount}</div>
				</div>
				<div className="rounded-2xl border border-indigo-200 bg-indigo-50 px-4 py-3 shadow-sm">
					<div className="text-[11px] uppercase font-semibold text-indigo-700">Speed variance</div>
					<div className="text-lg font-bold text-indigo-900">P {fmt(kpis.speedVariance['Passenger'], 2)} | F {fmt(kpis.speedVariance['Freight'], 2)}</div>
					<div className="text-[11px] text-indigo-700 mt-1">Section TT (P): {fmt(kpis.sectionTravelTime['Passenger'], 1)} min</div>
				</div>
				<div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
					<div className="text-[11px] uppercase font-semibold text-slate-600">Fleet status</div>
					<div className="text-lg font-bold text-slate-900">
						{runningCount} running · {haltedCount} halted
					</div>
					<div className="text-[11px] text-slate-600 mt-1">{completedCount} completed ({completedPercent}%)</div>
				</div>
				<div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 shadow-sm">
					<div className="text-[11px] uppercase font-semibold text-rose-700">Passenger vs Freight</div>
					<div className="text-lg font-bold text-rose-900">
						P {fmt(passengerDelay, 1)}m · F {fmt(freightDelay, 1)}m
					</div>
					<div className="text-[11px] text-rose-700 mt-1">Sim time: T+{snapshot.simTimeMin.toFixed(1)}m</div>
				</div>
			</section>

			{/* Secondary live KPI strip */}
			<section className="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-6 gap-3">
				<div className="rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 shadow-sm">
					<div className="text-[11px] uppercase font-semibold text-sky-700">Throughput</div>
					<div className="text-lg font-bold text-sky-900">{fmt(throughputPerHour, 1)} trains/hr</div>
					<div className="text-[11px] text-sky-700 mt-1">{completedCount} completed ({completedPercent}%)</div>
				</div>
				<div className="rounded-2xl border border-green-200 bg-green-50 px-4 py-3 shadow-sm">
					<div className="text-[11px] uppercase font-semibold text-green-700">Avg Speed (P/F)</div>
					<div className="text-lg font-bold text-green-900">{fmtPair(avgSpeedPassenger, avgSpeedFreight)} km/h</div>
					<div className="text-[11px] text-green-700 mt-1">Max delay (P/F): {fmtPair(maxDelayPassenger, maxDelayFreight)}m</div>
				</div>
				<div className="rounded-2xl border border-orange-200 bg-orange-50 px-4 py-3 shadow-sm">
					<div className="text-[11px] uppercase font-semibold text-orange-700">Blocks</div>
					<div className="text-lg font-bold text-orange-900">
						{occupiedBlocks} occupied · {closedBlocks} closed
					</div>
					<div className="text-[11px] text-orange-700 mt-1">Queues: {queuedBlocks}</div>
				</div>
				<div className="rounded-2xl border border-fuchsia-200 bg-fuchsia-50 px-4 py-3 shadow-sm">
					<div className="text-[11px] uppercase font-semibold text-fuchsia-700">Disruptions</div>
					<div className="text-lg font-bold text-fuchsia-900">{activeDisruptionsCount}</div>
					<div className="text-[11px] text-fuchsia-700 mt-1">
						{activeDisruptionsCount === 0 ? 'None' : 'Live impact on network'}
					</div>
				</div>
				<div className="rounded-2xl border border-lime-200 bg-lime-50 px-4 py-3 shadow-sm">
					<div className="text-[11px] uppercase font-semibold text-lime-700">Fleet health</div>
					<div className="text-lg font-bold text-lime-900">
						{runningCount} running · {haltedCount} halted
					</div>
					<div className="text-[11px] text-lime-700 mt-1">Open trains: {TRAINS.length - completedCount}</div>
				</div>
				<div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 shadow-sm">
					<div className="text-[11px] uppercase font-semibold text-slate-700">Section travel</div>
					<div className="text-lg font-bold text-slate-900">
						P {fmt(kpis.sectionTravelTime['Passenger'], 1)}m · F {fmt(kpis.sectionTravelTime['Freight'], 1)}m
					</div>
					<div className="text-[11px] text-slate-700 mt-1">Speed var: P {fmt(kpis.speedVariance['Passenger'], 2)} | F {fmt(kpis.speedVariance['Freight'], 2)}</div>
				</div>
			</section>

			{/* Real-time block diagram */}
			<BlockDiagram stations={STATIONS} blockStates={snapshot.blockStates} simTimeMin={snapshot.simTimeMin} />

		
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
				
				{/* Right Sidebar: Disruption Controller, KPIs */}
				<div className="xl:col-span-1 space-y-4">
					{/* Disruption Controller */}
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


