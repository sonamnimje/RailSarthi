import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { 
	fetchDelayTrends, 
	fetchThroughput, 
	fetchZoneSummary, 
	fetchKpis,
	fetchTrainLogs,
	type DelayTrendsResponse,
	type ZoneSummaryResponse,
	type TrainLog
} from '../lib/api'
import { Download, RefreshCw, Calendar, Filter, TrendingUp, AlertCircle, CheckCircle2, Clock, Train, BarChart3 } from 'lucide-react'
import { useZoneFilter } from '../lib/ZoneFilterContext'
import { INDIAN_RAILWAY_ZONES, listDivisions, getBackendZoneName, doesRecordMatchScope, type ZoneDisplayName } from '../lib/zoneData'

// Train types available in the system
const TRAIN_TYPES = ['Express', 'Passenger', 'Goods'] as const
type TrainType = typeof TRAIN_TYPES[number]

// Date range presets
type DateRangePreset = '24h' | '7d' | '30d' | 'custom'

interface DateRange {
	start: Date
	end: Date
}

// Enhanced Line Chart Component for Punctuality Trend
function PunctualityTrendChart({ data, labels }: { data: number[]; labels: string[] }) {
	const max = Math.max(1, ...data, 100) // Max 100% for percentage
	const width = 800
	const height = 350
	const padding = { top: 30, right: 30, bottom: 50, left: 60 }
	const chartW = width - padding.left - padding.right
	const chartH = height - padding.top - padding.bottom
	const step = chartW / Math.max(1, data.length - 1)
	const [hoverIdx, setHoverIdx] = useState<number | null>(null)

	const points = data.map((v, i) => {
		const x = padding.left + i * step
		const y = padding.top + chartH - (v / max) * chartH
		return `${x},${y}`
	}).join(' ')

	const gridLines = [0, 0.25, 0.5, 0.75, 1]
	const yAxisLabels = gridLines.map(g => Math.round(g * max))

	return (
		<svg viewBox={`0 0 ${width} ${height}`} className="w-full h-96">
			{/* Grid lines */}
			{gridLines.map((g, i) => {
				const y = padding.top + chartH * (1 - g)
				return (
					<g key={i}>
						<line x1={padding.left} x2={width - padding.right} y1={y} y2={y} stroke="#e5e7eb" strokeDasharray="4 4" strokeWidth={1} />
						<text x={padding.left - 8} y={y + 4} textAnchor="end" className="fill-gray-500 text-xs">{yAxisLabels[i]}%</text>
					</g>
				)
			})}

			{/* Area gradient */}
			<defs>
				<linearGradient id="punctualityGradient" x1="0%" y1="0%" x2="0%" y2="100%">
					<stop offset="0%" stopColor="#10b981" stopOpacity="0.3" />
					<stop offset="100%" stopColor="#10b981" stopOpacity="0.05" />
				</linearGradient>
			</defs>
			<polygon fill="url(#punctualityGradient)" points={`${padding.left},${height - padding.bottom} ${points} ${width - padding.right},${height - padding.bottom}`} />

			{/* Line */}
			<polyline fill="none" stroke="#10b981" strokeWidth={3} points={points} />

			{/* Data points */}
			{data.map((v, i) => {
				const x = padding.left + i * step
				const y = padding.top + chartH - (v / max) * chartH
				const isHovered = hoverIdx === i
				return (
					<circle
						key={i}
						cx={x}
						cy={y}
						r={isHovered ? 6 : 4}
						fill="#10b981"
						stroke="#059669"
						strokeWidth={2}
						className="transition-all duration-200 cursor-pointer"
						onMouseEnter={() => setHoverIdx(i)}
						onMouseLeave={() => setHoverIdx(null)}
					/>
				)
			})}

			{/* Hover indicator */}
			{hoverIdx !== null && (() => {
				const x = padding.left + hoverIdx * step
				const y = padding.top + chartH - (data[hoverIdx] / max) * chartH
				return (
					<g>
						<line x1={x} x2={x} y1={padding.top} y2={height - padding.bottom} stroke="#9ca3af" strokeDasharray="4 4" strokeWidth={1} />
						<circle cx={x} cy={y} r={8} fill="#10b981" stroke="#059669" strokeWidth={3} opacity={0.8} />
						<g transform={`translate(${Math.min(x + 15, width - 140)}, ${Math.max(padding.top + 10, y - 30)})`}>
							<rect x={-60} y={-18} rx={8} ry={8} width={120} height={50} fill="#1f2937" opacity={0.95} />
							<text x={0} y={-2} textAnchor="middle" className="fill-white text-sm font-semibold">{labels[hoverIdx]}</text>
							<text x={0} y={18} textAnchor="middle" className="fill-gray-300 text-xs">
								Punctuality: {data[hoverIdx].toFixed(1)}%
							</text>
						</g>
					</g>
				)
			})()}

			{/* Axes */}
			<line x1={padding.left} x2={width - padding.right} y1={height - padding.bottom} y2={height - padding.bottom} stroke="#6b7280" strokeWidth={2} />
			<line x1={padding.left} x2={padding.left} y1={padding.top} y2={height - padding.bottom} stroke="#6b7280" strokeWidth={2} />

			{/* X axis labels */}
			{labels.map((l, i) => {
				const x = padding.left + i * step
				return (
					<text key={i} x={x} y={height - 12} textAnchor="middle" className="fill-gray-700 text-xs font-medium">
						{l}
					</text>
				)
			})}

			{/* Interactive area */}
			<rect 
				x={padding.left} 
				y={padding.top} 
				width={chartW} 
				height={chartH} 
				fill="transparent" 
				onMouseMove={(e) => {
					const svg = (e.currentTarget.ownerSVGElement as SVGSVGElement)
					const rect = svg.getBoundingClientRect()
					const x = e.clientX - rect.left - padding.left
					const rawIdx = x / step
					const idx = Math.min(data.length - 1, Math.max(0, Math.round(rawIdx)))
					setHoverIdx(idx)
				}} 
				onMouseLeave={() => setHoverIdx(null)} 
			/>
		</svg>
	)
}

// Bar Chart Component for Top Delayed Trains
function TopDelayedTrainsChart({ data }: { data: Array<{ train_id: string; delay_minutes: number }> }) {
	const max = Math.max(1, ...data.map(d => d.delay_minutes))
	const width = 800
	const height = 350
	const padding = { top: 30, right: 30, bottom: 80, left: 60 }
	const chartW = width - padding.left - padding.right
	const chartH = height - padding.top - padding.bottom
	const barW = Math.max(30, chartW / data.length - 20)
	const [hoverIdx, setHoverIdx] = useState<number | null>(null)

	return (
		<svg viewBox={`0 0 ${width} ${height}`} className="w-full h-96">
			{/* Grid lines */}
			{[0, 0.25, 0.5, 0.75, 1].map((g, i) => {
				const y = padding.top + chartH * (1 - g)
				const label = Math.round(g * max)
				return (
					<g key={i}>
						<line x1={padding.left} x2={width - padding.right} y1={y} y2={y} stroke="#e5e7eb" strokeDasharray="4 4" strokeWidth={1} />
						<text x={padding.left - 8} y={y + 4} textAnchor="end" className="fill-gray-500 text-xs">{label} min</text>
					</g>
				)
			})}

			{/* Bars */}
			{data.map((d, i) => {
				const x = padding.left + i * (barW + 20) + 10
				const h = (d.delay_minutes / max) * chartH
				const y = padding.top + chartH - h
				const isHovered = hoverIdx === i

				return (
					<g key={i} onMouseEnter={() => setHoverIdx(i)} onMouseLeave={() => setHoverIdx(null)}>
						{/* Bar shadow */}
						<rect x={x + 2} y={y + 2} width={barW} height={h} rx={6} fill="#000" opacity={0.1} />
						{/* Bar */}
						<rect
							x={x}
							y={y}
							width={barW}
							height={h}
							rx={6}
							fill={isHovered ? "#ef4444" : "#dc2626"}
							opacity={isHovered ? 1 : 0.85}
							className="transition-all duration-200"
						/>
						{/* Value label */}
						{h > 20 && (
							<text x={x + barW / 2} y={y - 5} textAnchor="middle" className="fill-gray-700 text-xs font-semibold">
								{d.delay_minutes.toFixed(0)}
							</text>
						)}
						{/* Train ID label */}
						<text 
							x={x + barW / 2} 
							y={height - 20} 
							textAnchor="middle" 
							className="fill-gray-700 text-xs font-medium"
							transform={`rotate(-45 ${x + barW / 2} ${height - 20})`}
						>
							{d.train_id}
						</text>

						{/* Tooltip */}
						{isHovered && (
							<g transform={`translate(${x + barW / 2}, ${padding.top + 20})`}>
								<rect x={-50} y={-18} rx={8} ry={8} width={100} height={42} fill="#1f2937" opacity={0.95} />
								<text x={0} y={-2} textAnchor="middle" className="fill-white text-sm font-semibold">{d.train_id}</text>
								<text x={0} y={16} textAnchor="middle" className="fill-gray-300 text-xs">
									Delay: {d.delay_minutes.toFixed(1)} min
								</text>
							</g>
						)}
					</g>
				)
			})}

			{/* Axes */}
			<line x1={padding.left} x2={padding.left} y1={padding.top} y2={height - padding.bottom} stroke="#6b7280" strokeWidth={2} />
			<line x1={padding.left} x2={width - padding.right} y1={height - padding.bottom} y2={height - padding.bottom} stroke="#6b7280" strokeWidth={2} />
		</svg>
	)
}

// Zone Efficiency Score Chart (Bar chart showing efficiency scores)
function ZoneEfficiencyChart({ data }: { data: Array<{ zone: string; efficiency: number }> }) {
	const max = Math.max(1, ...data.map(d => d.efficiency), 100)
	const width = 800
	const height = 350
	const padding = { top: 30, right: 30, bottom: 50, left: 60 }
	const chartW = width - padding.left - padding.right
	const chartH = height - padding.top - padding.bottom
	const barW = Math.max(40, chartW / data.length - 30)
	const [hoverIdx, setHoverIdx] = useState<number | null>(null)

	return (
		<svg viewBox={`0 0 ${width} ${height}`} className="w-full h-96">
			{/* Grid lines */}
			{[0, 0.25, 0.5, 0.75, 1].map((g, i) => {
				const y = padding.top + chartH * (1 - g)
				const label = Math.round(g * max)
				return (
					<g key={i}>
						<line x1={padding.left} x2={width - padding.right} y1={y} y2={y} stroke="#e5e7eb" strokeDasharray="4 4" strokeWidth={1} />
						<text x={padding.left - 8} y={y + 4} textAnchor="end" className="fill-gray-500 text-xs">{label}</text>
					</g>
				)
			})}

			{/* Bars */}
			{data.map((d, i) => {
				const x = padding.left + i * (barW + 30) + 15
				const h = (d.efficiency / max) * chartH
				const y = padding.top + chartH - h
				const isHovered = hoverIdx === i
				const color = d.efficiency >= 80 ? '#10b981' : d.efficiency >= 60 ? '#f59e0b' : '#ef4444'

				return (
					<g key={i} onMouseEnter={() => setHoverIdx(i)} onMouseLeave={() => setHoverIdx(null)}>
						<rect x={x + 2} y={y + 2} width={barW} height={h} rx={6} fill="#000" opacity={0.1} />
						<rect
							x={x}
							y={y}
							width={barW}
							height={h}
							rx={6}
							fill={color}
							opacity={isHovered ? 1 : 0.85}
							className="transition-all duration-200"
						/>
						{h > 20 && (
							<text x={x + barW / 2} y={y - 5} textAnchor="middle" className="fill-gray-700 text-xs font-semibold">
								{d.efficiency.toFixed(0)}
							</text>
						)}
						<text x={x + barW / 2} y={height - 20} textAnchor="middle" className="fill-gray-700 text-xs font-medium">
							{d.zone}
						</text>
						{isHovered && (
							<g transform={`translate(${x + barW / 2}, ${padding.top + 20})`}>
								<rect x={-60} y={-18} rx={8} ry={8} width={120} height={42} fill="#1f2937" opacity={0.95} />
								<text x={0} y={-2} textAnchor="middle" className="fill-white text-sm font-semibold">{d.zone}</text>
								<text x={0} y={16} textAnchor="middle" className="fill-gray-300 text-xs">
									Efficiency: {d.efficiency.toFixed(1)}
								</text>
							</g>
						)}
					</g>
				)
			})}

			{/* Axes */}
			<line x1={padding.left} x2={padding.left} y1={padding.top} y2={height - padding.bottom} stroke="#6b7280" strokeWidth={2} />
			<line x1={padding.left} x2={width - padding.right} y1={height - padding.bottom} y2={height - padding.bottom} stroke="#6b7280" strokeWidth={2} />
		</svg>
	)
}

export default function ReportsPage() {
	const navigate = useNavigate()
	const reportRef = useRef<HTMLDivElement | null>(null)
	const { selectedZone, selectedDivisionKey, setZone, setDivisionKey, availableZones, availableDivisionKeys } = useZoneFilter()

	// Filter states
	const [dateRangePreset, setDateRangePreset] = useState<DateRangePreset>('7d')
	const [customDateRange, setCustomDateRange] = useState<DateRange>(() => {
		const end = new Date()
		const start = new Date()
		start.setDate(start.getDate() - 7)
		return { start, end }
	})
	const [selectedTrainType, setSelectedTrainType] = useState<TrainType | 'all'>('all')

	// Data states
	const [punctualityData, setPunctualityData] = useState<{ labels: string[]; values: number[] }>({ labels: [], values: [] })
	const [topDelayedTrains, setTopDelayedTrains] = useState<Array<{ train_id: string; delay_minutes: number }>>([])
	const [zoneEfficiency, setZoneEfficiency] = useState<Array<{ zone: string; efficiency: number }>>([])
	const [trainPerformance, setTrainPerformance] = useState<Array<{
		train_id: string
		train_type: string
		zone: string
		division: string
		avg_delay: number
		on_time_pct: number
		total_trips: number
	}>>([])
	const [divisionSummary, setDivisionSummary] = useState<Array<{
		zone: string
		division: string
		total_trains: number
		avg_delay: number
		on_time_pct: number
		efficiency_score: number
	}>>([])

	const [loading, setLoading] = useState<boolean>(true)
	const [error, setError] = useState<string | null>(null)
	const [lastRefresh, setLastRefresh] = useState<Date>(new Date())

	// Calculate hours from date range
	const hours = useMemo(() => {
		if (dateRangePreset === '24h') return 24
		if (dateRangePreset === '7d') return 168
		if (dateRangePreset === '30d') return 720
		const diffMs = customDateRange.end.getTime() - customDateRange.start.getTime()
		return Math.ceil(diffMs / (1000 * 60 * 60))
	}, [dateRangePreset, customDateRange])

	// Helper function to handle API errors, especially 401
	const handleApiError = (error: any, defaultReturn: any) => {
		// Check if it's an authentication error (various patterns)
		const errorMsg = error?.message || String(error || '')
		const isAuthError = 
			errorMsg === 'Unauthorized' || 
			errorMsg.includes('401') || 
			errorMsg.includes('credentials') ||
			errorMsg.includes('Could not validate') ||
			errorMsg.includes('expired') ||
			errorMsg.includes('token')
		
		if (isAuthError) {
			localStorage.removeItem('token')
			navigate('/login')
			return defaultReturn
		}
		// For other errors, log and return default
		console.error('API error:', error)
		return defaultReturn
	}

	// Fetch and process data
	const fetchData = async () => {
		setLoading(true)
		setError(null)
		try {
			// Fetch all required data with proper error handling
			const [delayTrends, zoneSummary, trainLogsData] = await Promise.all([
				fetchDelayTrends(hours).catch((e) => handleApiError(e, { labels: [], series: [] } as DelayTrendsResponse)),
				fetchZoneSummary(hours).catch((e) => handleApiError(e, { zones: [], divisions: [] } as ZoneSummaryResponse)),
				fetchTrainLogs({ hours }).catch((e) => handleApiError(e, { logs: [], total: 0 })),
			])

			const logs = trainLogsData.logs || []

			// Filter logs by zone/division if selected
			const filteredLogs = logs.filter((log: TrainLog) => {
				if (!selectedZone) return true
				const backendZone = getBackendZoneName(selectedZone)
				// We'll need to resolve zone from section_id - for now, accept all if zone matches
				return doesRecordMatchScope({
					scopeZone: selectedZone,
					scopeDivisionKey: selectedDivisionKey || undefined,
					recordZone: backendZone,
					recordDivision: undefined, // Would need to resolve from section_id
				})
			})

			// Calculate punctuality trend (on-time percentage over time)
			const punctualityMap = new Map<string, { onTime: number; total: number }>()
			filteredLogs.forEach((log: TrainLog) => {
				const date = new Date(log.timestamp).toISOString().split('T')[0]
				const entry = punctualityMap.get(date) || { onTime: 0, total: 0 }
				entry.total++
				if ((log.delay_minutes || 0) <= 5) {
					entry.onTime++
				}
				punctualityMap.set(date, entry)
			})

			const punctualityEntries = Array.from(punctualityMap.entries())
				.sort(([a], [b]) => a.localeCompare(b))
				.slice(-30) // Last 30 days

			setPunctualityData({
				labels: punctualityEntries.map(([date]) => {
					const d = new Date(date)
					return `${d.getDate()}/${d.getMonth() + 1}`
				}),
				values: punctualityEntries.map(([, stats]) => (stats.total > 0 ? (stats.onTime / stats.total) * 100 : 0)),
			})

			// Calculate top delayed trains
			const trainDelayMap = new Map<string, { totalDelay: number; count: number }>()
			filteredLogs.forEach((log: TrainLog) => {
				if (!log.train_id || !log.delay_minutes) return
				const entry = trainDelayMap.get(log.train_id) || { totalDelay: 0, count: 0 }
				entry.totalDelay += log.delay_minutes
				entry.count++
				trainDelayMap.set(log.train_id, entry)
			})

			const topDelayed = Array.from(trainDelayMap.entries())
				.map(([train_id, stats]) => ({
					train_id,
					delay_minutes: stats.totalDelay / stats.count,
				}))
				.sort((a, b) => b.delay_minutes - a.delay_minutes)
				.slice(0, 10)

			setTopDelayedTrains(topDelayed)

			// Calculate zone efficiency scores
			const zoneStats = new Map<string, { totalDelay: number; onTime: number; total: number }>()
			filteredLogs.forEach((log: TrainLog) => {
				// Resolve zone from section_id (simplified - would need proper resolution)
				const zone = zoneSummary.zones.find((z: { zone: string }) => z.zone)?.zone || 'Unknown'
				const entry = zoneStats.get(zone) || { totalDelay: 0, onTime: 0, total: 0 }
				entry.total++
				if (log.delay_minutes) entry.totalDelay += log.delay_minutes
				if ((log.delay_minutes || 0) <= 5) entry.onTime++
				zoneStats.set(zone, entry)
			})

			// Use zone summary data for efficiency
			const efficiencyData = zoneSummary.zones.map((zone: { zone: string; avg_delay: number; congestion_level: number }) => {
				const avgDelay = zone.avg_delay || 0
				const congestion = zone.congestion_level || 0
				// Efficiency = 100 - (avg_delay * 2) - (congestion * 20), clamped to 0-100
				const efficiency = Math.max(0, Math.min(100, 100 - (avgDelay * 2) - (congestion * 20)))
				return {
					zone: zone.zone,
					efficiency: Math.round(efficiency * 10) / 10,
				}
			})

			setZoneEfficiency(efficiencyData)

			// Calculate train-wise performance
			const trainPerfMap = new Map<string, {
				train_id: string
				train_type: string
				zone: string
				division: string
				delays: number[]
				onTime: number
				total: number
			}>()

			filteredLogs.forEach((log: TrainLog) => {
				if (!log.train_id) return
				const entry = trainPerfMap.get(log.train_id) || {
					train_id: log.train_id,
					train_type: 'Unknown',
					zone: 'Unknown',
					division: 'Unknown',
					delays: [],
					onTime: 0,
					total: 0,
				}
				entry.total++
				if (log.delay_minutes) entry.delays.push(log.delay_minutes)
				if ((log.delay_minutes || 0) <= 5) entry.onTime++
				trainPerfMap.set(log.train_id, entry)
			})

			const trainPerf = Array.from(trainPerfMap.values()).map(entry => ({
				train_id: entry.train_id,
				train_type: entry.train_type,
				zone: entry.zone,
				division: entry.division,
				avg_delay: entry.delays.length > 0 ? entry.delays.reduce((a, b) => a + b, 0) / entry.delays.length : 0,
				on_time_pct: entry.total > 0 ? (entry.onTime / entry.total) * 100 : 0,
				total_trips: entry.total,
			}))

			// Filter by train type if selected
			const filteredTrainPerf = selectedTrainType === 'all' 
				? trainPerf 
				: trainPerf.filter(t => t.train_type.toLowerCase() === selectedTrainType.toLowerCase())

			setTrainPerformance(filteredTrainPerf)

			// Division summary
			const divisionData = zoneSummary.divisions.map((div: { zone: string; division: string; avg_delay: number; congestion_level: number; running_trains: number }) => {
				const avgDelay = div.avg_delay || 0
				const congestion = div.congestion_level || 0
				const efficiency = Math.max(0, Math.min(100, 100 - (avgDelay * 2) - (congestion * 20)))
				return {
					zone: div.zone,
					division: div.division,
					total_trains: div.running_trains || 0,
					avg_delay: avgDelay,
					on_time_pct: 100 - (avgDelay * 5), // Simplified calculation
					efficiency_score: Math.round(efficiency * 10) / 10,
				}
			})

			setDivisionSummary(divisionData)
			setLastRefresh(new Date())
		} catch (e: any) {
			console.error('Reports fetch error:', e)
			// Check if it's an authentication error
			if (e?.message === 'Unauthorized' || e?.message?.includes('401') || e?.message?.includes('credentials')) {
				localStorage.removeItem('token')
				navigate('/login')
				return
			}
			setError(e?.message || 'Failed to load reports. Please check your connection and try again.')
		} finally {
			setLoading(false)
		}
	}

	useEffect(() => {
		fetchData()
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [hours, selectedZone, selectedDivisionKey, selectedTrainType])

	// Export functions
	const downloadCSV = () => {
		const lines: string[] = []
		lines.push('RailSarthi Historical Reports & Analytics')
		lines.push(`Generated: ${new Date().toLocaleString()}`)
		lines.push(`Date Range: ${dateRangePreset === 'custom' ? `${customDateRange.start.toLocaleDateString()} to ${customDateRange.end.toLocaleDateString()}` : dateRangePreset}`)
		lines.push(`Zone: ${selectedZone || 'All'}`)
		lines.push(`Division: ${selectedDivisionKey || 'All'}`)
		lines.push(`Train Type: ${selectedTrainType === 'all' ? 'All' : selectedTrainType}`)
		lines.push('')

		lines.push('=== Punctuality Trend ===')
		lines.push('Date,Punctuality %')
		punctualityData.labels.forEach((label, i) => {
			lines.push(`${label},${punctualityData.values[i].toFixed(2)}`)
		})
		lines.push('')

		lines.push('=== Top Delayed Trains ===')
		lines.push('Train ID,Average Delay (minutes)')
		topDelayedTrains.forEach(t => {
			lines.push(`${t.train_id},${t.delay_minutes.toFixed(2)}`)
		})
		lines.push('')

		lines.push('=== Zone Efficiency Scores ===')
		lines.push('Zone,Efficiency Score')
		zoneEfficiency.forEach(z => {
			lines.push(`${z.zone},${z.efficiency.toFixed(2)}`)
		})
		lines.push('')

		lines.push('=== Train-wise Performance ===')
		lines.push('Train ID,Train Type,Zone,Division,Avg Delay (min),On-Time %,Total Trips')
		trainPerformance.forEach(t => {
			lines.push(`${t.train_id},${t.train_type},${t.zone},${t.division},${t.avg_delay.toFixed(2)},${t.on_time_pct.toFixed(2)},${t.total_trips}`)
		})
		lines.push('')

		lines.push('=== Division Summary ===')
		lines.push('Zone,Division,Total Trains,Avg Delay (min),On-Time %,Efficiency Score')
		divisionSummary.forEach(d => {
			lines.push(`${d.zone},${d.division},${d.total_trains},${d.avg_delay.toFixed(2)},${d.on_time_pct.toFixed(2)},${d.efficiency_score.toFixed(2)}`)
		})

		const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' })
		const url = URL.createObjectURL(blob)
		const a = document.createElement('a')
		a.href = url
		a.download = `railsarthi-reports-${new Date().toISOString().split('T')[0]}.csv`
		document.body.appendChild(a)
		a.click()
		document.body.removeChild(a)
		URL.revokeObjectURL(url)
	}

	const downloadPDF = () => {
		const node = reportRef.current
		if (!node) return

		const printWindow = window.open('', 'PRINT', 'height=800,width=1200')
		if (!printWindow) return

		const htmlContent = `
			<!doctype html>
			<html>
				<head>
					<title>RailSarthi Historical Reports & Analytics</title>
					<style>
						@page { margin: 20mm; }
						body {
							font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
							padding: 20px;
							color: #1f2937;
							background: white;
						}
						h1 { color: #191970; font-size: 28px; margin-bottom: 8px; }
						h2 { color: #374151; font-size: 20px; margin-top: 24px; margin-bottom: 12px; border-bottom: 2px solid #e5e7eb; padding-bottom: 8px; }
						h3 { color: #4b5563; font-size: 16px; margin-top: 16px; margin-bottom: 8px; }
						section { margin-bottom: 24px; page-break-inside: avoid; }
						.meta { font-size: 12px; color: #6b7280; margin-bottom: 16px; }
						table { width: 100%; border-collapse: collapse; margin: 16px 0; }
						th, td { border: 1px solid #e5e7eb; padding: 8px; text-align: left; }
						th { background: #f9fafb; font-weight: 600; }
						@media print {
							body { padding: 0; }
						}
					</style>
				</head>
				<body>
					<h1>📊 Historical Reports & Analytics</h1>
					<div class="meta">
						Generated: ${new Date().toLocaleString()} | 
						Date Range: ${dateRangePreset === 'custom' ? `${customDateRange.start.toLocaleDateString()} to ${customDateRange.end.toLocaleDateString()}` : dateRangePreset} |
						Zone: ${selectedZone || 'All'} |
						Division: ${selectedDivisionKey || 'All'} |
						Train Type: ${selectedTrainType === 'all' ? 'All' : selectedTrainType}
					</div>
					${node.innerHTML}
				</body>
			</html>
		`

		printWindow.document.write(htmlContent)
		printWindow.document.close()
		printWindow.focus()
		setTimeout(() => {
			printWindow.print()
			printWindow.close()
		}, 250)
	}

	return (
		<div className="min-h-screen bg-gradient-to-br from-blue-50 via-blue-100 to-indigo-50 text-gray-900">
			<div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
				{/* Header */}
				<div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-8">
					<div className="flex items-center gap-3">
						<div className="p-3 bg-gradient-to-br from-blue-600 to-blue-700 rounded-xl shadow-lg">
							<span className="text-3xl">📊</span>
						</div>
						<div>
							<h1 className="text-4xl font-extrabold text-gray-900">Reports & Analytics</h1>
							<p className="text-sm text-gray-600 mt-1">
								Historical analytics (Dataset-based)
								{lastRefresh && <span className="ml-2">• Last updated: {lastRefresh.toLocaleTimeString()}</span>}
							</p>
						</div>
					</div>

					<div className="flex flex-wrap items-center gap-3">
						<button
							onClick={fetchData}
							disabled={loading}
							className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-300 text-sm font-medium bg-white text-gray-900 shadow-sm hover:bg-gray-50 hover:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
						>
							<RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
							Refresh
						</button>
						<button
							onClick={downloadCSV}
							className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-300 text-sm font-medium bg-white text-gray-900 shadow-sm hover:bg-gray-50 hover:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
						>
							<Download className="h-4 w-4" />
							CSV
						</button>
						<button
							onClick={downloadPDF}
							className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-300 text-sm font-medium bg-white text-gray-900 shadow-sm hover:bg-gray-50 hover:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
						>
							<Download className="h-4 w-4" />
							PDF
						</button>
					</div>
				</div>

				{/* Filters Section */}
				<div className="bg-white rounded-xl border border-gray-200 p-6 shadow-lg mb-6">
					<div className="flex items-center gap-2 mb-4">
						<Filter className="h-5 w-5 text-gray-600" />
						<h2 className="text-lg font-semibold text-gray-800">Filters</h2>
					</div>
					<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
						{/* Date Range */}
						<div>
							<label className="block text-sm font-medium text-gray-700 mb-2">
								<Calendar className="h-4 w-4 inline mr-1" />
								Date Range
							</label>
							<select
								value={dateRangePreset}
								onChange={(e) => {
									const preset = e.target.value as DateRangePreset
									setDateRangePreset(preset)
									if (preset !== 'custom') {
										const end = new Date()
										const start = new Date()
										if (preset === '24h') start.setHours(start.getHours() - 24)
										else if (preset === '7d') start.setDate(start.getDate() - 7)
										else if (preset === '30d') start.setDate(start.getDate() - 30)
										setCustomDateRange({ start, end })
									}
								}}
								className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm font-medium bg-white text-gray-900 shadow-sm hover:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
							>
								<option value="24h">Last 24 hours</option>
								<option value="7d">Last 7 days</option>
								<option value="30d">Last 30 days</option>
								<option value="custom">Custom range</option>
							</select>
							{dateRangePreset === 'custom' && (
								<div className="mt-2 flex gap-2">
									<input
										type="date"
										value={customDateRange.start.toISOString().split('T')[0]}
										onChange={(e) => setCustomDateRange({ ...customDateRange, start: new Date(e.target.value) })}
										className="flex-1 px-2 py-1 rounded border border-gray-300 text-sm"
									/>
									<input
										type="date"
										value={customDateRange.end.toISOString().split('T')[0]}
										onChange={(e) => setCustomDateRange({ ...customDateRange, end: new Date(e.target.value) })}
										className="flex-1 px-2 py-1 rounded border border-gray-300 text-sm"
									/>
								</div>
							)}
						</div>

						{/* Zone */}
						<div>
							<label className="block text-sm font-medium text-gray-700 mb-2">Zone</label>
							<select
								value={selectedZone || ''}
								onChange={(e) => setZone(e.target.value ? (e.target.value as ZoneDisplayName) : null)}
								className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm font-medium bg-white text-gray-900 shadow-sm hover:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
							>
								<option value="">All Zones</option>
								{availableZones.map(zone => (
									<option key={zone} value={zone}>{zone}</option>
								))}
							</select>
						</div>

						{/* Division */}
						<div>
							<label className="block text-sm font-medium text-gray-700 mb-2">Division</label>
							<select
								value={selectedDivisionKey || ''}
								onChange={(e) => setDivisionKey(e.target.value || null)}
								disabled={!selectedZone}
								className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm font-medium bg-white text-gray-900 shadow-sm hover:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
							>
								<option value="">All Divisions</option>
								{availableDivisionKeys.map(div => (
									<option key={div} value={div}>{div}</option>
								))}
							</select>
						</div>

						{/* Train Type */}
						<div>
							<label className="block text-sm font-medium text-gray-700 mb-2">Train Type</label>
							<select
								value={selectedTrainType}
								onChange={(e) => setSelectedTrainType(e.target.value as TrainType | 'all')}
								className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm font-medium bg-white text-gray-900 shadow-sm hover:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
							>
								<option value="all">All Types</option>
								{TRAIN_TYPES.map(type => (
									<option key={type} value={type}>{type}</option>
								))}
							</select>
						</div>
					</div>
				</div>

				{/* Error Message */}
				{error && (
					<div className="mb-6 p-4 rounded-lg bg-red-50 border border-red-200 text-red-700 flex items-center gap-2">
						<AlertCircle className="h-5 w-5" />
						<span>{error}</span>
					</div>
				)}

				{/* Main Content */}
				{loading && punctualityData.labels.length === 0 ? (
					<div className="flex items-center justify-center py-20">
						<div className="text-center">
							<RefreshCw className="h-12 w-12 text-blue-600 animate-spin mx-auto mb-4" />
							<p className="text-gray-600">Loading reports data...</p>
						</div>
					</div>
				) : (
					<div ref={reportRef}>
						{/* Charts Section */}
						<div className="grid gap-6 lg:grid-cols-2 mb-6">
							{/* Punctuality Trend */}
							<section className="rounded-xl border border-gray-200 bg-white p-6 shadow-lg">
								<h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
									<TrendingUp className="h-5 w-5 text-green-600" />
									Punctuality Trend
								</h3>
								{punctualityData.labels.length > 0 ? (
									<PunctualityTrendChart data={punctualityData.values} labels={punctualityData.labels} />
								) : (
									<div className="h-96 flex items-center justify-center text-gray-500">No data available</div>
								)}
							</section>

							{/* Top Delayed Trains */}
							<section className="rounded-xl border border-gray-200 bg-white p-6 shadow-lg">
								<h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
									<BarChart3 className="h-5 w-5 text-red-600" />
									Top Delayed Trains
								</h3>
								{topDelayedTrains.length > 0 ? (
									<TopDelayedTrainsChart data={topDelayedTrains} />
								) : (
									<div className="h-96 flex items-center justify-center text-gray-500">No data available</div>
								)}
							</section>
						</div>

						{/* Zone-wise Efficiency Score */}
						<div className="mb-6">
							<section className="rounded-xl border border-gray-200 bg-white p-6 shadow-lg">
								<h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
									<CheckCircle2 className="h-5 w-5 text-blue-600" />
									Zone-wise Efficiency Score
								</h3>
								{zoneEfficiency.length > 0 ? (
									<ZoneEfficiencyChart data={zoneEfficiency} />
								) : (
									<div className="h-96 flex items-center justify-center text-gray-500">No data available</div>
								)}
							</section>
						</div>

						{/* Tables Section */}
						<div className="grid gap-6 lg:grid-cols-2 mb-6">
							{/* Train-wise Performance */}
							<section className="rounded-xl border border-gray-200 bg-white p-6 shadow-lg">
								<h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
									<Train className="h-5 w-5 text-purple-600" />
									Train-wise Performance
								</h3>
								<div className="overflow-x-auto">
									<table className="w-full text-sm">
										<thead>
											<tr className="border-b border-gray-200">
												<th className="text-left py-2 px-3 font-semibold text-gray-700">Train ID</th>
												<th className="text-left py-2 px-3 font-semibold text-gray-700">Type</th>
												<th className="text-right py-2 px-3 font-semibold text-gray-700">Avg Delay</th>
												<th className="text-right py-2 px-3 font-semibold text-gray-700">On-Time %</th>
												<th className="text-right py-2 px-3 font-semibold text-gray-700">Trips</th>
											</tr>
										</thead>
										<tbody>
											{trainPerformance.slice(0, 20).map((train, i) => (
												<tr key={i} className="border-b border-gray-100 hover:bg-gray-50">
													<td className="py-2 px-3 font-medium">{train.train_id}</td>
													<td className="py-2 px-3 text-gray-600">{train.train_type}</td>
													<td className="py-2 px-3 text-right">
														<span className={train.avg_delay > 10 ? 'text-red-600' : train.avg_delay > 5 ? 'text-yellow-600' : 'text-green-600'}>
															{train.avg_delay.toFixed(1)} min
														</span>
													</td>
													<td className="py-2 px-3 text-right">
														<span className={train.on_time_pct >= 90 ? 'text-green-600' : train.on_time_pct >= 70 ? 'text-yellow-600' : 'text-red-600'}>
															{train.on_time_pct.toFixed(1)}%
														</span>
													</td>
													<td className="py-2 px-3 text-right text-gray-600">{train.total_trips}</td>
												</tr>
											))}
											{trainPerformance.length === 0 && (
												<tr>
													<td colSpan={5} className="py-8 text-center text-gray-500">No data available</td>
												</tr>
											)}
										</tbody>
									</table>
								</div>
							</section>

							{/* Division Summary */}
							<section className="rounded-xl border border-gray-200 bg-white p-6 shadow-lg">
								<h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
									<Clock className="h-5 w-5 text-indigo-600" />
									Division Summary
								</h3>
								<div className="overflow-x-auto">
									<table className="w-full text-sm">
										<thead>
											<tr className="border-b border-gray-200">
												<th className="text-left py-2 px-3 font-semibold text-gray-700">Zone</th>
												<th className="text-left py-2 px-3 font-semibold text-gray-700">Division</th>
												<th className="text-right py-2 px-3 font-semibold text-gray-700">Trains</th>
												<th className="text-right py-2 px-3 font-semibold text-gray-700">Avg Delay</th>
												<th className="text-right py-2 px-3 font-semibold text-gray-700">On-Time %</th>
												<th className="text-right py-2 px-3 font-semibold text-gray-700">Efficiency</th>
											</tr>
										</thead>
										<tbody>
											{divisionSummary.map((div, i) => (
												<tr key={i} className="border-b border-gray-100 hover:bg-gray-50">
													<td className="py-2 px-3 font-medium">{div.zone}</td>
													<td className="py-2 px-3 text-gray-600">{div.division}</td>
													<td className="py-2 px-3 text-right text-gray-600">{div.total_trains}</td>
													<td className="py-2 px-3 text-right">
														<span className={div.avg_delay > 10 ? 'text-red-600' : div.avg_delay > 5 ? 'text-yellow-600' : 'text-green-600'}>
															{div.avg_delay.toFixed(1)} min
														</span>
													</td>
													<td className="py-2 px-3 text-right">
														<span className={div.on_time_pct >= 90 ? 'text-green-600' : div.on_time_pct >= 70 ? 'text-yellow-600' : 'text-red-600'}>
															{div.on_time_pct.toFixed(1)}%
														</span>
													</td>
													<td className="py-2 px-3 text-right">
														<span className={div.efficiency_score >= 80 ? 'text-green-600' : div.efficiency_score >= 60 ? 'text-yellow-600' : 'text-red-600'}>
															{div.efficiency_score.toFixed(1)}
														</span>
													</td>
												</tr>
											))}
											{divisionSummary.length === 0 && (
												<tr>
													<td colSpan={6} className="py-8 text-center text-gray-500">No data available</td>
												</tr>
											)}
										</tbody>
									</table>
								</div>
							</section>
						</div>
					</div>
				)}
			</div>
		</div>
	)
}
