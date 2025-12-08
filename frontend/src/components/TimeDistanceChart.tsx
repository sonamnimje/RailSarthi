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

const isWaitingSegment = (aDist: number, bDist: number) => Math.abs(aDist - bDist) < 0.01
const isFreight = (type: string) => type === 'Freight'
const dashForFreight = (trainType: string) => (isFreight(trainType) ? '8,6' : undefined)

export default function TimeDistanceChart({ title, stations, trains, snapshot, visibleTrainIds }: Props) {
	const [zoomLevel, setZoomLevel] = useState(1)
	const [panOffset, setPanOffset] = useState({ x: 0, y: 0 })
	const [isPanning, setIsPanning] = useState(false)
	const [startPan, setStartPan] = useState({ x: 0, y: 0 })
	const [hoveredTrain, setHoveredTrain] = useState<string | null>(null)

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
	}, [snapshot.trains, visibleTrains])

	const timeScale = useCallback(
		(min: number) => (min / maxTimeMin) * chartWidth,
		[maxTimeMin, chartWidth]
	)
	const distanceScale = useCallback(
		(km: number) => chartHeight - (km / maxDistance) * chartHeight,
		[maxDistance, chartHeight]
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
	}, [distanceScale, timeScale, snapshot.trains, visibleTrains])

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
	}, [distanceScale, orderedStations, timeScale, visibleTrains])

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
					<div className="text-sm text-slate-600">Live Marey diagram · Itarsi → Bhopal</div>
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
							const color = train.color || trainTypeDefaults[train.trainType]
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
							const color = train.color || trainTypeDefaults[train.trainType]
							const hovered = hoveredTrain === train.trainId
							const runtime = snapshot.trains[train.trainId]
							const delay = runtime?.delayMin ?? 0
							
							return (
								<g
									key={train.trainId}
									onMouseEnter={() => setHoveredTrain(train.trainId)}
									onMouseLeave={() => setHoveredTrain(null)}
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
												y={segments[0].y1 - 26}
												width={180}
												height={delay > 0 ? 36 : 22}
												rx={4}
												fill="#fff"
												stroke="#cbd5e1"
											/>
											<text x={segments[0].x1 + 6} y={segments[0].y1 - 11} className="text-[11px] font-semibold fill-slate-800">
												{train.trainId} ({train.trainType})
											</text>
											{delay > 0 && (
												<text x={segments[0].x1 + 6} y={segments[0].y1 + 4} className="text-[10px] font-medium fill-red-600">
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
						Itarsi (ET) → Bhopal (BPL) — Time vs Distance Simulation
					</text>
				</svg>
			</div>

			<div className="mt-3 flex flex-wrap gap-4 text-sm justify-center">
				<div className="flex items-center gap-2">
					<span className="h-1.5 w-8 rounded-full" style={{ backgroundColor: trainTypeDefaults.Passenger }} />
					<span className="text-slate-700">Passenger (fast)</span>
				</div>
				<div className="flex items-center gap-2">
					<span className="h-1.5 w-8 rounded-full" style={{ backgroundColor: trainTypeDefaults.Freight }} />
					<span className="text-slate-700">Freight (slow)</span>
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
		</div>
	)
}

