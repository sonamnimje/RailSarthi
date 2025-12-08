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
			return {
				id: d.id,
				x: timeScale(d.startAtMin),
				y: y1,
				width: timeScale(d.durationMin),
				height: Math.max(y2 - y1, 6),
				label: d.description,
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
					<div className="text-sm text-slate-600">Live Marey diagram · Jabalpur → Itarsi</div>
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

						{/* Disruption windows */}
						{disruptionBlocks.map((block) => (
							<g key={block.id}>
								<rect
									x={block.x}
									y={block.y}
									width={block.width}
									height={block.height}
									fill="rgba(234, 179, 8, 0.18)"
									stroke="rgba(202, 138, 4, 0.8)"
									strokeDasharray="8,6"
								/>
								<text
									x={block.x + 6}
									y={block.y + 14}
									className="text-[10px] fill-amber-900 font-semibold"
								>
									{block.label}
								</text>
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
							return (
								<g
									key={train.trainId}
									onMouseEnter={() => setHoveredTrain(train.trainId)}
									onMouseLeave={() => setHoveredTrain(null)}
								>
									{segments.map((seg, i) => (
										<line
											key={`${train.trainId}-${i}`}
											x1={seg.x1}
											y1={seg.y1}
											x2={seg.x2}
											y2={seg.y2}
											stroke={color}
											strokeWidth={hovered ? 4 : train.trainType === 'Freight' ? 3 : 2.5}
											strokeDasharray={seg.type === 'waiting' ? '6,6' : 'none'}
											opacity={hovered ? 1 : 0.9}
										/>
									))}
									{hovered && segments[0] && (
										<g>
											<rect
												x={segments[0].x1 - 6}
												y={segments[0].y1 - 26}
												width={180}
												height={22}
												rx={4}
												fill="#fff"
												stroke="#cbd5e1"
											/>
											<text x={segments[0].x1 + 6} y={segments[0].y1 - 11} className="text-[11px] font-semibold fill-slate-800">
												{train.trainId} ({train.trainType})
											</text>
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
						Jabalpur (JBP) → Itarsi (ET) — Time vs Distance Simulation
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
			</div>
		</div>
	)
}

