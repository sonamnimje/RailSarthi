import React, { useEffect, useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { fetchKpis, fetchDelayTrends, fetchThroughput } from '../lib/api'
import { useZoneFilter } from '../lib/ZoneFilterContext'
import { useRealTimeData } from '../lib/RealTimeDataContext'
import { INDIAN_RAILWAY_ZONES, ZONE_TO_DIVISIONS, makeDivisionKey, type ZoneDisplayName } from '../lib/zoneData'
import { 
	Train, 
	AlertCircle, 
	Clock, 
	TrendingUp, 
	TrendingDown, 
	CheckCircle2, 
	Activity,
	Brain,
	RefreshCw,
	BarChart3,
	LineChart as LineChartIcon,
	Search,
	X
} from 'lucide-react'

type BarDatum = { label: string; value: number }

// KPI Card Component
function KPICard({ 
	title, 
	value, 
	unit, 
	icon, 
	trend, 
	color = 'blue',
	description 
}: { 
	title: string
	value: number | string
	unit?: string
	icon: React.ReactNode
	trend?: { value: number; label: string }
	color?: 'blue' | 'green' | 'yellow' | 'red' | 'purple' | 'indigo'
	description?: string
}) {
	const colorClasses = {
		blue: 'from-blue-500 to-blue-600',
		green: 'from-green-500 to-green-600',
		yellow: 'from-yellow-500 to-yellow-600',
		red: 'from-red-500 to-red-600',
		purple: 'from-purple-500 to-purple-600',
		indigo: 'from-indigo-500 to-indigo-600',
	}
	
	return (
		<div className="relative overflow-hidden rounded-xl border border-gray-200 bg-white p-6 shadow-lg transition-all duration-300 hover:shadow-xl hover:scale-[1.02] h-full flex flex-col">
			<div className={`absolute top-0 right-0 h-24 w-24 bg-gradient-to-br ${colorClasses[color]} opacity-10 rounded-bl-full`}></div>
			
			<div className="relative z-10 flex flex-col flex-1">
				<div className="flex items-center justify-between mb-3">
					<div className={`p-3 rounded-lg bg-gradient-to-br ${colorClasses[color]} text-white shadow-md`}>
						{icon}
					</div>
					{trend && (
						<div className={`flex items-center gap-1 text-sm font-semibold ${
							trend.value >= 0 ? 'text-green-600' : 'text-red-600'
						}`}>
							{trend.value >= 0 ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
							<span>{Math.abs(trend.value)}%</span>
						</div>
					)}
				</div>
				<h3 className="text-sm font-medium text-gray-600 mb-1">{title}</h3>
				<div className="flex items-baseline gap-2 mb-2">
					<span className="text-3xl font-bold text-gray-900">{value}</span>
					{unit && <span className="text-sm text-gray-500">{unit}</span>}
				</div>
				{description && <p className="text-xs text-gray-500 mt-auto">{description}</p>}
			</div>
		</div>
	)
}

// Line Chart Component
function LineChart({ series, labels, max, legendLabel = 'series', color = '#3b82f6', pointColor = '#2563eb' }: { series: number[]; labels: string[]; max?: number; legendLabel?: string; color?: string; pointColor?: string }) {
	const computedMax = useMemo(() => max ?? Math.max(1, ...series), [series, max])
	const width = 760
	const height = 320
	const padding = { top: 30, right: 30, bottom: 50, left: 50 }
	const chartW = width - padding.left - padding.right
	const chartH = height - padding.top - padding.bottom
	const step = chartW / Math.max(1, series.length - 1)
	const [hoverIdx, setHoverIdx] = useState<number | null>(null)
	
	const points = series.map((v, i) => {
		const x = padding.left + i * step
		const y = padding.top + chartH - (v / computedMax) * chartH
		return `${x},${y}`
	}).join(' ')
	
	const gridLines = [0, 0.25, 0.5, 0.75, 1]
	const yAxisLabels = gridLines.map(g => Math.round(g * computedMax))
	
	function handleMouseMove(e: React.MouseEvent<SVGRectElement, MouseEvent>) {
		const svg = (e.currentTarget.ownerSVGElement as SVGSVGElement)
		const rect = svg.getBoundingClientRect()
		const x = e.clientX - rect.left - padding.left
		const rawIdx = x / step
		const idx = Math.min(series.length - 1, Math.max(0, Math.round(rawIdx)))
		setHoverIdx(idx)
	}
	
	return (
		<svg viewBox={`0 0 ${width} ${height}`} className="w-full h-96">
			{gridLines.map((g, i) => {
				const y = padding.top + chartH * (1 - g)
				return (
					<g key={i}>
						<line x1={padding.left} x2={width - padding.right} y1={y} y2={y} stroke="#e5e7eb" strokeDasharray="4 4" strokeWidth={1} />
						<text x={padding.left - 8} y={y + 4} textAnchor="end" className="fill-gray-500 text-xs">{yAxisLabels[i]}</text>
					</g>
				)
			})}
			
			<defs>
				<linearGradient id="lineGradient" x1="0%" y1="0%" x2="0%" y2="100%">
					<stop offset="0%" stopColor={color} stopOpacity="0.3" />
					<stop offset="100%" stopColor={color} stopOpacity="0.05" />
				</linearGradient>
			</defs>
			<polygon 
				fill="url(#lineGradient)" 
				points={`${padding.left},${height - padding.bottom} ${points} ${width - padding.right},${height - padding.bottom}`} 
			/>
			
			<polyline fill="none" stroke={color} strokeWidth={3} points={points} />
			
			{series.map((v, i) => {
				const x = padding.left + i * step
				const y = padding.top + chartH - (v / computedMax) * chartH
				const isHovered = hoverIdx === i
				return (
					<circle 
						key={i} 
						cx={x} 
						cy={y} 
						r={isHovered ? 6 : 4} 
						fill={pointColor} 
						stroke={color} 
						strokeWidth={2}
						className="transition-all duration-200"
					/>
				)
			})}
			
			{hoverIdx !== null && (() => {
				const x = padding.left + hoverIdx * step
				const y = padding.top + chartH - (series[hoverIdx] / computedMax) * chartH
				return (
					<g>
						<line x1={x} x2={x} y1={padding.top} y2={height - padding.bottom} stroke="#9ca3af" strokeDasharray="4 4" strokeWidth={1} />
						<circle cx={x} cy={y} r={8} fill={pointColor} stroke={color} strokeWidth={3} opacity={0.8} />
						<g transform={`translate(${Math.min(x + 15, width - 140)}, ${Math.max(padding.top + 10, y - 30)})`}>
							<rect x={-60} y={-18} rx={8} ry={8} width={120} height={50} fill="#1f2937" opacity={0.95} />
							<text x={0} y={-2} textAnchor="middle" className="fill-white text-sm font-semibold">{labels[hoverIdx]}</text>
							<text x={0} y={18} textAnchor="middle" className="fill-gray-300 text-xs">
								{legendLabel}: {series[hoverIdx].toFixed(1)} min
							</text>
						</g>
					</g>
				)
			})()}
			
			<line x1={padding.left} x2={width - padding.right} y1={height - padding.bottom} y2={height - padding.bottom} stroke="#6b7280" strokeWidth={2} />
			<line x1={padding.left} x2={padding.left} y1={padding.top} y2={height - padding.bottom} stroke="#6b7280" strokeWidth={2} />
			
			{labels.map((l, i) => {
				const x = padding.left + i * step
				return (
					<text key={i} x={x} y={height - 12} textAnchor="middle" className="fill-gray-700 text-xs font-medium">
						{l}
					</text>
				)
			})}
			
			<rect x={padding.left} y={padding.top} width={chartW} height={chartH} fill="transparent" onMouseMove={handleMouseMove} onMouseLeave={() => setHoverIdx(null)} />
		</svg>
	)
}

// Bar Chart Component
function BarChart({ data, max, legendLabel = 'value', color = '#3b82f6', tooltipLabel }: { data: BarDatum[]; max?: number; legendLabel?: string; color?: string; tooltipLabel?: string }) {
	const computedMax = useMemo(() => max ?? Math.max(1, ...data.map((d) => d.value)), [data, max])
	const width = 760
	const height = 320
	const padding = { top: 30, right: 30, bottom: 50, left: 50 }
	const chartW = width - padding.left - padding.right
	const chartH = height - padding.top - padding.bottom
	const barW = Math.max(20, chartW / data.length - 24)
	const gridLines = [0, 0.25, 0.5, 0.75, 1]
	const [hoverIdx, setHoverIdx] = useState<number | null>(null)
	
	const yAxisLabels = gridLines.map(g => Math.round(g * computedMax))
	
	return (
		<svg viewBox={`0 0 ${width} ${height}`} className="w-full h-96">
			<rect x={0} y={0} width={width} height={height} fill="transparent" />
			
			{gridLines.map((g, i) => {
				const y = padding.top + chartH * (1 - g)
				return (
					<g key={i}>
						<line x1={padding.left} x2={width - padding.right} y1={y} y2={y} stroke="#e5e7eb" strokeDasharray="4 4" strokeWidth={1} />
						<text x={padding.left - 8} y={y + 4} textAnchor="end" className="fill-gray-500 text-xs">{yAxisLabels[i]}</text>
					</g>
				)
			})}
			
			{hoverIdx !== null && (() => {
				const x = padding.left + hoverIdx * (barW + 24)
				return <rect x={x - 12} y={padding.top} width={barW + 24} height={chartH} fill="#9ca3af" opacity={0.1} rx={4} />
			})()}
			
			{data.map((d, i) => {
				const x = padding.left + i * (barW + 24) + 12
				const h = (d.value / computedMax) * chartH
				const y = padding.top + chartH - h
				const isHovered = hoverIdx === i
				
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
								{d.value}
							</text>
						)}
						<text x={x + barW / 2} y={height - 20} textAnchor="middle" className="fill-gray-700 text-xs font-medium">
							{d.label}
						</text>
						
						{isHovered && (
							<g transform={`translate(${x + barW / 2}, ${padding.top + 20})`}>
								<rect x={-50} y={-18} rx={8} ry={8} width={100} height={42} fill="#1f2937" opacity={0.95} />
								<text x={0} y={-2} textAnchor="middle" className="fill-white text-sm font-semibold">{d.label}</text>
								<text x={0} y={16} textAnchor="middle" className="fill-gray-300 text-xs">
									{(tooltipLabel ?? legendLabel)}: {d.value}
								</text>
							</g>
						)}
					</g>
				)
			})}
			
			<line x1={padding.left} x2={padding.left} y1={padding.top} y2={height - padding.bottom} stroke="#6b7280" strokeWidth={2} />
			<line x1={padding.left} x2={width - padding.right} y1={height - padding.bottom} y2={height - padding.bottom} stroke="#6b7280" strokeWidth={2} />
		</svg>
	)
}

export default function DashboardPage() {
	const [kpis, setKpis] = useState<{ throughput_per_hour: number; avg_delay_minutes: number; congestion_index: number; on_time_percentage: number } | null>(null)
	const [delayTrends, setDelayTrends] = useState<{ labels: string[]; series: number[] } | null>(null)
	const [trainDensity, setTrainDensity] = useState<BarDatum[]>([])
	const [loading, setLoading] = useState(true)
	const [lastUpdated, setLastUpdated] = useState<number>(Date.now())
  const [error, setError] = useState<string | null>(null)
	const [searchEnabled, setSearchEnabled] = useState(false)
	const [searchQuery, setSearchQuery] = useState('')
	const { selectedZone, selectedDivisionKey, setZone, setDivisionKey } = useZoneFilter()
	const { kpis: realTimeKpis, lastUpdate: realTimeLastUpdate, isConnected, refreshData } = useRealTimeData()
	const navigate = useNavigate()
	const [hasSelectedZone, setHasSelectedZone] = useState(false)
	const [hasSelectedDivision, setHasSelectedDivision] = useState(false)
	const isZoneDisplayName = (value: string): value is ZoneDisplayName =>
		INDIAN_RAILWAY_ZONES.includes(value as ZoneDisplayName)

	// Initialize hasSelectedZone if a zone is already selected from localStorage
	useEffect(() => {
		if (selectedZone !== null) {
			setHasSelectedZone(true)
		}
	}, [selectedZone])

	// Initialize hasSelectedDivision if a division is already selected from localStorage
	useEffect(() => {
		if (selectedDivisionKey !== null) {
			setHasSelectedDivision(true)
		}
	}, [selectedDivisionKey])


	// Generate zone data with mock statistics (replace with API calls later)
	// Using fixed seed-based values for consistency
	const zoneData = useMemo(() => INDIAN_RAILWAY_ZONES.map((zone, idx) => {
		// Use index-based calculation for consistent mock data
		const base = (idx * 7 + 13) % 100
		return {
			zone,
			totalTrains: base + 20,
			delayed: Math.floor(base / 5) + 1,
			delayAvg: Math.floor(base / 7) + 3,
			congested: Math.floor(base / 20),
		}
	}), [])

	// Generate division data with mock statistics (replace with API calls later)
	const divisionData = useMemo(() => INDIAN_RAILWAY_ZONES.flatMap((zone, zoneIdx) => {
		const divisions = ZONE_TO_DIVISIONS[zone] || []
		return divisions.map((division, divIdx) => {
			const base = (zoneIdx * 11 + divIdx * 3 + 17) % 100
			return {
				division: makeDivisionKey(zone as ZoneDisplayName, division),
				runningTrains: Math.floor(base / 2) + 10,
				onTimePercent: 75 + Math.floor(base / 5),
				delayAvg: Math.floor(base / 8) + 2,
			}
		})
	}), [])

	// Filter zones based on search query and selected zone
	const filteredZoneData = useMemo(() => {
		let filtered = zoneData

		// Filter by selected zone
		if (selectedZone) {
			filtered = filtered.filter(zone => zone.zone === selectedZone)
		}

		// Filter by search query if enabled
		if (searchEnabled && searchQuery.trim()) {
			const query = searchQuery.toLowerCase()
			filtered = filtered.filter(zone => 
				zone.zone.toLowerCase().includes(query) ||
				zone.totalTrains.toString().includes(query) ||
				zone.delayed.toString().includes(query) ||
				zone.delayAvg.toString().includes(query) ||
				zone.congested.toString().includes(query)
			)
		}

		return filtered
	}, [searchQuery, searchEnabled, selectedZone])

	// Filter divisions based on search query and selected division
	const filteredDivisionData = useMemo(() => {
		let filtered = divisionData

		// Filter by selected division
		if (selectedDivisionKey) {
			filtered = filtered.filter(div => div.division === selectedDivisionKey)
		}

		// Filter by search query if enabled
		if (searchEnabled && searchQuery.trim()) {
			const query = searchQuery.toLowerCase()
			filtered = filtered.filter(div => 
				div.division.toLowerCase().includes(query) ||
				div.runningTrains.toString().includes(query) ||
				div.onTimePercent.toString().includes(query) ||
				div.delayAvg.toString().includes(query)
			)
		}

		return filtered
	}, [searchQuery, searchEnabled, selectedDivisionKey, divisionData])

	// Group divisions by zone for display
	const zoneDivisionGroups = useMemo(() => {
		// Don't show data if no zone has been selected yet
		if (!hasSelectedZone) {
			return []
		}
		
		// If a specific zone is selected (not "All Zones"), require division selection before showing data
		if (selectedZone !== null && !hasSelectedDivision) {
			return []
		}
		
		let groups: Array<{ zone: string; divisions: typeof divisionData }> = []
		
		// Filter zones based on selection
		const zonesToShow = selectedZone 
			? [selectedZone]
			: INDIAN_RAILWAY_ZONES.filter(zone => {
				if (searchEnabled && searchQuery.trim()) {
					const query = searchQuery.toLowerCase()
					return zone.toLowerCase().includes(query)
				}
				return true
			})

		zonesToShow.forEach(zone => {
			const divisions = ZONE_TO_DIVISIONS[zone] || []
			const zoneDivisions = divisions
				.map(division => {
					const fullDivisionName = `${division} (${zone})`
					return divisionData.find(d => d.division === fullDivisionName)
				})
				.filter((d): d is typeof divisionData[0] => d !== undefined)
				.filter(div => {
					// Filter by selected division
					if (selectedDivisionKey && div.division !== selectedDivisionKey) return false
					
					// Filter by search query
					if (searchEnabled && searchQuery.trim()) {
						const query = searchQuery.toLowerCase()
						return div.division.toLowerCase().includes(query) ||
							div.runningTrains.toString().includes(query) ||
							div.onTimePercent.toString().includes(query) ||
							div.delayAvg.toString().includes(query)
					}
					return true
				})

			if (zoneDivisions.length > 0) {
				groups.push({ zone, divisions: zoneDivisions })
			}
		})

		return groups
	}, [selectedZone, selectedDivisionKey, searchQuery, searchEnabled, divisionData, hasSelectedZone, hasSelectedDivision])

	const predictions = [
		{ time: 'Next 2 hours', prediction: 'Expected delays in CR zone due to heavy traffic', risk: 'medium' },
		{ section: 'SEC-001', prediction: 'Congestion expected to peak at 6 PM', risk: 'high' },
		{ section: 'SEC-003', prediction: 'Low congestion expected throughout day', risk: 'low' },
	]

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      setError(null)
      try {
				// Fetch KPIs
				const kpisData = await fetchKpis().catch(() => ({
					throughput_per_hour: 238,
					avg_delay_minutes: 12,
					congestion_index: 6,
					on_time_percentage: 85
				}))
				if (cancelled) return
				// Use real-time KPIs if available, otherwise use fetched data
				setKpis(realTimeKpis || kpisData)

				// Fetch delay trends
				const trendsData = await fetchDelayTrends(24).catch(() => ({
					labels: ['6 AM', '9 AM', '12 PM', '3 PM', '6 PM', '9 PM', '6 AM'],
					series: [22, 25, 28, 24, 27, 23, 20]
				}))
				if (cancelled) return
				setDelayTrends(trendsData)

				// Fetch train density (using throughput as proxy)
				const densityData = await fetchThroughput(24).catch(() => ({
					data: [
						{ label: '6 AM', value: 25 },
						{ label: '9 AM', value: 35 },
						{ label: '12 PM', value: 45 },
						{ label: '3 PM', value: 40 },
						{ label: '6 PM', value: 38 },
						{ label: '9 PM', value: 30 },
						{ label: '6 AM', value: 22 },
					]
				}))
        if (cancelled) return
				setTrainDensity(
					(densityData.data || []).map((entry: any) => ({
						label: entry.label ?? entry.type ?? 'Bucket',
						value: entry.value ?? entry.throughput ?? 0,
					}))
				)

        // Use real-time last update if available
        setLastUpdated(realTimeLastUpdate ? realTimeLastUpdate.getTime() : Date.now())
      } catch (e: any) {
				if (!cancelled) setError(e?.message || 'Failed to load dashboard data')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
		const interval = setInterval(load, 60000) // Refresh every minute
    return () => { cancelled = true; clearInterval(interval) }
  }, [realTimeKpis, realTimeLastUpdate])

  const formattedLastUpdated = useMemo(() => new Date(lastUpdated).toLocaleTimeString(), [lastUpdated])

	// Calculate derived metrics
	const totalTrains = kpis?.throughput_per_hour || 238
	const delayedTrains = Math.round((totalTrains * (100 - (kpis?.on_time_percentage || 85))) / 100)
	const averageDelay = kpis?.avg_delay_minutes || 12
	const congestedRoutes = kpis?.congestion_index || 6
	const completedJourneys = Math.round(totalTrains * 0.92) // Estimate 92% completion rate
	const networkPerformance = kpis?.on_time_percentage || 85

  return (
		<div className="min-h-screen bg-gradient-to-br from-blue-50 via-blue-100 to-indigo-50 p-4 sm:p-6 lg:p-8">
			{/* Header */}
			<div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
				<div className="flex items-center gap-3">
					<span className="text-3xl sm:text-4xl">📊</span>
					<h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-gray-800">
						Dashboard
					</h1>
        </div>
				<div className="flex items-center gap-4">
        <div className="text-xs sm:text-sm text-gray-600">
						{loading ? 'Refreshing…' : 'Last updated'} {formattedLastUpdated}
					</div>
					<div className="flex items-center gap-2">
						{isConnected && (
							<div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" title="Real-time connected" />
						)}
						<button
							onClick={() => refreshData()}
							className="p-2 text-gray-600 hover:text-gray-800 hover:bg-gray-200 rounded-lg transition-colors"
							aria-label="Refresh"
						>
							<RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
						</button>
					</div>
        </div>
      </div>

			{error && (
				<div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
					{error}
				</div>
			)}

			{/* High-Level KPIs */}
			<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4 mb-6 items-stretch">
				<KPICard
					title="Total Trains Running Today"
					value={totalTrains}
					icon={<Train className="h-6 w-6" />}
					color="blue"
					trend={{ value: 5, label: 'vs yesterday' }}
				/>
				<KPICard
					title="Delayed Trains"
					value={delayedTrains}
					icon={<AlertCircle className="h-6 w-6" />}
					color="red"
					trend={{ value: -8, label: 'vs yesterday' }}
					description="Current + Today"
				/>
				<KPICard
					title="Average Delay"
					value={averageDelay}
					unit="min"
					icon={<Clock className="h-6 w-6" />}
					color="yellow"
					trend={{ value: -12, label: 'vs yesterday' }}
				/>
				<KPICard
					title="Congested Routes"
					value={congestedRoutes}
					icon={<Activity className="h-6 w-6" />}
					color="purple"
					trend={{ value: -15, label: 'vs yesterday' }}
				/>
				<KPICard
					title="Completed Journeys"
					value={completedJourneys}
					icon={<CheckCircle2 className="h-6 w-6" />}
					color="green"
					trend={{ value: 3, label: 'vs yesterday' }}
				/>
				<KPICard
					title="Network Performance"
					value={networkPerformance}
					unit="/100"
					icon={<TrendingUp className="h-6 w-6" />}
					color="indigo"
					trend={{ value: 2, label: 'vs yesterday' }}
					description="On-time percentage"
				/>
			</div>

			{/* Zone-wise Divisions and Zone Comparison */}
			<div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
				{/* Zone-wise Divisions */}
				<div className="bg-white rounded-2xl shadow-lg p-6 border border-gray-200">
					<div className="flex items-center justify-between mb-4">
						<h2 className="text-xl font-semibold text-gray-900">Zone-wise Divisions</h2>
						<div className="flex items-center gap-2">
							<button
								onClick={() => {
									setSearchEnabled(!searchEnabled)
									if (searchEnabled) setSearchQuery('')
								}}
								className={`p-2 rounded-lg transition-colors ${
									searchEnabled
										? 'bg-blue-600 text-white hover:bg-blue-700'
										: 'bg-gray-100 text-gray-600 hover:bg-gray-200'
								}`}
								aria-label="Toggle search"
								title="Toggle search"
							>
								<Search size={18} />
							</button>
							<Activity className="h-5 w-5 text-gray-400" />
						</div>
					</div>
					<div className="mb-4">
						<label className="block text-sm font-medium text-gray-700 mb-2">
							Select Zone
						</label>
						<select
							value={hasSelectedZone ? (selectedZone ?? '') : 'SELECT'}
							onChange={(e) => {
								const value = e.target.value
								setHasSelectedZone(true)
								if (!value || value === 'SELECT') {
									setZone(null)
									setDivisionKey(null)
									setHasSelectedDivision(false)
									if (value === 'SELECT') {
										setHasSelectedZone(false)
									}
									return
								}
								if (isZoneDisplayName(value)) {
									setZone(value)
									setDivisionKey(null)
									setHasSelectedDivision(false)
								}
							}}
							className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
						>
							<option value="SELECT">Select zone</option>
							<option value="">All Zones</option>
							{INDIAN_RAILWAY_ZONES.map((zone, idx) => (
								<option key={idx} value={zone}>
									{zone}
								</option>
							))}
						</select>
					</div>
					{selectedZone && (
						<div className="mb-4">
							<label className="block text-sm font-medium text-gray-700 mb-2">
								Select Division
							</label>
							<select
								value={hasSelectedDivision ? (selectedDivisionKey ?? '') : 'SELECT'}
								onChange={(e) => {
									const value = e.target.value
									setHasSelectedDivision(true)
									if (!value || value === 'SELECT') {
										setDivisionKey(null)
										if (value === 'SELECT') {
											setHasSelectedDivision(false)
										}
										return
									}
									setDivisionKey(value)
								}}
								className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
							>
								<option value="SELECT">Select division</option>
								<option value="">All Divisions</option>
								{(ZONE_TO_DIVISIONS[selectedZone] || []).map((div, idx) => (
									<option key={idx} value={makeDivisionKey(selectedZone, div)}>
										{div}
									</option>
								))}
							</select>
						</div>
					)}
					{searchEnabled && (
						<div className="mb-4 relative">
							<Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
							<input
								type="text"
								placeholder="Search zones or divisions..."
								value={searchQuery}
								onChange={(e) => setSearchQuery(e.target.value)}
								className="w-full pl-10 pr-10 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
							/>
							{searchQuery && (
								<button
									onClick={() => setSearchQuery('')}
									className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
									aria-label="Clear search"
								>
									<X size={16} />
								</button>
							)}
						</div>
					)}
					<div className="overflow-x-auto max-h-[600px] overflow-y-auto">
						{zoneDivisionGroups.length === 0 ? (
							<div className="py-8 text-center text-sm text-gray-500">
								{!hasSelectedZone
									? 'Please select a zone to view divisions'
									: selectedZone && !hasSelectedDivision
									? 'Please select a division to view data'
									: selectedZone || selectedDivisionKey || (searchEnabled && searchQuery)
									? `No divisions found${selectedZone ? ` for "${selectedZone}"` : ''}${selectedDivisionKey ? ` matching "${selectedDivisionKey}"` : ''}${searchEnabled && searchQuery ? ` matching "${searchQuery}"` : ''}`
									: 'No divisions available'}
							</div>
						) : (
							<div className="space-y-4">
								{zoneDivisionGroups.map((group, groupIdx) => (
									<div key={groupIdx} className="border border-gray-200 rounded-lg overflow-hidden">
										{/* Zone Header */}
										<div className="bg-blue-50 border-b border-gray-200 px-4 py-3">
											<h3 className="text-sm font-semibold text-gray-900">{group.zone}</h3>
										</div>
										{/* Divisions Table */}
										<table className="w-full">
											<thead>
												<tr className="bg-gray-50 border-b border-gray-200">
													<th className="text-left py-2 px-4 text-xs font-semibold text-gray-700">Division</th>
													<th className="text-right py-2 px-4 text-xs font-semibold text-gray-700">Running Trains</th>
													<th className="text-right py-2 px-4 text-xs font-semibold text-gray-700">On-time %</th>
													<th className="text-right py-2 px-4 text-xs font-semibold text-gray-700">Delay Avg</th>
												</tr>
											</thead>
											<tbody>
												{group.divisions.map((div, idx) => (
													<tr key={idx} className="border-b border-gray-100 hover:bg-gray-50 last:border-b-0">
														<td className="py-2 px-4 text-xs text-gray-900 font-medium pl-6">{div.division.split(' (')[0]}</td>
														<td className="py-2 px-4 text-xs text-gray-700 text-right">{div.runningTrains}</td>
														<td className="py-2 px-4 text-xs text-green-600 text-right font-semibold">{div.onTimePercent}%</td>
														<td className="py-2 px-4 text-xs text-gray-700 text-right">{div.delayAvg} min</td>
													</tr>
												))}
											</tbody>
										</table>
									</div>
								))}
							</div>
						)}
					</div>
					{(selectedZone || selectedDivisionKey || (searchEnabled && searchQuery)) && (
						<div className="mt-2 text-xs text-gray-500">
							Showing {filteredDivisionData.length} of {divisionData.length} divisions
						</div>
					)}
					<button 
						onClick={() => navigate('/app/simulation')}
						className="mt-4 w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold px-4 py-2 rounded-lg shadow transition"
					>
						View Predictions
					</button>
				</div>

				{/* Zone Comparison */}
				<div className="bg-white rounded-2xl shadow-lg p-6 border border-gray-200">
					<div className="flex items-center justify-between mb-4">
						<h2 className="text-xl font-semibold text-gray-900">Zone Comparison</h2>
						<BarChart3 className="h-5 w-5 text-gray-400" />
					</div>
					<BarChart
						data={zoneData.map(z => ({ label: z.zone.split(' ')[0], value: z.totalTrains }))}
						legendLabel="Total Trains"
						color="#8b5cf6"
						tooltipLabel="Trains"
					/>
				</div>
			</div>

			{/* Trend Graphs */}
			<div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
				{/* Delay Trend */}
				<div className="bg-white rounded-2xl shadow-lg p-6 border border-gray-200">
					<div className="flex items-center justify-between mb-4">
						<h2 className="text-xl font-semibold text-gray-900">Delay Trend (Last 24 hours)</h2>
						<LineChartIcon className="h-5 w-5 text-gray-400" />
					</div>
					{delayTrends ? (
						<LineChart
							series={delayTrends.series}
							labels={delayTrends.labels}
							legendLabel="Delay"
							color="#3b82f6"
							pointColor="#2563eb"
						/>
					) : (
						<div className="h-96 flex items-center justify-center text-gray-400">
							Loading chart...
						</div>
					)}
				</div>

				{/* Train Density Trend */}
				<div className="bg-white rounded-2xl shadow-lg p-6 border border-gray-200">
					<div className="flex items-center justify-between mb-4">
						<h2 className="text-xl font-semibold text-gray-900">Train Density Trend</h2>
						<BarChart3 className="h-5 w-5 text-gray-400" />
					</div>
					{trainDensity.length > 0 ? (
						<BarChart
							data={trainDensity}
							legendLabel="Trains"
							color="#10b981"
							tooltipLabel="Density"
						/>
					) : (
						<div className="h-96 flex items-center justify-center text-gray-400">
							Loading chart...
						</div>
					)}
				</div>
			</div>

			{/* Predictive Insights */}
			<div className="grid grid-cols-1 lg:grid-cols-1 gap-6 mb-6">
				{/* Predictive Insights */}
				<div className="bg-white rounded-2xl shadow-lg p-6 border border-gray-200">
					<div className="flex items-center justify-between mb-4">
						<h2 className="text-xl font-semibold text-gray-900">Predictive Insights</h2>
						<Brain className="h-5 w-5 text-gray-400" />
					</div>
					<div className="space-y-3">
						{predictions.map((pred, idx) => (
							<div
								key={idx}
								className={`p-4 rounded-lg border ${
									pred.risk === 'high'
										? 'bg-red-50 border-red-200'
										: pred.risk === 'medium'
										? 'bg-yellow-50 border-yellow-200'
										: 'bg-green-50 border-green-200'
								}`}
							>
								<div className="flex items-start justify-between">
									<div className="flex-1">
										<div className="flex items-center gap-2 mb-1">
											<Brain
												className={`h-4 w-4 ${
													pred.risk === 'high'
														? 'text-red-600'
														: pred.risk === 'medium'
														? 'text-yellow-600'
														: 'text-green-600'
												}`}
											/>
											<span
												className={`text-sm font-semibold ${
													pred.risk === 'high'
														? 'text-red-700'
														: pred.risk === 'medium'
														? 'text-yellow-700'
														: 'text-green-700'
												}`}
											>
												{pred.section || pred.time}
											</span>
										</div>
										<p className="text-sm text-gray-700">{pred.prediction}</p>
										<p
											className={`text-xs mt-1 font-medium ${
												pred.risk === 'high'
													? 'text-red-600'
													: pred.risk === 'medium'
													? 'text-yellow-600'
													: 'text-green-600'
											}`}
										>
											Risk: {pred.risk.toUpperCase()}
										</p>
									</div>
								</div>
							</div>
						))}
					</div>
				</div>
			</div>
    </div>
  )
}
