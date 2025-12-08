import React, { useEffect, useMemo, useState } from 'react'
import {
	ResponsiveContainer,
	LineChart,
	Line,
	XAxis,
	YAxis,
	Tooltip,
	Legend,
	CartesianGrid,
	Scatter,
} from 'recharts'

type ApiStop = {
	train_id?: string
	station_name: string
	km_position: number
	scheduled_arrival: string
	scheduled_departure: string
	halt_minutes: number
	arrival_min?: number
	departure_min?: number
}

type ApiTrain = {
	train_id: string
	stops: ApiStop[]
}

type ApiResponse = {
	stations: { station_name: string; km_position: number }[]
	trains: ApiTrain[]
	meta: { earliest_departure_min: number; latest_arrival_min: number; source_file?: string }
}

type ChartPoint = {
	timeMin: number
	km: number
	trainId: string
	stationName: string
	arrival: string
	departure: string
	halt: number
}

const palette = ['#ef4444', '#3b82f6', '#f59e0b', '#10b981', '#8b5cf6', '#ec4899', '#0ea5e9', '#6366f1']

const trainLineStyle = (trainId: string) =>
	trainId.toLowerCase().startsWith('f')
		? { strokeDasharray: '6 4', strokeWidth: 3 } // freight dashed
		: { strokeDasharray: undefined, strokeWidth: 3 } // passenger solid

// Lightweight mock schedule so the chart can render Passenger + Freight lines even when
// the backend CSV or API is unavailable.
const MOCK_SCHEDULE: ApiResponse = {
	stations: [
		{ station_name: 'Jabalpur', km_position: 0 },
		{ station_name: 'Madan Mahal', km_position: 6 },
		{ station_name: 'Narsinghpur', km_position: 82 },
		{ station_name: 'Gadarwara', km_position: 130 },
		{ station_name: 'Bankhedi', km_position: 190 },
		{ station_name: 'Pipariya', km_position: 221 },
		{ station_name: 'Itarsi', km_position: 338 },
	],
	trains: [
		{
			train_id: 'P123',
			stops: [
				{ station_name: 'Jabalpur', km_position: 0, scheduled_arrival: '06:00', scheduled_departure: '06:00', halt_minutes: 5 },
				{ station_name: 'Madan Mahal', km_position: 6, scheduled_arrival: '06:08', scheduled_departure: '06:10', halt_minutes: 2 },
				{ station_name: 'Narsinghpur', km_position: 82, scheduled_arrival: '07:35', scheduled_departure: '07:40', halt_minutes: 3 },
				{ station_name: 'Gadarwara', km_position: 130, scheduled_arrival: '08:15', scheduled_departure: '08:20', halt_minutes: 2 },
				{ station_name: 'Bankhedi', km_position: 190, scheduled_arrival: '08:55', scheduled_departure: '09:00', halt_minutes: 2 },
				{ station_name: 'Pipariya', km_position: 221, scheduled_arrival: '09:20', scheduled_departure: '09:25', halt_minutes: 3 },
				{ station_name: 'Itarsi', km_position: 338, scheduled_arrival: '10:20', scheduled_departure: '10:20', halt_minutes: 0 },
			],
		},
		{
			train_id: 'F789',
			stops: [
				{ station_name: 'Jabalpur', km_position: 0, scheduled_arrival: '06:05', scheduled_departure: '06:05', halt_minutes: 5 },
				{ station_name: 'Madan Mahal', km_position: 6, scheduled_arrival: '06:18', scheduled_departure: '06:20', halt_minutes: 2 },
				{ station_name: 'Narsinghpur', km_position: 82, scheduled_arrival: '08:10', scheduled_departure: '08:15', halt_minutes: 4 },
				{ station_name: 'Gadarwara', km_position: 130, scheduled_arrival: '08:55', scheduled_departure: '09:00', halt_minutes: 3 },
				{ station_name: 'Bankhedi', km_position: 190, scheduled_arrival: '09:45', scheduled_departure: '09:50', halt_minutes: 3 },
				{ station_name: 'Pipariya', km_position: 221, scheduled_arrival: '10:15', scheduled_departure: '10:20', halt_minutes: 3 },
				{ station_name: 'Itarsi', km_position: 338, scheduled_arrival: '11:10', scheduled_departure: '11:10', halt_minutes: 0 },
			],
		},
	],
	meta: {
		earliest_departure_min: 360, // 06:00
		latest_arrival_min: 670, // 11:10
		source_file: 'mock_schedule.json',
	},
}

const parseMinutes = (hhmm: string): number => {
	const [h = '0', m = '0'] = hhmm.split(':')
	return Number(h) * 60 + Number(m)
}

const formatMinutes = (minutes: number): string => {
	const h = Math.floor(minutes / 60) % 24
	const m = Math.round(minutes % 60)
	return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`
}

function buildSeries(trains: ApiTrain[]): Record<string, ChartPoint[]> {
	const series: Record<string, ChartPoint[]> = {}

	trains.forEach((train, idx) => {
		const stops = [...train.stops].sort(
			(a, b) => (a.departure_min ?? parseMinutes(a.scheduled_departure)) - (b.departure_min ?? parseMinutes(b.scheduled_departure))
		)
		const points: ChartPoint[] = []

		stops.forEach((stop) => {
			const arrivalMin = stop.arrival_min ?? parseMinutes(stop.scheduled_arrival)
			const departureMin = stop.departure_min ?? parseMinutes(stop.scheduled_departure)

			points.push({
				timeMin: arrivalMin,
				km: stop.km_position,
				trainId: train.train_id,
				stationName: stop.station_name,
				arrival: stop.scheduled_arrival,
				departure: stop.scheduled_departure,
				halt: stop.halt_minutes,
			})

			if (departureMin !== arrivalMin) {
				points.push({
					timeMin: departureMin,
					km: stop.km_position,
					trainId: train.train_id,
					stationName: stop.station_name,
					arrival: stop.scheduled_arrival,
					departure: stop.scheduled_departure,
					halt: stop.halt_minutes,
				})
			}
		})

		series[train.train_id] = points

		// ensure deterministic color mapping by filling palette index order
		palette[idx % palette.length]
	})

	return series
}

const HaltTooltip = ({ active, payload }: any) => {
	if (!active || !payload?.length) return null
	const point: ChartPoint | undefined = payload[0]?.payload
	if (!point) return null

	return (
		<div className="rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-sm text-sm">
			<div className="font-semibold text-slate-900 mb-1">
				{point.trainId} · {point.stationName}
			</div>
			<div className="text-slate-700">
				Arrival: {point.arrival} · Departure: {point.departure}
				{point.halt ? ` · Halt ${point.halt} min` : ''}
			</div>
			<div className="text-xs text-slate-500 mt-1">Dist: {point.km} km · Time: {formatMinutes(point.timeMin)}</div>
		</div>
	)
}

type Props = {
	title?: string
	height?: number
}

export default function ScheduleTimeDistanceChart({ title = 'Timetable Time-Distance Chart', height = 520 }: Props) {
	const [data, setData] = useState<ApiResponse | null>(MOCK_SCHEDULE)
	const [loading, setLoading] = useState(false)
	const [error, setError] = useState<string | null>(null)
	const [hoverTrain, setHoverTrain] = useState<string | null>(null)
	const [reloadToken, setReloadToken] = useState(0)
	const [lastLoadedAt, setLastLoadedAt] = useState<number | null>(null)

	useEffect(() => {
		let alive = true
		setLoading(true)
		fetch('/api/time-distance/schedule')
			.then(async (res) => {
				if (!res.ok) throw new Error(await res.text())
				return res.json()
			})
			.then((json) => {
				if (alive) {
					setData(json as ApiResponse)
					setError(null)
					setLastLoadedAt(Date.now())
				}
			})
			.catch((err) => alive && setError(err.message || 'Unable to load timetable'))
			.finally(() => alive && setLoading(false))

		return () => {
			alive = false
		}
	}, [reloadToken])

	const stationTickMap = useMemo(() => {
		if (!data) return {}
		const map: Record<number, string> = {}
		data.stations.forEach((s) => {
			map[Math.round(Number(s.km_position))] = s.station_name
		})
		return map
	}, [data])

	const series = useMemo(() => (data ? buildSeries(data.trains) : {}), [data])
	const domain = useMemo(() => {
		if (!data) return { start: 0, end: 240 }
		const start = Math.floor((data.meta?.earliest_departure_min ?? 0) / 60) * 60
		const end = Math.ceil((data.meta?.latest_arrival_min ?? start + 180) / 60) * 60
		return { start, end: end + 10 }
	}, [data])

	const xTicks = useMemo(() => {
		const ticks: number[] = []
		for (let t = domain.start; t <= domain.end; t += 30) {
			ticks.push(t)
		}
		return ticks
	}, [domain])

	const yTicks = useMemo(() => (data ? [...new Set(data.stations.map((s) => Number(s.km_position)))].sort((a, b) => a - b) : []), [data])

	const haltPoints = useMemo(() => {
		const points: ChartPoint[] = []
		Object.values(series).forEach((pointsForTrain) => {
			points.push(
				...pointsForTrain.filter((p, idx) => {
					if (!idx) return true
					const prev = pointsForTrain[idx - 1]
					// Only mark halts where time changed but distance stayed constant
					return p.km === prev.km && p.timeMin !== prev.timeMin
				})
			)
		})
		return points
	}, [series])

	return (
		<div className="rounded-2xl border border-slate-200 bg-white shadow-sm p-4">
			<div className="flex items-center justify-between mb-3">
				<div>
					<div className="text-lg font-bold text-slate-900">{title}</div>
					<div className="text-sm text-slate-600">
						Built from backend/data/{data?.meta?.source_file || 'train_schedule.csv'} · hover to view stop details
					</div>
					{lastLoadedAt && (
						<div className="text-xs text-slate-500 mt-1">
							Updated {new Date(lastLoadedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
						</div>
					)}
				</div>
				<div className="flex items-center gap-3">
					{error && <div className="text-sm text-rose-600">{error}</div>}
					<button
						onClick={() => setReloadToken((t) => t + 1)}
						disabled={loading}
						className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-60"
					>
						{loading ? 'Refreshing…' : 'Refresh data'}
					</button>
				</div>
			</div>

			<div className="h-[400px] lg:h-[500px]">
				{data ? (
					<ResponsiveContainer width="100%" height={height}>
						<LineChart
							data={[]}
							margin={{ top: 20, right: 30, left: 40, bottom: 30 }}
							onMouseLeave={() => setHoverTrain(null)}
						>
							<CartesianGrid strokeDasharray="4 4" stroke="#e2e8f0" />
							<XAxis
								type="number"
								dataKey="timeMin"
								domain={[domain.start, domain.end]}
								ticks={xTicks}
								tickFormatter={formatMinutes}
								label={{ value: 'Time (HH:MM)', position: 'insideBottom', offset: -18 }}
							/>
							<YAxis
								type="number"
								dataKey="km"
								ticks={yTicks}
								tickFormatter={(km) => stationTickMap[Math.round(km)] || `${km} km`}
								label={{ value: 'Distance (km) · Stations', angle: -90, position: 'insideLeft' }}
							/>
							<Tooltip content={<HaltTooltip />} />
							<Legend verticalAlign="top" height={30} />

							{Object.entries(series).map(([trainId, points], idx) => {
								const color = palette[idx % palette.length]
								const faded = hoverTrain && hoverTrain !== trainId
								const style = trainLineStyle(trainId)
								return (
									<Line
										key={trainId}
										name={trainId}
										data={points}
										type="linear"
										dataKey="km"
										stroke={color}
										strokeWidth={faded ? 2 : style.strokeWidth}
										strokeDasharray={style.strokeDasharray}
										dot={{ r: faded ? 2 : 3, stroke: color, strokeWidth: 1, fill: '#fff' }}
										activeDot={{ r: 5 }}
										isAnimationActive={false}
										onMouseEnter={() => setHoverTrain(trainId)}
									/>
								)
							})}

							<Scatter
								name="Halts"
								data={haltPoints}
								fill="#f97316"
								shape="square"
								opacity={0.9}
								isAnimationActive={false}
							/>
						</LineChart>
					</ResponsiveContainer>
				) : (
					<div className="flex items-center justify-center h-full text-sm text-slate-600">
						{loading ? 'Loading timetable…' : error || 'No data'}
					</div>
				)}
			</div>
		</div>
	)
}

