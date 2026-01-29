import React, { useMemo, useState, useCallback } from 'react'
import type { Station, TrainConfig, SimulationSnapshot } from '../simulationEngine'

type Props = {
	title?: string
	stations: Station[]
	trains: TrainConfig[]
	snapshot: SimulationSnapshot
	visibleTrainIds: string[]
}

type Segment = {
	type: 'moving' | 'waiting'
	x1: number
	y1: number
	x2: number
	y2: number
}

const trainTypeDefaults: Record<'Passenger' | 'Freight', string> = {
	Passenger: '#b91c1c', // red
	Freight: '#065f46', // dark green
}

// Color schemes for upline and downline trains
const uplineColors: Record<'Passenger' | 'Freight', string> = {
	Passenger: '#2563eb', // blue for upline passenger
	Freight: '#7c3aed', // purple for upline freight
}

const downlineColors: Record<'Passenger' | 'Freight', string> = {
	Passenger: '#b91c1c', // red for downline passenger
	Freight: '#065f46', // dark green for downline freight
}

// Determine if train is upline (going from higher distance to lower) or downline (lower to higher)
const getTrainDirection = (train: TrainConfig, stations: Station[]): 'upline' | 'downline' => {
	if (train.stations.length < 2) return 'downline' // default
	
	const firstStation = stations.find(s => s.code === train.stations[0].stationCode)
	const lastStation = stations.find(s => s.code === train.stations[train.stations.length - 1].stationCode)
	
	if (!firstStation || !lastStation) return 'downline' // default
	
	// If first station distance < last station distance, it's downline (going forward)
	// If first station distance > last station distance, it's upline (going backward)
	return firstStation.distanceKm < lastStation.distanceKm ? 'downline' : 'upline'
}

const isWaitingSegment = (aDist: number, bDist: number) => Math.abs(aDist - bDist) < 0.01
const isFreight = (type: string) => type === 'Freight'
const dashForFreight = (trainType: string) => (isFreight(trainType) ? '8,6' : undefined)

// Mock freight cargo types based on train ID (consistent per ID)
const getFreightCargo = (trainId: string): string => {
	const cargoTypes = [
		'Coal',
		'Iron Ore',
		'Cement',
		'Food Grains',
		'Steel',
		'Petroleum',
		'Fertilizers',
		'Containers',
		'Automobiles',
		'Raw Materials',
		'Machinery',
		'Textiles',
	]
	const hash = trainId.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0)
	return cargoTypes[hash % cargoTypes.length]
}

const getTrainName = (trainId: string, trainType: string): string => {
	if (trainType === 'Passenger') {
		const names = [
			'Rajdhani Express',
			'Shatabdi Express',
			'Duronto Express',
			'Garib Rath',
			'Jan Shatabdi',
			'Intercity Express',
			'Superfast Express',
			'Mail Express',
			'Passenger Special',
			'Express',
		]
		const hash = trainId.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0)
		return names[hash % names.length]
	}
	const names = ['Goods Express', 'Freight Special', 'Container Express', 'Coal Special', 'Iron Ore Express', 'Cement Express']
	const hash = trainId.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0)
	return names[hash % names.length]
}

const formatTime = (minutes: number): string => {
	const hours = Math.floor(minutes / 60)
	const mins = Math.floor(minutes % 60)
	const secs = Math.floor((minutes % 1) * 60)
	return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
}

type TrainDetails = {
	train: TrainConfig
	runtime: SimulationSnapshot['trains'][string]
	direction: 'upline' | 'downline'
	trainName: string
	freightCargo: string | null
	originStation?: Station
	destStation?: Station
	avgSpeed: number
	distanceTraveled: number
	currentSection: number
	totalSections: number
	sectionProgress: number
	scheduledTime: number
	actualTime: number
	eta: number
	currentStation?: Station
	nextStation?: Station | null
	throughput: number
	accuracy: number
	routeStations: {
		code: string
		name: string
		scheduledTime: number
		actualTime?: number
	}[]
}

export default function TimeDistanceChart({ title, stations, trains, snapshot, visibleTrainIds }: Props) {
	const [zoomLevel, setZoomLevel] = useState(1)
	const [panOffset, setPanOffset] = useState({ x: 0, y: 0 })
	const [isPanning, setIsPanning] = useState(false)
	const [startPan, setStartPan] = useState({ x: 0, y: 0 })
	const [hoveredTrain, setHoveredTrain] = useState<string | null>(null)
	const [selectedTrain, setSelectedTrain] = useState<TrainDetails | null>(null)

	const width = 1100
	const height = 720
	const margin = { top: 60, right: 120, bottom: 70, left: 150 }
	const chartWidth = width - margin.left - margin.right
	const chartHeight = height - margin.top - margin.bottom

	const orderedStations = useMemo(
		() => [...stations].sort((a, b) => a.distanceKm - b.distanceKm),
		[stations]
	)
	const maxDistance = orderedStations[orderedStations.length - 1]?.distanceKm || 1

	const visibleTrains = useMemo(
		() => trains.filter((t) => visibleTrainIds.includes(t.trainId)),
		[trains, visibleTrainIds]
	)

	const maxTimeMin = useMemo(() => {
		const allTimes: number[] = []
		visibleTrains.forEach((cfg) => {
			const runtime = snapshot.trains[cfg.trainId]
			if (runtime) runtime.history.forEach((p) => allTimes.push(p.timeMin))
			// include scheduled times so we can render even before simulation runs
			cfg.stations.forEach((st) => allTimes.push(st.scheduledTimeMin))
		})
		const max = allTimes.length ? Math.max(...allTimes) : 180
		return Math.max(max + 15, 60) // pad 15 min, min 1h
	}, [snapshot.trains, snapshot.simTimeMin, visibleTrains])

	const timeScale = useCallback(
		(min: number) => (min / maxTimeMin) * chartWidth,
		[maxTimeMin, chartWidth]
	)
	const distanceScale = useCallback(
		(km: number) => chartHeight - (km / maxDistance) * chartHeight,
		[maxDistance, chartHeight]
	)

	const buildTrainDetails = useCallback(
		(train: TrainConfig): TrainDetails | null => {
			const runtime = snapshot.trains[train.trainId]
			if (!runtime) return null

			const direction = getTrainDirection(train, stations)
			const trainName = getTrainName(train.trainId, train.trainType)
			const freightCargo = train.trainType === 'Freight' ? getFreightCargo(train.trainId) : null
			const originStation = stations.find((s) => s.code === train.stations[0].stationCode)
			const destStation = stations.find((s) => s.code === train.stations[train.stations.length - 1].stationCode)

			// Average speed
			let avgSpeed = 0
			if (runtime.speedSamples && runtime.speedSamples.length > 0) {
				const activeSpeeds = runtime.speedSamples.filter((s) => s > 0)
				avgSpeed = activeSpeeds.length > 0 ? activeSpeeds.reduce((a, b) => a + b, 0) / activeSpeeds.length : runtime.currentSpeedKmph
			} else {
				avgSpeed = runtime.currentSpeedKmph
			}

			// Distance traveled
			let distanceTraveled = 0
			if (runtime.history.length >= 2) {
				for (let i = 1; i < runtime.history.length; i += 1) {
					distanceTraveled += Math.abs(runtime.history[i].distanceKm - runtime.history[i - 1].distanceKm)
				}
			} else {
				distanceTraveled = runtime.distanceKm
			}

			const currentSection = runtime.segmentIndex + 1
			const totalSections = train.stations.length - 1
			const sectionProgress = totalSections > 0 ? (currentSection / totalSections) * 100 : 0

			const currentStationSchedule = train.stations[runtime.segmentIndex]
			const scheduledTime = currentStationSchedule ? currentStationSchedule.scheduledTimeMin : 0
			const actualTime =
				currentStationSchedule && runtime.actualTimes[currentStationSchedule.stationCode]
					? runtime.actualTimes[currentStationSchedule.stationCode]
					: snapshot.simTimeMin

			// Next station
			const nextStationIndex = train.stations.findIndex((s) => {
				const st = stations.find((stn) => stn.code === s.stationCode)
				return st && st.distanceKm > runtime.distanceKm
			})
			const nextStation =
				nextStationIndex >= 0 ? stations.find((s) => s.code === train.stations[nextStationIndex].stationCode) : null

			let eta = 0
			if (nextStation && runtime.currentSpeedKmph > 0) {
				const remainingDistance = nextStation.distanceKm - runtime.distanceKm
				const timeToNext = (remainingDistance / Math.max(runtime.currentSpeedKmph, 1)) * 60
				eta = snapshot.simTimeMin + timeToNext
			} else if (nextStationIndex >= 0) {
				const nextStationSchedule = train.stations[nextStationIndex]
				eta = nextStationSchedule ? nextStationSchedule.scheduledTimeMin : 0
			}

			// Throughput (km per hour) using elapsed sim time
			const elapsedTime = snapshot.simTimeMin > 0 ? snapshot.simTimeMin : 1
			const throughput = (distanceTraveled / elapsedTime) * 60

			// Accuracy: stations reached on time (<=5 min delay)
			let onTimeStations = 0
			train.stations.forEach((st) => {
				const actual = runtime.actualTimes[st.stationCode]
				if (actual !== undefined) {
					const delay = actual - st.scheduledTimeMin
					if (delay <= 5) onTimeStations += 1
				}
			})
			const accuracy = train.stations.length > 0 ? (onTimeStations / train.stations.length) * 100 : 100

			const routeStations = train.stations.map((st) => {
				const station = stations.find((s) => s.code === st.stationCode)
				return {
					code: st.stationCode,
					name: station?.name || st.stationCode,
					scheduledTime: st.scheduledTimeMin,
					actualTime: runtime.actualTimes[st.stationCode],
				}
			})

			const currentStation = stations.find((s) => Math.abs(s.distanceKm - runtime.distanceKm) < 5)

			return {
				train,
				runtime,
				direction,
				trainName,
				freightCargo,
				originStation,
				destStation,
				avgSpeed,
				distanceTraveled,
				currentSection,
				totalSections,
				sectionProgress,
				scheduledTime,
				actualTime,
				eta,
				currentStation,
				nextStation,
				throughput,
				accuracy,
				routeStations,
			}
		},
		[snapshot.trains, snapshot.simTimeMin, stations]
	)

	const trainSegments = useMemo(() => {
		return visibleTrains.map((train) => {
			const runtime = snapshot.trains[train.trainId]
			const segments: Segment[] = []
			if (!runtime || runtime.history.length < 2) return { train, segments }

			for (let i = 0; i < runtime.history.length - 1; i += 1) {
				const curr = runtime.history[i]
				const next = runtime.history[i + 1]
				const waiting = isWaitingSegment(curr.distanceKm, next.distanceKm)
				segments.push({
					type: waiting ? 'waiting' : 'moving',
					x1: timeScale(curr.timeMin),
					y1: distanceScale(curr.distanceKm),
					x2: timeScale(next.timeMin),
					y2: distanceScale(next.distanceKm),
				})
			}

			return { train, segments }
		})
	}, [distanceScale, timeScale, snapshot.trains, snapshot.simTimeMin, visibleTrains])

	const disruptionBlocks = useMemo(() => {
		return (snapshot.disruptions || []).map((d) => {
			const startDist = orderedStations.find((s) => s.code === d.startStation)?.distanceKm ?? 0
			const endDist = orderedStations.find((s) => s.code === d.endStation)?.distanceKm ?? startDist
			const y1 = distanceScale(Math.max(startDist, endDist))
			const y2 = distanceScale(Math.min(startDist, endDist))
			
			// Determine color based on disruption type
			let fillColor = 'rgba(234, 179, 8, 0.25)' // Amber default
			let strokeColor = 'rgba(202, 138, 4, 0.9)'
			let textColor = '#92400e'
			
			if (d.type === 'track_block') {
				fillColor = 'rgba(239, 68, 68, 0.25)' // Red
				strokeColor = 'rgba(220, 38, 38, 0.9)'
				textColor = '#991b1b'
			} else if (d.type === 'signal_failure') {
				fillColor = 'rgba(245, 158, 11, 0.3)' // Orange
				strokeColor = 'rgba(217, 119, 6, 0.9)'
				textColor = '#92400e'
			} else if (d.type === 'weather_slowdown') {
				fillColor = 'rgba(59, 130, 246, 0.25)' // Blue
				strokeColor = 'rgba(37, 99, 235, 0.9)'
				textColor = '#1e40af'
			} else if (d.type === 'rolling_stock') {
				fillColor = 'rgba(168, 85, 247, 0.25)' // Purple
				strokeColor = 'rgba(147, 51, 234, 0.9)'
				textColor = '#6b21a8'
			} else if (d.type === 'maintenance') {
				fillColor = 'rgba(107, 114, 128, 0.25)' // Gray
				strokeColor = 'rgba(75, 85, 99, 0.9)'
				textColor = '#111827'
			}
			
			return {
				id: d.id,
				x: timeScale(d.startAtMin),
				y: y1,
				width: timeScale(d.durationMin),
				height: Math.max(y2 - y1, 6),
				label: d.description,
				type: d.type,
				fillColor,
				strokeColor,
				textColor,
				speedReduction: d.speedReduction,
			}
		})
	}, [distanceScale, orderedStations, timeScale, snapshot.disruptions])

	// Scheduled (planned) lines so chart is visible immediately, even before simulation history fills.
	const plannedSegments = useMemo(() => {
		return visibleTrains.map((train) => {
			const segments: Segment[] = []
			const stops = train.stations
			for (let i = 0; i < stops.length - 1; i += 1) {
				const curr = stops[i]
				const next = stops[i + 1]
				segments.push({
					type: 'moving',
					x1: timeScale(curr.scheduledTimeMin),
					y1: distanceScale(orderedStations.find((s) => s.code === curr.stationCode)?.distanceKm ?? 0),
					x2: timeScale(next.scheduledTimeMin),
					y2: distanceScale(orderedStations.find((s) => s.code === next.stationCode)?.distanceKm ?? 0),
				})
			}
			return { train, segments }
		})
	}, [distanceScale, orderedStations, timeScale, visibleTrains, snapshot.simTimeMin])

	const maxHourTick = Math.ceil(maxTimeMin / 60)

	const handleMouseDown = (e: React.MouseEvent<SVGSVGElement>) => {
		if (e.button !== 0) return
		setIsPanning(true)
		setStartPan({ x: e.clientX - panOffset.x, y: e.clientY - panOffset.y })
	}

	const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
		if (!isPanning) return
		setPanOffset({ x: e.clientX - startPan.x, y: e.clientY - startPan.y })
	}

	const handleMouseUp = () => setIsPanning(false)

	const handleExport = () => {
		const svg = document.getElementById('time-distance-svg')
		if (!svg) return
		const data = new XMLSerializer().serializeToString(svg)
		const blob = new Blob([data], { type: 'image/svg+xml;charset=utf-8' })
		const url = URL.createObjectURL(blob)
		const a = document.createElement('a')
		a.href = url
		a.download = `${title || 'time-distance'}-chart.svg`
		a.click()
		URL.revokeObjectURL(url)
	}

	const transform = `translate(${margin.left + panOffset.x}, ${margin.top + panOffset.y}) scale(${zoomLevel})`

	return (
		<div className="rounded-2xl border border-slate-200 bg-white shadow-sm p-4">
			<div className="flex flex-wrap items-center justify-between gap-3 mb-3">
				<div>
					<div className="text-lg font-bold text-slate-900">{title || 'Time vs Distance'}</div>
					<div className="text-sm text-slate-600">Live Marey diagram · KTV → PSA</div>
				</div>
				<div className="flex items-center gap-2 text-sm">
					<button
						onClick={() => setZoomLevel((z) => Math.min(z + 0.25, 3))}
						className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 hover:bg-slate-50"
					>
						Zoom in
					</button>
					<button
						onClick={() => setZoomLevel((z) => Math.max(z - 0.25, 0.6))}
						className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 hover:bg-slate-50"
					>
						Zoom out
					</button>
					<button
						onClick={() => {
							setZoomLevel(1)
							setPanOffset({ x: 0, y: 0 })
						}}
						className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 hover:bg-slate-50"
					>
						Reset
					</button>
					<button
						onClick={handleExport}
						className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 hover:bg-slate-50"
					>
						Export SVG
					</button>
				</div>
			</div>

			<div className="overflow-auto rounded-xl border border-slate-100 bg-slate-50">
				<svg
					id="time-distance-svg"
					width={width}
					height={height}
					onMouseDown={handleMouseDown}
					onMouseMove={handleMouseMove}
					onMouseUp={handleMouseUp}
					onMouseLeave={handleMouseUp}
					style={{ cursor: isPanning ? 'grabbing' : 'grab' }}
				>
					<defs>
						<pattern id="grid-pattern" width="60" height="60" patternUnits="userSpaceOnUse">
							<path d="M 60 0 L 0 0 0 60" fill="none" stroke="#e2e8f0" strokeWidth="0.8" />
						</pattern>
					</defs>

					<g transform={transform}>
						<rect x={0} y={0} width={chartWidth} height={chartHeight} fill="url(#grid-pattern)" />
						<rect x={0} y={0} width={chartWidth} height={chartHeight} fill="none" stroke="#94a3b8" strokeWidth={1.5} />

						{/* Station lines and labels */}
						{orderedStations.map((st, idx) => {
							const y = distanceScale(st.distanceKm)
							return (
								<g key={st.code + idx}>
									<line x1={0} y1={y} x2={chartWidth} y2={y} stroke="#cbd5e1" strokeWidth={1} strokeDasharray="6,6" />
									<text x={-12} y={y + 4} textAnchor="end" className="text-xs font-semibold fill-slate-800">
										{st.name}
									</text>
									<text x={chartWidth + 10} y={y + 4} textAnchor="start" className="text-[10px] fill-slate-500">
										{st.distanceKm} km
									</text>
								</g>
							)
						})}

						{/* Time ticks */}
						{Array.from({ length: maxHourTick + 1 }, (_, h) => {
							const x = timeScale(h * 60)
							return (
								<g key={`hour-${h}`}>
									<line x1={x} y1={0} x2={x} y2={chartHeight} stroke="#cbd5e1" strokeWidth={1} strokeDasharray="6,6" />
									<text x={x} y={chartHeight + 20} textAnchor="middle" className="text-[11px] fill-slate-600">
										{h}:00
									</text>
								</g>
							)
						})}

						{/* Prioritization Decisions */}
						{(snapshot.prioritizationDecisions || []).filter(d => d.applied && !d.overridden).map((decision) => {
							const train = trains.find(t => t.trainId === decision.trainId)
							if (!train) return null
							
							const runtime = snapshot.trains[decision.trainId]
							if (!runtime || runtime.history.length === 0) return null
							
							// Find the point at the time of decision
							let decisionPoint = runtime.history.find(p => p.timeMin >= decision.appliedAt)
							if (!decisionPoint) {
								decisionPoint = runtime.history[runtime.history.length - 1]
							}
							
							const x = timeScale(decision.appliedAt)
							const y = decision.stationCode 
								? distanceScale(stations.find(s => s.code === decision.stationCode)?.distanceKm ?? decisionPoint.distanceKm)
								: distanceScale(decisionPoint.distanceKm)
							
							let icon = '✓'
							let bgColor = 'rgba(16, 185, 129, 0.2)'
							let borderColor = 'rgba(5, 150, 105, 0.9)'
							let textColor = '#047857'
							
							if (decision.action === 'hold_train') {
								icon = '⏸'
								bgColor = 'rgba(59, 130, 246, 0.2)'
								borderColor = 'rgba(37, 99, 235, 0.9)'
								textColor = '#1e40af'
							} else if (decision.action === 'regulate_speed') {
								icon = '⚡'
								bgColor = 'rgba(168, 85, 247, 0.2)'
								borderColor = 'rgba(147, 51, 234, 0.9)'
								textColor = '#6b21a8'
							} else if (decision.action === 'give_precedence') {
								icon = '→'
							}
							
							// Show hold duration as a vertical bar
							const showHoldBar = decision.action === 'hold_train' && decision.durationMin
							
							return (
								<g key={decision.id}>
									{/* Hold duration bar for hold_train actions */}
									{showHoldBar && (
										<rect
											x={x - 2}
											y={y}
											width={4}
											height={Math.max(timeScale(decision.durationMin || 5) - timeScale(0), 20)}
											fill={bgColor}
											stroke={borderColor}
											strokeWidth={1.5}
											opacity={0.6}
										/>
									)}
									<circle
										cx={x}
										cy={y}
										r={8}
										fill={bgColor}
										stroke={borderColor}
										strokeWidth={2}
									/>
									<text
										x={x}
										y={y + 4}
										textAnchor="middle"
										className="text-xs font-bold"
										fill={textColor}
									>
										{icon}
									</text>
									{/* Decision label */}
									<rect
										x={x + 12}
										y={y - 10}
										width={180}
										height={decision.affectedTrains && decision.affectedTrains.length > 1 ? 50 : 35}
										rx={4}
										fill="rgba(255, 255, 255, 0.95)"
										stroke={borderColor}
										strokeWidth={1.5}
										opacity={0.95}
									/>
									<text
										x={x + 18}
										y={y + 4}
										className="text-[10px] font-semibold"
										fill={textColor}
									>
										Decision Applied
									</text>
									<text
										x={x + 18}
										y={y + 16}
										className="text-[9px] font-medium"
										fill="#475569"
									>
										{decision.description.length > 35 
											? decision.description.substring(0, 35) + '...'
											: decision.description}
									</text>
									{decision.expectedDelayReduction && (
										<text
											x={x + 18}
											y={y + 28}
											className="text-[9px] font-medium"
											fill="#059669"
										>
											Saved: ~{Math.round(decision.expectedDelayReduction)} min
										</text>
									)}
									{decision.affectedTrains && decision.affectedTrains.length > 1 && (
										<text
											x={x + 18}
											y={y + 40}
											className="text-[9px] font-medium"
											fill="#64748b"
										>
											Affects: {decision.affectedTrains.length} trains
										</text>
									)}
								</g>
							)
						})}

						{/* Disruption windows with effects */}
						{disruptionBlocks.map((block) => (
							<g key={block.id}>
								<rect
									x={block.x}
									y={block.y}
									width={block.width}
									height={block.height}
									fill={block.fillColor}
									stroke={block.strokeColor}
									strokeWidth={2}
									strokeDasharray="8,6"
									opacity={0.8}
								/>
								<text
									x={block.x + 6}
									y={block.y + 14}
									className="text-[10px] font-semibold"
									fill={block.textColor}
								>
									{block.label}
								</text>
								{/* Show speed reduction effects */}
								{block.speedReduction && (
									<text
										x={block.x + 6}
										y={block.y + 28}
										className="text-[9px] font-medium"
										fill={block.textColor}
										opacity={0.8}
									>
										P: {Math.round(block.speedReduction.Passenger * 100)}% | F: {Math.round(block.speedReduction.Freight * 100)}%
									</text>
								)}
							</g>
						))}

						{/* Train paths */}
						{plannedSegments.map(({ train, segments }) => {
							const direction = getTrainDirection(train, stations)
							const directionColors = direction === 'upline' ? uplineColors : downlineColors
							const color = train.color || directionColors[train.trainType]
							return segments.map((seg, i) => (
								<line
									key={`plan-${train.trainId}-${i}`}
									x1={seg.x1}
									y1={seg.y1}
									x2={seg.x2}
									y2={seg.y2}
									stroke={color}
									strokeWidth={train.trainType === 'Freight' ? 3 : 2.5}
									strokeDasharray={dashForFreight(train.trainType)}
									opacity={0.5}
								/>
							))
						})}

						{trainSegments.map(({ train, segments }) => {
							const direction = getTrainDirection(train, stations)
							const directionColors = direction === 'upline' ? uplineColors : downlineColors
							const color = train.color || directionColors[train.trainType]
							const hovered = hoveredTrain === train.trainId
							const runtime = snapshot.trains[train.trainId]
							const delay = runtime?.delayMin ?? 0
							const trainDetails = buildTrainDetails(train)
							
							return (
								<g
									key={train.trainId}
									onMouseEnter={() => setHoveredTrain(train.trainId)}
									onMouseLeave={() => setHoveredTrain(null)}
								onClick={() => trainDetails && setSelectedTrain(trainDetails)}
								style={{ cursor: trainDetails ? 'pointer' : 'default' }}
								>
									{segments.map((seg, i) => {
										// Check if this segment passes through a disruption using history data
										const runtime = snapshot.trains[train.trainId]
										let isInDisruption = false
										
										if (runtime && runtime.history.length > i) {
											const historyPoint = runtime.history[i]
											const nextPoint = runtime.history[i + 1]
											if (historyPoint && nextPoint) {
												const segStartTime = historyPoint.timeMin
												const segEndTime = nextPoint.timeMin
												const segStartDist = historyPoint.distanceKm
												const segEndDist = nextPoint.distanceKm
												
												isInDisruption = (snapshot.disruptions || []).some(d => {
													const startDist = orderedStations.find(s => s.code === d.startStation)?.distanceKm ?? 0
													const endDist = orderedStations.find(s => s.code === d.endStation)?.distanceKm ?? startDist
													const minDist = Math.min(startDist, endDist)
													const maxDist = Math.max(startDist, endDist)
													const disruptionStart = d.startAtMin
													const disruptionEnd = d.startAtMin + d.durationMin
													
													// Check if segment overlaps with disruption in time and distance
													const timeOverlap = (segStartTime <= disruptionEnd && segEndTime >= disruptionStart)
													const distOverlap = (segStartDist <= maxDist && segEndDist >= minDist) || 
													                   (segStartDist >= minDist && segStartDist <= maxDist) ||
													                   (segEndDist >= minDist && segEndDist <= maxDist)
													return timeOverlap && distOverlap
												})
											}
										}
										
										// Use different styling if in disruption zone
										const segmentColor = isInDisruption && delay > 0 ? '#ef4444' : color
										const segmentOpacity = isInDisruption ? 0.7 : (hovered ? 1 : 0.9)
										const segmentWidth = isInDisruption ? (hovered ? 5 : 4) : (hovered ? 4 : train.trainType === 'Freight' ? 3 : 2.5)
										
										return (
										<line
											key={`${train.trainId}-${i}`}
											x1={seg.x1}
											y1={seg.y1}
											x2={seg.x2}
											y2={seg.y2}
												stroke={segmentColor}
												strokeWidth={segmentWidth}
											strokeDasharray={seg.type === 'waiting' ? '6,6' : 'none'}
												opacity={segmentOpacity}
										/>
										)
									})}
									{hovered && segments[0] && (
										<g>
											<rect
												x={segments[0].x1 - 6}
												y={segments[0].y1 - 32}
												width={200}
												height={delay > 0 ? 42 : 28}
												rx={4}
												fill="#fff"
												stroke="#cbd5e1"
											/>
											<text x={segments[0].x1 + 6} y={segments[0].y1 - 17} className="text-[11px] font-semibold fill-slate-800">
												{train.trainId} ({train.trainType})
											</text>
											<text x={segments[0].x1 + 6} y={segments[0].y1 - 5} className="text-[10px] font-medium fill-slate-600">
												{direction === 'upline' ? 'Upline' : 'Downline'} • {direction === 'upline' ? 'BPL → ET' : 'ET → BPL'}
											</text>
											{delay > 0 && (
												<text x={segments[0].x1 + 6} y={segments[0].y1 + 8} className="text-[10px] font-medium fill-red-600">
													Delay: {delay.toFixed(1)} min
												</text>
											)}
										</g>
									)}
								</g>
							)
						})}

						{/* Axis labels */}
						<text x={chartWidth / 2} y={chartHeight + 45} textAnchor="middle" className="text-sm font-semibold fill-slate-800">
							Time (hours)
						</text>
						<text
							x={-chartHeight / 2}
							y={-100}
							textAnchor="middle"
							transform="rotate(-90)"
							className="text-sm font-semibold fill-slate-800"
						>
							Distance (km) · Stations
						</text>
					</g>

					<text
						x={width / 2}
						y={30}
						textAnchor="middle"
						className="text-lg font-extrabold fill-slate-900"
					>
						Kottavalasa (KTV) → Palasa (PSA) — Time vs Distance Simulation
					</text>
				</svg>
			</div>

			<div className="mt-3 flex flex-wrap gap-4 text-sm justify-center">
				<div className="flex items-center gap-2">
					<span className="h-1.5 w-8 rounded-full" style={{ backgroundColor: downlineColors.Passenger }} />
					<span className="text-slate-700">Downline Passenger (solid)</span>
				</div>
				<div className="flex items-center gap-2">
					<span className="h-1.5 w-8 rounded-full" style={{ backgroundColor: uplineColors.Passenger }} />
					<span className="text-slate-700">Upline Passenger (solid)</span>
				</div>
				<div className="flex items-center gap-2">
					<span className="h-1.5 w-8 border-t-2 border-dashed" style={{ borderColor: downlineColors.Freight }} />
					<span className="text-slate-700">Downline Freight (dashed)</span>
				</div>
				<div className="flex items-center gap-2">
					<span className="h-1.5 w-8 border-t-2 border-dashed" style={{ borderColor: uplineColors.Freight }} />
					<span className="text-slate-700">Upline Freight (dashed)</span>
				</div>
				<div className="flex items-center gap-2">
					<span className="h-0.5 w-8 border-t border-dashed border-slate-500" />
					<span className="text-slate-600">Waiting / dwell</span>
				</div>
				<div className="flex items-center gap-2">
					<span className="h-3 w-3 rounded-sm bg-amber-200 border border-amber-500" />
					<span className="text-slate-700">Disruption window</span>
				</div>
				<div className="flex items-center gap-2">
					<span className="h-3 w-3 rounded-full bg-emerald-200 border-2 border-emerald-600" />
					<span className="text-slate-700">Prioritization decision</span>
				</div>
			</div>

			{/* Train Details Modal */}
			{selectedTrain && (
				<div
					className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
					onClick={() => setSelectedTrain(null)}
				>
					<div
						className="bg-white rounded-xl shadow-2xl max-w-3xl w-full max-h-[90vh] overflow-y-auto"
						onClick={(e) => e.stopPropagation()}
					>
						<TrainDetailsModal details={selectedTrain} onClose={() => setSelectedTrain(null)} />
					</div>
				</div>
			)}
		</div>
	)
}

// Modal component for train details
const TrainDetailsModal: React.FC<{
	details: TrainDetails
	onClose: () => void
}> = ({ details, onClose }) => {
	return (
		<div className="p-6">
			<div className="flex items-start justify-between mb-6">
				<div>
					<div className="flex items-center gap-3 mb-2">
						<h2 className="text-2xl font-bold text-slate-900">{details.train.trainId}</h2>
						{details.runtime.delayMin > 10 && (
							<span className="px-3 py-1 text-xs font-semibold bg-red-100 text-red-700 rounded-full">CRITICAL</span>
						)}
					</div>
					<div className="text-lg font-semibold text-slate-800">{details.trainName}</div>
					<div className="flex items-center gap-2 text-sm text-slate-600 mt-1">
						<span className="w-2 h-2 rounded-full bg-blue-500" />
						<span>{details.train.trainType}</span>
						<span className="text-slate-400">•</span>
						<span>{details.direction === 'upline' ? 'Upline' : 'Downline'}</span>
					</div>
				</div>
				<button
					onClick={onClose}
					className="text-slate-400 hover:text-slate-600 text-2xl font-bold w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-100"
				>
					×
				</button>
			</div>

			{/* Key metrics */}
			<div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
				<div className="bg-slate-50 rounded-lg p-4 border border-slate-200">
					<div className="text-xs text-slate-500 uppercase mb-1">Delay</div>
					<div
						className={`text-2xl font-bold ${
							details.runtime.delayMin > 10 ? 'text-red-600' : details.runtime.delayMin > 5 ? 'text-orange-600' : 'text-green-600'
						}`}
					>
						{details.runtime.delayMin > 0 ? `${details.runtime.delayMin.toFixed(1)} min` : 'On Time'}
					</div>
				</div>
				<div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
					<div className="text-xs text-blue-600 uppercase mb-1">Throughput</div>
					<div className="text-2xl font-bold text-blue-700">{details.throughput.toFixed(1)} km/h</div>
				</div>
				<div className="bg-green-50 rounded-lg p-4 border border-green-200">
					<div className="text-xs text-green-600 uppercase mb-1">Accuracy</div>
					<div className="text-2xl font-bold text-green-700">{details.accuracy.toFixed(1)}%</div>
				</div>
				<div className="bg-purple-50 rounded-lg p-4 border border-purple-200">
					<div className="text-xs text-purple-600 uppercase mb-1">Avg Speed</div>
					<div className="text-2xl font-bold text-purple-700">{details.avgSpeed.toFixed(0)} km/h</div>
				</div>
			</div>

			{/* Route info */}
			<div className="mb-6">
				<h4 className="text-sm font-semibold text-slate-700 uppercase mb-3">Train Route</h4>
				<div className="bg-slate-50 rounded-lg p-4 border border-slate-200">
					<div className="flex items-center justify-between mb-4">
						<div className="text-center flex-1">
							<div className="text-xs text-slate-500 uppercase mb-1">From</div>
							<div className="font-semibold text-slate-900">{details.originStation?.name || 'N/A'}</div>
							<div className="text-xs text-slate-600">{details.originStation?.code || ''}</div>
						</div>
						<div className="text-2xl text-slate-400 mx-4">→</div>
						<div className="text-center flex-1">
							<div className="text-xs text-slate-500 uppercase mb-1">To</div>
							<div className="font-semibold text-slate-900">{details.destStation?.name || 'N/A'}</div>
							<div className="text-xs text-slate-600">{details.destStation?.code || ''}</div>
						</div>
					</div>

					{/* Progress */}
					<div className="mb-4">
						<div className="text-[10px] text-slate-500 uppercase mb-1.5">Section Progress</div>
						<div className="w-full bg-slate-200 rounded-full h-2 mb-1.5">
							<div className="bg-blue-600 h-2 rounded-full transition-all" style={{ width: `${details.sectionProgress}%` }}></div>
						</div>
						<div className="text-xs text-slate-700 flex items-center gap-1">
							<span>📍</span>
							<span>
								Section {details.currentSection} of {details.totalSections}
							</span>
						</div>
					</div>

					{/* Route stations list */}
					<div className="space-y-2 mt-4 pt-4 border-t border-slate-200 max-h-56 overflow-y-auto">
						<div className="text-xs text-slate-500 uppercase mb-2">Route Stations</div>
						{details.routeStations.map((st, idx) => {
							const delay = st.actualTime !== undefined ? st.actualTime - st.scheduledTime : null
							return (
								<div key={st.code + idx} className="flex items-center justify-between text-xs py-1 px-2 hover:bg-white rounded">
									<div className="flex items-center gap-2">
										<span className="text-slate-400">{idx + 1}.</span>
										<span className="font-medium text-slate-700">{st.name}</span>
										<span className="text-slate-500">({st.code})</span>
									</div>
									<div className="flex items-center gap-3">
										<span className="text-slate-500">Sch: {formatTime(st.scheduledTime)}</span>
										{st.actualTime !== undefined && (
											<span className={`font-medium ${delay && delay > 5 ? 'text-red-600' : 'text-green-600'}`}>
												Act: {formatTime(st.actualTime)}
												{delay !== null && delay > 0 && ` (+${delay.toFixed(0)}m)`}
											</span>
										)}
									</div>
								</div>
							)
						})}
					</div>
				</div>
			</div>

			{/* Freight info */}
			{details.train.trainType === 'Freight' && details.freightCargo && (
				<div className="mb-6">
					<h4 className="text-sm font-semibold text-slate-700 uppercase mb-3">Freight Information</h4>
					<div className="bg-purple-50 rounded-lg p-4 border border-purple-200">
						<div className="flex items-center gap-3">
							<span className="text-3xl">🚚</span>
							<div>
								<div className="text-xs text-purple-600 uppercase mb-1">Cargo Type</div>
								<div className="text-lg font-bold text-purple-900">{details.freightCargo}</div>
							</div>
						</div>
					</div>
				</div>
			)}

			{/* Additional details */}
			<div className="grid grid-cols-2 md:grid-cols-4 gap-4">
				<div className="bg-slate-50 rounded-lg p-4 border border-slate-200">
					<div className="text-xs text-slate-500 uppercase mb-2">Status</div>
					<div
						className={`font-semibold capitalize ${
							details.runtime.status === 'running'
								? 'text-green-600'
								: details.runtime.status === 'halted'
								? 'text-yellow-600'
								: 'text-gray-600'
						}`}
					>
						{details.runtime.status === 'running' ? '▶ Running' : details.runtime.status === 'halted' ? '⏸ Halted' : '✓ Completed'}
					</div>
				</div>
				<div className="bg-slate-50 rounded-lg p-4 border border-slate-200">
					<div className="text-xs text-slate-500 uppercase mb-2">Distance</div>
					<div className="font-semibold text-slate-900">{details.runtime.distanceKm.toFixed(1)} km</div>
				</div>
				<div className="bg-slate-50 rounded-lg p-4 border border-slate-200">
					<div className="text-xs text-slate-500 uppercase mb-2">Current Speed</div>
					<div className="font-semibold text-blue-600">{details.runtime.currentSpeedKmph.toFixed(0)} km/h</div>
				</div>
				<div className="bg-slate-50 rounded-lg p-4 border border-slate-200">
					<div className="text-xs text-slate-500 uppercase mb-2">ETA</div>
					<div className="font-semibold text-indigo-700">{details.eta > 0 ? formatTime(details.eta) : 'N/A'}</div>
				</div>
			</div>
		</div>
	)
}
