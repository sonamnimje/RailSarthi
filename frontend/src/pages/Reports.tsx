import { useEffect, useMemo, useRef, useState } from 'react'
import { fetchDelayTrends, fetchThroughput, fetchHotspots, fetchKpis } from '../lib/api'
import { Download, RefreshCw, TrendingUp, TrendingDown, AlertCircle, CheckCircle2, Clock, Train } from 'lucide-react'

type BarDatum = { label: string; value: number }

// Enhanced KPI Card Component
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
	color?: 'blue' | 'green' | 'yellow' | 'red' | 'purple'
	description?: string
}) {
	const colorClasses = {
		blue: 'from-blue-500 to-blue-600',
		green: 'from-green-500 to-green-600',
		yellow: 'from-yellow-500 to-yellow-600',
		red: 'from-red-500 to-red-600',
		purple: 'from-purple-500 to-purple-600',
	}
	
	return (
		<div className="relative overflow-hidden rounded-xl border border-gray-200 bg-white p-6 shadow-lg transition-all duration-300 hover:shadow-xl hover:scale-[1.02]">
			{/* Gradient background accent */}
			<div className={`absolute top-0 right-0 h-24 w-24 bg-gradient-to-br ${colorClasses[color]} opacity-10 rounded-bl-full`}></div>
			
			<div className="relative z-10">
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
				<div className="flex items-baseline gap-2">
					<span className="text-3xl font-bold text-gray-900">{value}</span>
					{unit && <span className="text-sm text-gray-500">{unit}</span>}
				</div>
				{description && <p className="text-xs text-gray-500 mt-2">{description}</p>}
			</div>
		</div>
	)
}

// Enhanced Bar Chart Component
function BarChart({ data, max, legendLabel = 'value', color = '#ef4444', tooltipLabel }: { data: BarDatum[]; max?: number; legendLabel?: string; color?: string; tooltipLabel?: string }) {
	const computedMax = useMemo(() => max ?? Math.max(1, ...data.map((d) => d.value)), [data, max])
	const width = 760
	const height = 320
	const padding = { top: 30, right: 30, bottom: 50, left: 50 }
	const chartW = width - padding.left - padding.right
	const chartH = height - padding.top - padding.bottom
	const barW = Math.max(20, chartW / data.length - 24)
	const gridLines = [0, 0.25, 0.5, 0.75, 1]
	const [hoverIdx, setHoverIdx] = useState<number | null>(null)
	
	// Calculate Y-axis labels
	const yAxisLabels = gridLines.map(g => Math.round(g * computedMax))
	
	return (
		<svg viewBox={`0 0 ${width} ${height}`} className="w-full h-96">
			<rect x={0} y={0} width={width} height={height} fill="transparent" />
			
			{/* Grid lines */}
			{gridLines.map((g, i) => {
				const y = padding.top + chartH * (1 - g)
				return (
					<g key={i}>
						<line x1={padding.left} x2={width - padding.right} y1={y} y2={y} stroke="#e5e7eb" strokeDasharray="4 4" strokeWidth={1} />
						<text x={padding.left - 8} y={y + 4} textAnchor="end" className="fill-gray-500 text-xs">{yAxisLabels[i]}</text>
					</g>
				)
			})}
			
			{/* Hover highlight */}
			{hoverIdx !== null && (() => {
				const x = padding.left + hoverIdx * (barW + 24)
				return <rect x={x - 12} y={padding.top} width={barW + 24} height={chartH} fill="#9ca3af" opacity={0.1} rx={4} />
			})()}
			
			{/* Bars */}
			{data.map((d, i) => {
				const x = padding.left + i * (barW + 24) + 12
				const h = (d.value / computedMax) * chartH
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
							fill={color} 
							opacity={isHovered ? 1 : 0.85}
							className="transition-all duration-200"
						/>
						{/* Value label on bar */}
						{h > 20 && (
							<text x={x + barW / 2} y={y - 5} textAnchor="middle" className="fill-gray-700 text-xs font-semibold">
								{d.value}
							</text>
						)}
						{/* X-axis label */}
						<text x={x + barW / 2} y={height - 20} textAnchor="middle" className="fill-gray-700 text-xs font-medium">
							{d.label}
						</text>
						
						{/* Tooltip */}
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
			
			{/* Y axis line */}
			<line x1={padding.left} x2={padding.left} y1={padding.top} y2={height - padding.bottom} stroke="#6b7280" strokeWidth={2} />
			{/* X axis line */}
			<line x1={padding.left} x2={width - padding.right} y1={height - padding.bottom} y2={height - padding.bottom} stroke="#6b7280" strokeWidth={2} />
		</svg>
	)
}

// Enhanced Line Chart Component
function LineChart({ series, labels, max, legendLabel = 'series', color = '#34d399', pointColor = '#10b981' }: { series: number[]; labels: string[]; max?: number; legendLabel?: string; color?: string; pointColor?: string }) {
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
			{/* Grid lines */}
			{gridLines.map((g, i) => {
				const y = padding.top + chartH * (1 - g)
				return (
					<g key={i}>
						<line x1={padding.left} x2={width - padding.right} y1={y} y2={y} stroke="#e5e7eb" strokeDasharray="4 4" strokeWidth={1} />
						<text x={padding.left - 8} y={y + 4} textAnchor="end" className="fill-gray-500 text-xs">{yAxisLabels[i]}</text>
					</g>
				)
			})}
			
			{/* Area under line (gradient fill) */}
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
			
			{/* Line */}
			<polyline fill="none" stroke={color} strokeWidth={3} points={points} />
			
			{/* Data points */}
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
			
			{/* Hover indicator */}
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
			
			{/* X axis line */}
			<line x1={padding.left} x2={width - padding.right} y1={height - padding.bottom} y2={height - padding.bottom} stroke="#6b7280" strokeWidth={2} />
			{/* Y axis line */}
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
			<rect x={padding.left} y={padding.top} width={chartW} height={chartH} fill="transparent" onMouseMove={handleMouseMove} onMouseLeave={() => setHoverIdx(null)} />
		</svg>
	)
}

// Enhanced Heatmap Component
function Heatmap({ data, xLabels, yLabels, max }: { data: number[][]; xLabels: string[]; yLabels: string[]; max?: number }) {
	const width = 760
	const height = 320
	const padding = { top: 30, right: 30, bottom: 50, left: 80 }
	const chartW = width - padding.left - padding.right
	const chartH = height - padding.top - padding.bottom
	const rows = data.length
	const cols = data[0]?.length ?? 0
	const cellW = cols ? chartW / cols : 0
	const cellH = rows ? chartH / rows : 0
	const computedMax = useMemo(() => max ?? Math.max(1, ...data.flat()), [data, max])
	const [hoverCell, setHoverCell] = useState<{ r: number; c: number } | null>(null)

	function valueToColor(v: number) {
		const t = Math.min(1, Math.max(0, v / computedMax))
		// Green (low) to Red (high) gradient
		const r = Math.round(239 * t + 34 * (1 - t))
		const g = Math.round(68 * t + 197 * (1 - t))
		const b = Math.round(68 * t + 94 * (1 - t))
		return `rgb(${r}, ${g}, ${b})`
	}

	return (
		<svg viewBox={`0 0 ${width} ${height}`} className="w-full h-96">
			<rect x={0} y={0} width={width} height={height} fill="transparent" />
			
			{/* Cells */}
			{data.map((row, r) => row.map((v, c) => {
				const x = padding.left + c * cellW
				const y = padding.top + r * cellH
				const isHovered = hoverCell?.r === r && hoverCell?.c === c
				return (
					<g key={`${r}-${c}`}>
						<rect 
							x={x} 
							y={y} 
							width={cellW} 
							height={cellH} 
							fill={valueToColor(v)} 
							opacity={isHovered ? 1 : 0.85}
							stroke={isHovered ? "#1f2937" : "transparent"}
							strokeWidth={2}
							className="transition-all duration-200 cursor-pointer"
							onMouseEnter={() => setHoverCell({ r, c })}
							onMouseLeave={() => setHoverCell(null)}
						/>
						{/* Value label */}
						{cellH > 20 && (
							<text 
								x={x + cellW / 2} 
								y={y + cellH / 2} 
								textAnchor="middle" 
								dominantBaseline="middle" 
								className="fill-white text-xs font-semibold"
								style={{ textShadow: '0 1px 2px rgba(0,0,0,0.5)' }}
							>
								{v.toFixed(1)}
							</text>
						)}
					</g>
				)
			}))}
			
			{/* Grid lines */}
			{Array.from({ length: rows + 1 }).map((_, r) => {
				const y = padding.top + r * cellH
				return <line key={`h-${r}`} x1={padding.left} x2={width - padding.right} y1={y} y2={y} stroke="#6b7280" opacity={0.3} />
			})}
			{Array.from({ length: cols + 1 }).map((_, c) => {
				const x = padding.left + c * cellW
				return <line key={`v-${c}`} y1={padding.top} y2={height - padding.bottom} x1={x} x2={x} stroke="#6b7280" opacity={0.3} />
			})}
			
			{/* Axes */}
			<line x1={padding.left} x2={padding.left} y1={padding.top} y2={height - padding.bottom} stroke="#6b7280" strokeWidth={2} />
			<line x1={padding.left} x2={width - padding.right} y1={height - padding.bottom} y2={height - padding.bottom} stroke="#6b7280" strokeWidth={2} />
			
			{/* Y labels (stations) */}
			{yLabels.map((l, i) => {
				const y = padding.top + i * cellH + cellH / 2
				return (
					<text key={`yl-${i}`} x={padding.left - 12} y={y} textAnchor="end" dominantBaseline="middle" className="fill-gray-700 text-xs font-semibold">
						{l}
					</text>
				)
			})}
			
			{/* X labels (time periods) */}
			{xLabels.map((l, i) => {
				const x = padding.left + i * cellW + cellW / 2
				return (
					<text key={`xl-${i}`} x={x} y={height - 20} textAnchor="middle" className="fill-gray-700 text-xs font-semibold">
						{l}
					</text>
				)
			})}
			
			{/* Color scale legend */}
			<g transform={`translate(${width - padding.right - 150}, ${padding.top})`}>
				<text x={0} y={-8} className="fill-gray-700 text-xs font-semibold">Delay Ratio</text>
				<rect x={0} y={0} width={120} height={12} fill="url(#heatmapGrad)" rx={2} />
				<defs>
					<linearGradient id="heatmapGrad" x1="0%" y1="0%" x2="100%" y2="0%">
						<stop offset="0%" stopColor={valueToColor(0)} />
						<stop offset="100%" stopColor={valueToColor(computedMax)} />
					</linearGradient>
				</defs>
				<text x={0} y={28} className="fill-gray-600 text-xs">Low (0)</text>
				<text x={120} y={28} textAnchor="end" className="fill-gray-600 text-xs">High ({computedMax.toFixed(1)})</text>
			</g>
			
			{/* Tooltip */}
			{hoverCell && (() => {
				const v = data[hoverCell.r][hoverCell.c]
				const x = padding.left + hoverCell.c * cellW + cellW / 2
				const y = padding.top + hoverCell.r * cellH
				return (
					<g transform={`translate(${x}, ${y - 10})`}>
						<rect x={-50} y={-30} rx={8} ry={8} width={100} height={50} fill="#1f2937" opacity={0.95} />
						<text x={0} y={-12} textAnchor="middle" className="fill-white text-xs font-semibold">{yLabels[hoverCell.r]}</text>
						<text x={0} y={4} textAnchor="middle" className="fill-gray-300 text-xs">{xLabels[hoverCell.c]}</text>
						<text x={0} y={18} textAnchor="middle" className="fill-white text-sm font-bold">Delay: {v.toFixed(2)}</text>
					</g>
				)
			})()}
		</svg>
	)
}

// AI Insights Component
function AIInsights({ kpis }: { kpis: { throughput_per_hour?: number; avg_delay_minutes?: number; on_time_percentage?: number; congestion_index?: number } }) {
	const insights = useMemo(() => {
		const items: Array<{ type: 'success' | 'warning' | 'info'; icon: React.ReactNode; title: string; description: string }> = []
		
		if (kpis.on_time_percentage !== undefined) {
			if (kpis.on_time_percentage >= 90) {
				items.push({
					type: 'success',
					icon: <CheckCircle2 className="h-5 w-5" />,
					title: 'Excellent On-Time Performance',
					description: `Your section is maintaining ${kpis.on_time_percentage.toFixed(1)}% on-time performance. AI optimization is working effectively.`
				})
			} else if (kpis.on_time_percentage < 70) {
				items.push({
					type: 'warning',
					icon: <AlertCircle className="h-5 w-5" />,
					title: 'On-Time Performance Needs Attention',
					description: `Current on-time rate is ${kpis.on_time_percentage.toFixed(1)}%. AI suggests reviewing bottleneck stations and adjusting schedules.`
				})
			}
		}
		
		if (kpis.avg_delay_minutes !== undefined) {
			if (kpis.avg_delay_minutes > 10) {
				items.push({
					type: 'warning',
					icon: <Clock className="h-5 w-5" />,
					title: 'High Average Delays Detected',
					description: `Average delay is ${kpis.avg_delay_minutes.toFixed(1)} minutes. Consider implementing AI-recommended schedule adjustments.`
				})
			}
		}
		
		if (kpis.congestion_index !== undefined) {
			if (kpis.congestion_index > 0.8) {
				items.push({
					type: 'warning',
					icon: <Train className="h-5 w-5" />,
					title: 'High Congestion Level',
					description: `Congestion index is ${kpis.congestion_index.toFixed(2)}. Section is operating near capacity. AI recommends optimizing train spacing.`
				})
			} else if (kpis.congestion_index < 0.5) {
				items.push({
					type: 'info',
					icon: <TrendingUp className="h-5 w-5" />,
					title: 'Capacity Available',
					description: `Congestion index is ${kpis.congestion_index.toFixed(2)}. Section has capacity for additional trains if needed.`
				})
			}
		}
		
		// Default insight if no specific conditions
		if (items.length === 0) {
			items.push({
				type: 'info',
				icon: <CheckCircle2 className="h-5 w-5" />,
				title: 'System Operating Normally',
				description: 'All metrics are within acceptable ranges. Continue monitoring for optimal performance.'
			})
		}
		
		return items
	}, [kpis])
	
	return (
		<div className="space-y-4">
			<h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
				<span className="text-2xl">🤖</span>
				AI Insights & Recommendations
			</h3>
			{insights.map((insight, i) => (
				<div 
					key={i}
					className={`rounded-lg border p-4 transition-all duration-200 hover:shadow-md ${
						insight.type === 'success' ? 'bg-green-50 border-green-200' :
						insight.type === 'warning' ? 'bg-yellow-50 border-yellow-200' :
						'bg-blue-50 border-blue-200'
					}`}
				>
					<div className="flex items-start gap-3">
						<div className={`mt-0.5 ${
							insight.type === 'success' ? 'text-green-600' :
							insight.type === 'warning' ? 'text-yellow-600' :
							'text-blue-600'
						}`}>
							{insight.icon}
						</div>
						<div className="flex-1">
							<h4 className="font-semibold text-gray-900 mb-1">{insight.title}</h4>
							<p className="text-sm text-gray-700">{insight.description}</p>
						</div>
					</div>
				</div>
			))}
		</div>
	)
}

export default function ReportsPage() {
	const reportRef = useRef<HTMLDivElement | null>(null)
	const [hours, setHours] = useState<number>(24)
	const [delayLabels, setDelayLabels] = useState<string[]>([])
	const [delaySeries, setDelaySeries] = useState<number[]>([])
	const [throughputBar, setThroughputBar] = useState<Array<{ label: string; value: number }>>([])
	const [heatmapX, setHeatmapX] = useState<string[]>([])
	const [heatmapY, setHeatmapY] = useState<string[]>([])
	const [heatmapData, setHeatmapData] = useState<number[][]>([])
	const [kpis, setKpis] = useState<{ throughput_per_hour?: number; avg_delay_minutes?: number; on_time_percentage?: number; congestion_index?: number }>({})
	const [loading, setLoading] = useState<boolean>(true)
	const [error, setError] = useState<string | null>(null)
	const [lastRefresh, setLastRefresh] = useState<Date>(new Date())
	const [autoRefresh, setAutoRefresh] = useState<boolean>(true)
	const refreshIntervalRef = useRef<number | null>(null)

	// Fetch data function
	const fetchData = async () => {
		setLoading(true)
		setError(null)
		try {
			const [delay, thr, hot, kpiResp] = await Promise.all([
				fetchDelayTrends(hours).catch(() => ({ labels: [], series: [] })),
				fetchThroughput(hours).catch(() => ({ data: [] })),
				fetchHotspots(hours, 4, 5).catch(() => ({ xLabels: [], yLabels: [], data: [] })),
				fetchKpis().catch(() => ({})),
			])
			setDelayLabels(delay.labels || [])
			setDelaySeries(delay.series || [])
			setThroughputBar(thr.data || [])
			setHeatmapX(hot.xLabels || [])
			setHeatmapY(hot.yLabels || [])
			setHeatmapData(hot.data || [])
			setKpis(kpiResp || {})
			setLastRefresh(new Date())
		} catch (e: any) {
			console.error('Reports fetch error:', e)
			setError(e?.message || 'Failed to load reports. Please check your connection and try again.')
			// Set empty defaults on error so UI still renders
			setDelayLabels([])
			setDelaySeries([])
			setThroughputBar([])
			setHeatmapX([])
			setHeatmapY([])
			setHeatmapData([])
		} finally {
			setLoading(false)
		}
	}

	// Initial load and manual refresh
	useEffect(() => {
		fetchData()
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [hours])

	// Auto-refresh setup
	useEffect(() => {
		if (autoRefresh) {
			refreshIntervalRef.current = window.setInterval(() => {
				fetchData()
			}, 5 * 60 * 1000) // Every 5 minutes
		} else {
			if (refreshIntervalRef.current) {
				clearInterval(refreshIntervalRef.current)
				refreshIntervalRef.current = null
			}
		}
		
		return () => {
			if (refreshIntervalRef.current) {
				clearInterval(refreshIntervalRef.current)
			}
		}
	}, [autoRefresh, hours])

	// Format last refresh time
	const formatLastRefresh = () => {
		const diff = Math.floor((Date.now() - lastRefresh.getTime()) / 1000)
		if (diff < 60) return `${diff}s ago`
		if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
		return lastRefresh.toLocaleTimeString()
	}

	// Export functions
	function downloadCSV() {
		const lines: string[] = []
		lines.push('RailAnukriti Reports & Analytics')
		lines.push(`Generated: ${new Date().toLocaleString()}`)
		lines.push('')
		lines.push('=== Summary KPIs ===')
		lines.push(`Throughput (trains/hour),${kpis.throughput_per_hour ?? 'N/A'}`)
		lines.push(`Average Delay (minutes),${kpis.avg_delay_minutes ?? 'N/A'}`)
		lines.push(`On-Time Percentage,${kpis.on_time_percentage ?? 'N/A'}%`)
		lines.push(`Congestion Index,${kpis.congestion_index ?? 'N/A'}`)
		lines.push('')
		lines.push('=== Delay Trends ===')
		lines.push('Time,Average Delay (minutes)')
		for (let i = 0; i < delayLabels.length; i++) {
			lines.push(`${delayLabels[i]},${delaySeries[i]?.toFixed(2) ?? 0}`)
		}
		lines.push('')
		lines.push('=== Throughput by Train Type ===')
		lines.push('Train Type,Throughput (trains/hour)')
		throughputBar.forEach((d) => lines.push(`${d.label},${d.value}`))
		lines.push('')
		lines.push('=== Bottleneck Hotspots ===')
		lines.push(['Station/Time', ...heatmapX].join(','))
		heatmapData.forEach((row, i) => {
			lines.push([heatmapY[i] || `Station ${i + 1}`, ...row.map(v => v.toFixed(2))].join(','))
		})
		
		const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' })
		const url = URL.createObjectURL(blob)
		const a = document.createElement('a')
		a.href = url
		a.download = `rail-anukriti-reports-${new Date().toISOString().split('T')[0]}.csv`
		document.body.appendChild(a)
		a.click()
		document.body.removeChild(a)
		URL.revokeObjectURL(url)
	}

	function downloadPDF() {
		const node = reportRef.current
		if (!node) return
		
		const printWindow = window.open('', 'PRINT', 'height=800,width=1200')
		if (!printWindow) return
		
		const htmlContent = `
			<!doctype html>
			<html>
				<head>
					<title>RailAnukriti Reports & Analytics</title>
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
						.kpi-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin-bottom: 24px; }
						.kpi-card { border: 1px solid #e5e7eb; border-radius: 8px; padding: 16px; background: #f9fafb; }
						.kpi-label { font-size: 12px; color: #6b7280; margin-bottom: 4px; }
						.kpi-value { font-size: 24px; font-weight: bold; color: #1f2937; }
						.chart-container { margin: 16px 0; border: 1px solid #e5e7eb; border-radius: 8px; padding: 16px; background: white; }
						.meta { font-size: 12px; color: #6b7280; margin-bottom: 16px; }
						@media print {
							body { padding: 0; }
						}
					</style>
				</head>
				<body>
					<h1>📈 Reports & Analytics</h1>
					<div class="meta">Generated: ${new Date().toLocaleString()} | Timeframe: Last ${hours} hours</div>
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
		<div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-blue-50 text-gray-900">
			<div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
				{/* Header */}
				<div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-8">
					<div className="flex items-center gap-3">
						<div className="p-3 bg-gradient-to-br from-blue-600 to-blue-700 rounded-xl shadow-lg">
							<span className="text-3xl">📈</span>
						</div>
						<div>
							<h1 className="text-4xl font-extrabold text-gray-900">Reports & Analytics</h1>
							<p className="text-sm text-gray-600 mt-1">
								Performance summary of your railway section
								{lastRefresh && <span className="ml-2">• Last updated: {formatLastRefresh()}</span>}
							</p>
						</div>
					</div>
					
					<div className="flex flex-wrap items-center gap-3">
						<label className="flex items-center gap-2 text-sm text-gray-700">
							<input
								type="checkbox"
								checked={autoRefresh}
								onChange={(e) => setAutoRefresh(e.target.checked)}
								className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
							/>
							Auto-refresh (5min)
						</label>
						<label className="text-sm text-gray-600">Timeframe:</label>
						<select 
							value={hours} 
							onChange={(e) => setHours(parseInt(e.target.value))} 
							className="px-3 py-2 rounded-lg border border-gray-300 text-sm font-medium bg-white text-gray-900 shadow-sm hover:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
							disabled={loading}
							style={{ color: '#111827' }}
						>
							<option value={6} style={{ color: '#111827' }}>Last 6h</option>
							<option value={12} style={{ color: '#111827' }}>Last 12h</option>
							<option value={24} style={{ color: '#111827' }}>Last 24h</option>
							<option value={48} style={{ color: '#111827' }}>Last 48h</option>
							<option value={168} style={{ color: '#111827' }}>Last 7d</option>
						</select>
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

				{/* Error Message */}
				{error && (
					<div className="mb-6 p-4 rounded-lg bg-red-50 border border-red-200 text-red-700 flex items-center gap-2">
						<AlertCircle className="h-5 w-5" />
						<span>{error}</span>
					</div>
				)}

				{/* Main Content - Always render */}
				{loading && delayLabels.length === 0 ? (
					<div className="flex items-center justify-center py-20">
						<div className="text-center">
							<RefreshCw className="h-12 w-12 text-blue-600 animate-spin mx-auto mb-4" />
							<p className="text-gray-600">Loading reports data...</p>
						</div>
					</div>
				) : (
					<div ref={reportRef}>
						{/* KPI Cards */}
						<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
							<KPICard
								title="Throughput"
								value={kpis.throughput_per_hour?.toFixed(1) ?? '—'}
								unit="trains/hr"
								icon={<Train className="h-6 w-6" />}
								color="blue"
								description="Trains passing section per hour"
							/>
							<KPICard
								title="Average Delay"
								value={kpis.avg_delay_minutes?.toFixed(1) ?? '—'}
								unit="mins"
								icon={<Clock className="h-6 w-6" />}
								color={kpis.avg_delay_minutes && kpis.avg_delay_minutes > 10 ? 'red' : 'yellow'}
								description="Average delay per train"
							/>
							<KPICard
								title="On-Time Performance"
								value={kpis.on_time_percentage?.toFixed(1) ?? '—'}
								unit="%"
								icon={<CheckCircle2 className="h-6 w-6" />}
								color={kpis.on_time_percentage && kpis.on_time_percentage >= 90 ? 'green' : 'yellow'}
								description="Percentage of on-time trains"
							/>
							<KPICard
								title="Congestion Level"
								value={kpis.congestion_index !== undefined ? kpis.congestion_index.toFixed(2) : '—'}
								icon={<TrendingUp className="h-6 w-6" />}
								color={kpis.congestion_index && kpis.congestion_index > 0.8 ? 'red' : 'purple'}
								description="Section capacity utilization"
							/>
						</div>

						{/* Charts Grid */}
						<div className="grid gap-6 lg:grid-cols-2 mb-6">
							<section className="rounded-xl border border-gray-200 bg-white p-6 shadow-lg">
								<h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
									<span className="text-xl">📉</span>
									Delay Trends
								</h3>
								{delayLabels.length > 0 && delaySeries.length > 0 ? (
									<LineChart 
										labels={delayLabels} 
										series={delaySeries} 
										max={Math.max(...delaySeries, 1)} 
										legendLabel="Avg Delay" 
										color="#3b82f6" 
										pointColor="#2563eb" 
									/>
								) : (
									<div className="h-96 flex items-center justify-center text-gray-500">No data available</div>
								)}
							</section>
							
							<section className="rounded-xl border border-gray-200 bg-white p-6 shadow-lg">
								<h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
									<span className="text-xl">📊</span>
									Throughput Comparison
								</h3>
								{throughputBar.length > 0 ? (
									<BarChart 
										data={throughputBar} 
										max={Math.max(...throughputBar.map(d => d.value), 1)} 
										legendLabel="Throughput" 
										color="#ef4444" 
										tooltipLabel="trains/hour" 
									/>
								) : (
									<div className="h-96 flex items-center justify-center text-gray-500">No data available</div>
								)}
							</section>
						</div>

						{/* Heatmap Section */}
						<div className="mb-6">
							<section className="rounded-xl border border-gray-200 bg-white p-6 shadow-lg">
								<h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
									<span className="text-xl">🔥</span>
									Bottleneck Hotspots
								</h3>
								<p className="text-sm text-gray-600 mb-4">
									Color-coded visualization showing delay ratios by station and time period. Red indicates higher delays.
								</p>
								{heatmapData.length > 0 && heatmapX.length > 0 && heatmapY.length > 0 ? (
									<Heatmap data={heatmapData} xLabels={heatmapX} yLabels={heatmapY} />
								) : (
									<div className="h-96 flex items-center justify-center text-gray-500">No data available</div>
								)}
							</section>
						</div>

						{/* AI Insights Section */}
						<div className="rounded-xl border border-gray-200 bg-white p-6 shadow-lg">
							<AIInsights kpis={kpis} />
						</div>
					</div>
				)}
			</div>
		</div>
	)
}
