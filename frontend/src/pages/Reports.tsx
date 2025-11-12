import { useEffect, useMemo, useRef, useState } from 'react'
import { fetchDelayTrends, fetchThroughput, fetchHotspots, fetchKpis } from '../lib/api'

type BarDatum = { label: string; value: number }

function BarChart({ data, max, legendLabel = 'value', color = '#ef4444', tooltipLabel }: { data: BarDatum[]; max?: number; legendLabel?: string; color?: string; tooltipLabel?: string }) {
	const computedMax = useMemo(() => max ?? Math.max(1, ...data.map((d) => d.value)), [data, max])
	const width = 760
	const height = 280
	const padding = { top: 20, right: 20, bottom: 40, left: 40 }
	const chartW = width - padding.left - padding.right
	const chartH = height - padding.top - padding.bottom
	const barW = chartW / data.length - 24
	const gridLines = [0.25, 0.5, 0.75, 1]
	const [hoverIdx, setHoverIdx] = useState<number | null>(null)
	return (
		<svg viewBox={`0 0 ${width} ${height}`} className="w-full h-80">
			<rect x={0} y={0} width={width} height={height} fill="transparent" />
			{gridLines.map((g, i) => {
				const y = padding.top + chartH * g
				return <line key={i} x1={padding.left} x2={width - padding.right} y1={y} y2={y} stroke="#374151" strokeDasharray="4 4" />
			})}
			{/* Hover band */}
			{hoverIdx !== null && (() => {
				const x = padding.left + hoverIdx * (barW + 24)
				return <rect x={x} y={padding.top} width={barW + 24} height={chartH} fill="#9ca3af" opacity={0.25} />
			})()}
			{data.map((d, i) => {
				const x = padding.left + i * (barW + 24) + 12
				const h = (d.value / computedMax) * chartH
				const y = padding.top + chartH - h
				return (
					<g key={i} onMouseEnter={() => setHoverIdx(i)} onMouseLeave={() => setHoverIdx(null)}>
						<rect x={x} y={y} width={barW} height={h} rx={6} fill={color} opacity={0.85} />
						<text x={x + barW / 2} y={height - 12} textAnchor="middle" className="fill-gray-700 text-xs">{d.label}</text>
						{/* Tooltip */}
						{i === hoverIdx && (
							<g transform={`translate(${x + barW - 10}, ${padding.top + 20})`}>
								<rect x={0} y={-18} rx={6} ry={6} width={90} height={42} fill="#eff6ff" stroke="#d1d5db" />
								<text x={10} y={-2} className="fill-gray-700 text-sm">{d.label}</text>
								<text x={10} y={16} className="fill-gray-700 text-xs">{(tooltipLabel ?? legendLabel)} : {d.value}</text>
							</g>
						)}
					</g>
				)
			})}
			{/* Y axis */}
			<line x1={padding.left} x2={padding.left} y1={padding.top} y2={height - padding.bottom} stroke="#6b7280" />
			{/* X axis */}
			<line x1={padding.left} x2={width - padding.right} y1={height - padding.bottom} y2={height - padding.bottom} stroke="#6b7280" />
			{/* Legend bottom center */}
			<g transform={`translate(${width / 2 - 40}, ${height - 10})`}>
				<circle cx={0} cy={-4} r={5} fill={color} />
				<text x={12} y={0} className="fill-gray-700 text-sm">{legendLabel}</text>
			</g>
		</svg>
	)
}

function LineChart({ series, labels, max, legendLabel = 'series', color = '#34d399', pointColor = '#10b981' }: { series: number[]; labels: string[]; max?: number; legendLabel?: string; color?: string; pointColor?: string }) {
	const computedMax = useMemo(() => max ?? Math.max(1, ...series), [series, max])
	const width = 760
	const height = 280
	const padding = { top: 20, right: 20, bottom: 40, left: 40 }
	const chartW = width - padding.left - padding.right
	const chartH = height - padding.top - padding.bottom
	const step = chartW / Math.max(1, series.length - 1)
	const [hoverIdx, setHoverIdx] = useState<number | null>(null)
	const points = series.map((v, i) => {
		const x = padding.left + i * step
		const y = padding.top + chartH - (v / computedMax) * chartH
		return `${x},${y}`
	}).join(' ')
	const gridLines = [0.25, 0.5, 0.75, 1]
	function handleMouseMove(e: React.MouseEvent<SVGRectElement, MouseEvent>) {
		const svg = (e.currentTarget.ownerSVGElement as SVGSVGElement)
		const rect = svg.getBoundingClientRect()
		const x = e.clientX - rect.left - padding.left
		const rawIdx = x / step
		const idx = Math.min(series.length - 1, Math.max(0, Math.round(rawIdx)))
		setHoverIdx(idx)
	}
	return (
		<svg viewBox={`0 0 ${width} ${height}`} className="w-full h-80">
			{gridLines.map((g, i) => {
				const y = padding.top + chartH * g
				return <line key={i} x1={padding.left} x2={width - padding.right} y1={y} y2={y} stroke="#374151" strokeDasharray="4 4" />
			})}
			<polyline fill="none" stroke={color} strokeWidth={2} points={points} />
			{series.map((v, i) => {
				const x = padding.left + i * step
				const y = padding.top + chartH - (v / computedMax) * chartH
				return <circle key={i} cx={x} cy={y} r={4} fill={pointColor} stroke={color} />
			})}
			{hoverIdx !== null && (() => {
				const x = padding.left + hoverIdx * step
				const y = padding.top + chartH - (series[hoverIdx] / computedMax) * chartH
				return (
					<g>
						<line x1={x} x2={x} y1={padding.top} y2={height - padding.bottom} stroke="#9ca3af" strokeDasharray="4 4" />
						<circle cx={x} cy={y} r={6} fill={pointColor} stroke={color} />
						<g transform={`translate(${Math.min(x + 10, width - 120)}, ${Math.max(padding.top + 10, y - 24)})`}>
							<rect x={0} y={-14} rx={6} ry={6} width={110} height={42} fill="#eff6ff" stroke="#d1d5db" />
							<text x={10} y={2} className="fill-gray-700 text-sm">{labels[hoverIdx]}</text>
							<text x={10} y={20} className="fill-gray-700 text-xs">{legendLabel} : {series[hoverIdx]}</text>
						</g>
					</g>
				)
			})()}
			{/* X axis */}
			<line x1={padding.left} x2={width - padding.right} y1={height - padding.bottom} y2={height - padding.bottom} stroke="#6b7280" />
			{/* Y axis */}
			<line x1={padding.left} x2={padding.left} y1={padding.top} y2={height - padding.bottom} stroke="#6b7280" />
			{labels.map((l, i) => {
				const x = padding.left + i * step
				return <text key={i} x={x} y={height - 12} textAnchor="middle" className="fill-gray-700 text-xs">{l}</text>
			})}
			<rect x={padding.left} y={padding.top} width={chartW} height={chartH} fill="transparent" onMouseMove={handleMouseMove} onMouseLeave={() => setHoverIdx(null)} />
			{/* Legend bottom center */}
			<g transform={`translate(${width / 2 - 56}, ${height - 10})`}>
				<circle cx={0} cy={-4} r={5} fill={pointColor} />
				<text x={12} y={0} className="fill-gray-700 text-sm">{legendLabel}</text>
			</g>
		</svg>
	)
}

function Heatmap({ data, xLabels, yLabels, max }: { data: number[][]; xLabels: string[]; yLabels: string[]; max?: number }) {
	const width = 760
	const height = 280
	const padding = { top: 20, right: 20, bottom: 40, left: 60 }
	const chartW = width - padding.left - padding.right
	const chartH = height - padding.top - padding.bottom
	const rows = data.length
	const cols = data[0]?.length ?? 0
	const cellW = cols ? chartW / cols : 0
	const cellH = rows ? chartH / rows : 0
	const computedMax = useMemo(() => max ?? Math.max(1, ...data.flat()), [data, max])

	function valueToColor(v: number) {
		const t = Math.min(1, Math.max(0, v / computedMax))
		const r = Math.round(239 * t + 16 * (1 - t))
		const g = Math.round(68 * t + 185 * (1 - t))
		const b = Math.round(68 * t + 129 * (1 - t))
		return `rgb(${r}, ${g}, ${b})`
	}

	return (
		<svg viewBox={`0 0 ${width} ${height}`} className="w-full h-80">
			<rect x={0} y={0} width={width} height={height} fill="transparent" />
			{data.map((row, r) => row.map((v, c) => {
				const x = padding.left + c * cellW
				const y = padding.top + r * cellH
				return <rect key={`${r}-${c}`} x={x} y={y} width={cellW} height={cellH} fill={valueToColor(v)} opacity={0.9} />
			}))}
			{Array.from({ length: rows + 1 }).map((_, r) => {
				const y = padding.top + r * cellH
				return <line key={`h-${r}`} x1={padding.left} x2={width - padding.right} y1={y} y2={y} stroke="#6b7280" opacity={0.25} />
			})}
			{Array.from({ length: cols + 1 }).map((_, c) => {
				const x = padding.left + c * cellW
				return <line key={`v-${c}`} y1={padding.top} y2={height - padding.bottom} x1={x} x2={x} stroke="#6b7280" opacity={0.25} />
			})}
			<line x1={padding.left} x2={padding.left} y1={padding.top} y2={height - padding.bottom} stroke="#6b7280" />
			<line x1={padding.left} x2={width - padding.right} y1={height - padding.bottom} y2={height - padding.bottom} stroke="#6b7280" />
			{yLabels.map((l, i) => {
				const y = padding.top + i * cellH + cellH / 2
				return <text key={`yl-${i}`} x={padding.left - 8} y={y} textAnchor="end" dominantBaseline="middle" className="fill-gray-700 text-xs">{l}</text>
			})}
			{xLabels.map((l, i) => {
				const x = padding.left + i * cellW + cellW / 2
				return <text key={`xl-${i}`} x={x} y={height - 12} textAnchor="middle" className="fill-gray-700 text-xs">{l}</text>
			})}
			<g transform={`translate(${width - padding.right - 140}, ${padding.top})`}>
				<rect x={0} y={0} width={120} height={10} fill="url(#grad)" />
				<defs>
					<linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="0%">
						<stop offset="0%" stopColor={valueToColor(0)} />
						<stop offset="100%" stopColor={valueToColor(computedMax)} />
					</linearGradient>
				</defs>
				<text x={0} y={22} className="fill-gray-700 text-xs">low</text>
				<text x={120} y={22} textAnchor="end" className="fill-gray-700 text-xs">high</text>
			</g>
		</svg>
	)
}

export default function ReportsPage() {
	const reportRef = useRef<HTMLDivElement | null>(null)

	const [hours, setHours] = useState<number>(24)
	const [delayLabels, setDelayLabels] = useState<string[]>(['Mon', 'Tue', 'Wed', 'Thu', 'Fri'])
	const [delaySeries, setDelaySeries] = useState<number[]>([2, 4, 3, 6, 5])
	const [throughputBar, setThroughputBar] = useState<Array<{ label: string; value: number }>>([
		{ label: 'Express', value: 100 },
		{ label: 'Freight', value: 80 },
		{ label: 'Local', value: 90 },
	])
	const [heatmapX, setHeatmapX] = useState<string[]>(['A', 'B', 'C', 'D', 'E'])
	const [heatmapY, setHeatmapY] = useState<string[]>(['S1', 'S2', 'S3', 'S4'])
	const [heatmapData, setHeatmapData] = useState<number[][]>([
		[1, 2, 3, 2, 4],
		[2, 3, 5, 1, 2],
		[0, 1, 2, 3, 1],
		[3, 4, 2, 5, 4],
	])
	const [kpis, setKpis] = useState<{ throughput_per_hour?: number; avg_delay_minutes?: number; on_time_percentage?: number; congestion_index?: number }>({})
	const [loading, setLoading] = useState<boolean>(false)
	const [error, setError] = useState<string | null>(null)

	useEffect(() => {
		let isCancelled = false
		async function load() {
			setLoading(true)
			setError(null)
			try {
				const [delay, thr, hot, kpiResp] = await Promise.all([
					fetchDelayTrends(hours),
					fetchThroughput(hours),
					fetchHotspots(hours, 4, 5),
					fetchKpis(),
				])
				if (isCancelled) return
				setDelayLabels(delay.labels)
				setDelaySeries(delay.series)
				setThroughputBar(thr.data)
				setHeatmapX(hot.xLabels)
				setHeatmapY(hot.yLabels)
				setHeatmapData(hot.data)
				setKpis(kpiResp)
			} catch (e: any) {
				if (!isCancelled) setError(e?.message || 'Failed to load reports')
			} finally {
				if (!isCancelled) setLoading(false)
			}
		}
		load()
		return () => {
			isCancelled = true
		}
	}, [hours])

	function downloadCSV() {
		const lines: string[] = []
		lines.push('Section,Delay (trend)')
		for (let i = 0; i < delayLabels.length; i++) {
			lines.push(`${delayLabels[i]},${delaySeries[i]}`)
		}
		lines.push('')
		lines.push('Train,Throughput')
		throughputBar.forEach((d) => lines.push(`${d.label},${d.value}`))
		lines.push('')
		lines.push(['HotspotY/HotspotX', ...heatmapX].join(','))
		heatmapData.forEach((row, i) => {
			lines.push([heatmapY[i], ...row].join(','))
		})
		const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' })
		const url = URL.createObjectURL(blob)
		const a = document.createElement('a')
		a.href = url
		a.download = 'reports.csv'
		document.body.appendChild(a)
		a.click()
		document.body.removeChild(a)
		URL.revokeObjectURL(url)
	}

	function downloadPDF() {
		const node = reportRef.current
		if (!node) return
		const printWindow = window.open('', 'PRINT', 'height=800,width=1000')
		if (!printWindow) return
		printWindow.document.write(`<!doctype html><html><head><title>Reports</title>` +
			`<style>body{font-family:ui-sans-serif,system-ui,Segoe UI,Roboto,Helvetica,Arial; padding:16px} h2{margin:0 0 12px} section{margin-bottom:16px}</style>` +
			`</head><body>`)
		printWindow.document.write(`<h2>Reports & Analytics</h2>`)
		printWindow.document.write(node.innerHTML)
		printWindow.document.write(`</body></html>`)
		printWindow.document.close()
		printWindow.focus()
		printWindow.print()
		printWindow.close()
	}

	return (
		<div className="p-6 bg-blue-50 text-gray-900">
			<div className="flex items-center justify-between mb-6">
				<div className="flex items-center gap-2">
					<span className="text-2xl">📈</span>
					<h2 className="text-4xl font-extrabold">Reports & Analytics</h2>
				</div>
				<div className="flex items-center gap-2">
					<label className="text-sm text-gray-600">Timeframe</label>
					<select value={hours} onChange={(e) => setHours(parseInt(e.target.value))} className="px-2 py-1 rounded border border-gray-300 text-sm">
						<option value={6}>Last 6h</option>
						<option value={12}>Last 12h</option>
						<option value={24}>Last 24h</option>
						<option value={48}>Last 48h</option>
						<option value={168}>Last 7d</option>
					</select>
					<button onClick={downloadCSV} className="px-3 py-1.5 rounded border border-gray-300 text-sm hover:bg-gray-50">Download CSV</button>
					<button onClick={downloadPDF} className="px-3 py-1.5 rounded border border-gray-300 text-sm hover:bg-gray-50">Download PDF</button>
				</div>
			</div>
			{/* KPI Cards */}
			<div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
				<div className="rounded border border-gray-200 bg-blue-50 p-4 shadow">
					<div className="text-sm text-gray-500">Throughput</div>
					<div className="text-2xl font-semibold">{kpis.throughput_per_hour ?? '—'}<span className="text-sm ml-1">/hr</span></div>
				</div>
				<div className="rounded border border-gray-200 bg-blue-50 p-4 shadow">
					<div className="text-sm text-gray-500">Avg Delay</div>
					<div className="text-2xl font-semibold">{kpis.avg_delay_minutes ?? '—'}<span className="text-sm ml-1">mins</span></div>
				</div>
				<div className="rounded border border-gray-200 bg-blue-50 p-4 shadow">
					<div className="text-sm text-gray-500">On-Time %</div>
					<div className="text-2xl font-semibold">{kpis.on_time_percentage ?? '—'}%</div>
				</div>
				<div className="rounded border border-gray-200 bg-blue-50 p-4 shadow">
					<div className="text-sm text-gray-500">Congestion</div>
					<div className="text-2xl font-semibold">{kpis.congestion_index !== undefined ? kpis.congestion_index.toFixed(2) : '—'}</div>
				</div>
			</div>
			{error && (
				<div className="mb-4 text-sm text-red-600">{error}</div>
			)}
			<div ref={reportRef}>
				<div className="grid gap-6 md:grid-cols-2">
					<section className="rounded border border-gray-200 bg-blue-50 p-4 shadow-lg">
						<h3 className="font-semibold mb-4">Delay Trends</h3>
						<LineChart labels={delayLabels} series={delaySeries} max={Math.max(...delaySeries, 1)} legendLabel="delay" color="#34d399" pointColor="#10b981" />
					</section>
					<section className="rounded border border-gray-200 bg-blue-50 p-4 shadow-lg">
						<h3 className="font-semibold mb-4">Throughput Comparison</h3>
						<BarChart data={throughputBar} max={Math.max(...throughputBar.map(d => d.value), 1)} legendLabel="throughput" color="#ef4444" tooltipLabel="throughput" />
					</section>
				</div>
				<div className="mt-6">
					<section className="rounded border border-gray-200 bg-blue-50 p-4 shadow-lg">
						<h3 className="font-semibold mb-4">Bottleneck Hotspots</h3>
						<Heatmap data={heatmapData} xLabels={heatmapX} yLabels={heatmapY} />
					</section>
					{/* Overrides vs AI Decisions section removed */}
				</div>
			</div>
		</div>
	)
}

