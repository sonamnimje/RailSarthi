import { useMemo, useState, useEffect } from 'react'
import type { TimelineData } from '../lib/api'

interface TimelineChartProps {
	data: TimelineData
	height?: number
	embedded?: boolean
	compact?: boolean
	showHeader?: boolean
	showLegend?: boolean
}

export default function TimelineChart({ data, height = 400, embedded = false, compact = false, showHeader = true, showLegend = true }: TimelineChartProps) {
	const [playing, setPlaying] = useState(false)
	const [simTime, setSimTime] = useState<number | null>(null)

	const { chartData, derivedRange, effectiveStart, effectiveEnd } = useMemo(() => {
		const safeTimeline = data?.timeline || {}
		const trains = Object.keys(safeTimeline)

		const inputStart = new Date(data.time_range.start).getTime()
		const inputEnd = new Date(data.time_range.end).getTime()

		let effectiveStart = Number.isFinite(inputStart) ? inputStart : NaN
		let effectiveEnd = Number.isFinite(inputEnd) ? inputEnd : NaN

		const allTimes: number[] = []
		trains.forEach(trainId => {
			safeTimeline[trainId].forEach(e => {
				if (e.planned_time) allTimes.push(new Date(e.planned_time).getTime())
				if (e.actual_time) allTimes.push(new Date(e.actual_time).getTime())
			})
		})

		const minEventTime = allTimes.length ? Math.min(...allTimes) : NaN
		const maxEventTime = allTimes.length ? Math.max(...allTimes) : NaN

		if (!Number.isFinite(effectiveStart) || !Number.isFinite(effectiveEnd) || effectiveEnd - effectiveStart <= 0) {
			if (Number.isFinite(minEventTime) && Number.isFinite(maxEventTime) && maxEventTime > minEventTime) {
				const pad = Math.max(60_000, Math.round((maxEventTime - minEventTime) * 0.05))
				effectiveStart = minEventTime - pad
				effectiveEnd = maxEventTime + pad
			} else {
				const now = Date.now()
				effectiveStart = now - 30 * 60 * 1000
				effectiveEnd = now + 30 * 60 * 1000
			}
		}

		const totalDuration = Math.max(1, effectiveEnd - effectiveStart)
		const clamp = (v: number) => Math.max(0, Math.min(100, v))

		const mapped = trains.map(trainId => {
			const events = safeTimeline[trainId]
			return {
				trainId,
				events: events.map(event => {
					const startTime = event.planned_time ? new Date(event.planned_time).getTime() : null
					const actualTime = event.actual_time ? new Date(event.actual_time).getTime() : null
					const position = startTime !== null ? clamp(((startTime - effectiveStart) / totalDuration) * 100) : 0
					const actualPosition = actualTime !== null ? clamp(((actualTime - effectiveStart) / totalDuration) * 100) : null
					return { ...event, startTime, actualTime, position, actualPosition }
				})
			}
		})

		return {
			chartData: mapped,
			derivedRange: { start: new Date(effectiveStart).toISOString(), end: new Date(effectiveEnd).toISOString() },
			effectiveStart,
			effectiveEnd
		}
	}, [data])

	// Playback loop
	useEffect(() => {
		if (!playing) return
		const interval = setInterval(() => {
			setSimTime(prev => {
				if (prev == null) return effectiveStart
				const next = prev + 1000
				if (next > effectiveEnd) {
					setPlaying(false) // stop at the end
					return effectiveEnd
				}
				return next
			})
		}, 1000)
		return () => clearInterval(interval)
	}, [playing, effectiveStart, effectiveEnd])

	const formatTime = (timeStr: string) => new Date(timeStr).toLocaleTimeString()

	const getEventColor = (eventType: string, delay?: number) => {
		if (delay && delay > 0) return 'bg-red-500'
		switch (eventType) {
			case 'arrival': return 'bg-green-500'
			case 'departure': return 'bg-blue-500'
			case 'delay': return 'bg-red-500'
			case 'status_change': return 'bg-yellow-500'
			default: return 'bg-gray-500'
		}
	}

	const containerClass = embedded ? '' : 'w-full rounded-2xl border border-slate-200 bg-blue-50 shadow-sm p-5'

	return (
		<div className={containerClass}>
			{/* Header */}
			{showHeader && (
				<div className={`flex items-center justify-between ${compact ? 'mb-2' : 'mb-4'}`}>
					<div>
						<h3 className={`${compact ? 'text-lg' : 'text-xl'} font-semibold text-slate-800`}>Train Movement Timeline</h3>
						<p className="text-xs text-slate-500">Visualizing planned vs actual events</p>
					</div>
					<div className="flex items-center gap-2">
						<button
							onClick={() => setPlaying(!playing)}
							className={`px-3 py-1 rounded bg-blue-500 text-white ${compact ? 'text-xs' : 'text-sm'}`}
						>
							{playing ? '⏸ Pause' : '▶ Play'}
						</button>
						<div className={`${compact ? 'text-xs' : 'text-sm'} text-slate-600 bg-slate-100 px-3 py-1 rounded-full`}>
							{formatTime(derivedRange.start)} – {formatTime(derivedRange.end)}
						</div>
					</div>
				</div>
			)}

			{/* Timeline */}
			<div className="relative rounded-xl border border-slate-200 bg-slate-50" style={{ height: `${height}px` }}>
				{/* Time axis */}
				<div className="absolute top-0 left-0 right-0 h-10 rounded-t-xl bg-blue-50/70 border-b border-slate-200 flex items-center px-3">
					<div className="text-xs text-slate-600">Time →</div>
					<div className="flex-1 h-px bg-gradient-to-r from-transparent via-slate-200 to-transparent ml-3 relative">
						{Array.from({ length: 6 }).map((_, i) => (
							<div key={i} className="absolute top-[-6px] h-3 w-px bg-slate-300" style={{ left: `${(i + 1) * (100 / 7)}%` }} />
						))}
					</div>
				</div>

				{/* Rows */}
				<div className={`pt-10 p-3 ${compact ? 'space-y-2' : 'space-y-3'}`}>
					{chartData.length === 0 && (
						<div className="h-[160px] flex items-center justify-center text-sm text-slate-500">No timeline data</div>
					)}
					{chartData.map(train => {
						// compute interpolated progress
						let progress = 0
						if (simTime !== null && train.events.length > 0) {
							const e0 = train.events[0]
							const eLast = train.events[train.events.length - 1]
							if (simTime <= (e0.startTime || 0)) {
								progress = e0.position
							} else if (simTime >= (eLast.startTime || 0)) {
								progress = eLast.position
							} else {
								for (let i = 0; i < train.events.length - 1; i++) {
									const e1 = train.events[i]
									const e2 = train.events[i + 1]
									if (e1.startTime && e2.startTime && simTime >= e1.startTime && simTime <= e2.startTime) {
										const ratio = (simTime - e1.startTime) / (e2.startTime - e1.startTime)
										progress = e1.position + ratio * (e2.position - e1.position)
										break
									}
								}
							}
						}

						return (
							<div key={train.trainId} className={`relative ${compact ? 'h-10' : 'h-14'} rounded-xl bg-blue-50 border border-slate-200 shadow-xs overflow-hidden`}>
								{/* Train label */}
								<div className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-medium text-blue-600 z-10">
									🚂 {train.trainId}
								</div>
								{/* Events */}
								<div className={`absolute inset-0 flex items-center ${compact ? 'pl-20' : 'pl-24'} pr-3`}>
									<div className="relative w-full h-1 bg-slate-200 rounded">
										{train.events.map((event, idx) => (
											<div key={idx} className="absolute">
												{event.startTime && (
													<div
														className={`${compact ? 'w-1.5 h-1.5 -mt-0.5' : 'w-2 h-2 -mt-0.5'} rounded-full bg-slate-600 border border-slate-800`}
														style={{ left: `calc(${event.position}% - 1px)` }}
														title={`Planned: ${formatTime(event.planned_time!)}`}
													/>
												)}
												{event.actualTime && (
													<div
														className={`${compact ? 'w-2.5 h-2.5 -mt-[5px]' : 'w-3 h-3 -mt-1'} rounded-full ${getEventColor(event.event_type, event.delay_minutes)} shadow`}
														style={{ left: `calc(${event.actualPosition!}% - 2px)` }}
														title={`Actual: ${formatTime(event.actual_time!)} (${event.delay_minutes || 0} min delay)`}
													/>
												)}
											</div>
										))}

										{/* Moving train marker */}
										{simTime !== null && (
											<div
												className="absolute -top-2 w-5 h-5 text-xl"
												style={{ left: `${progress}%`, transform: 'translateX(-50%)' }}
											>
												🚂
											</div>
										)}
									</div>
								</div>
							</div>
						)
					})}
				</div>

				{/* Legend */}
				{showLegend && (
					<div className={`absolute bottom-0 left-0 right-0 ${compact ? 'h-10' : 'h-14'} bg-blue-50/70 border-t border-slate-200 rounded-b-xl px-3 flex items-center gap-3 text-xs`}>
						<span className="inline-flex items-center gap-2 px-2 py-1 rounded-full bg-slate-100 text-slate-700"><span className="w-2 h-2 rounded-full bg-gray-600 border border-gray-800"/>Planned</span>
						<span className="inline-flex items-center gap-2 px-2 py-1 rounded-full bg-green-100 text-green-700"><span className="w-3 h-3 rounded-full bg-green-500"/>Arrival</span>
						<span className="inline-flex items-center gap-2 px-2 py-1 rounded-full bg-blue-100 text-blue-700"><span className="w-3 h-3 rounded-full bg-blue-500"/>Departure</span>
						<span className="inline-flex items-center gap-2 px-2 py-1 rounded-full bg-red-100 text-red-700"><span className="w-3 h-3 rounded-full bg-red-500"/>Delay</span>
						<span className="inline-flex items-center gap-2 px-2 py-1 rounded-full bg-yellow-100 text-yellow-700"><span className="w-3 h-3 rounded-full bg-yellow-500"/>Status Change</span>
					</div>
				)}
			</div>
		</div>
	)
}
