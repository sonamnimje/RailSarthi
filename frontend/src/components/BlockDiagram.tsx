import React, { useMemo, useState } from 'react'
import type { Station, BlockState } from '../simulationEngine'

type Props = {
	stations: Station[]
	blockStates?: Record<string, BlockState>
	simTimeMin: number
}

const AUTO_BLOCK_LENGTH_KM = 1.2

const statusColor = (block: BlockState) => {
	if (block.closed) return { fill: '#ffe4e6', stroke: '#fb7185', text: '#9f1239' }
	if (block.occupiedBy || block.queue.length > 0) return { fill: '#fef3c7', stroke: '#f59e0b', text: '#92400e' }
	return { fill: '#dcfce7', stroke: '#22c55e', text: '#166534' }
}

const statusLabel = (block: BlockState) => {
	if (block.closed) return 'Closed (maintenance/disruption)'
	if (block.occupiedBy) return `Occupied by ${block.occupiedBy}`
	if (block.queue.length > 0) return `Queued: ${block.queue.length}`
	return 'Free'
}

const Signal = ({ x, y, aspect }: { x: number; y: number; aspect: 'green' | 'amber' | 'red' }) => {
	const fill = aspect === 'green' ? '#22c55e' : aspect === 'amber' ? '#f59e0b' : '#f43f5e'
	return (
		<g>
			<rect x={x - 4} y={y - 10} width={8} height={20} rx={3} fill="#0f172a" />
			<circle cx={x} cy={y - 5} r={2.2} fill={fill} />
			<circle cx={x} cy={y + 5} r={2.2} fill="#0f172a" />
		</g>
	)
}

export default function BlockDiagram({ stations, blockStates, simTimeMin }: Props) {
	const [sandboxEnabled, setSandboxEnabled] = useState(false)
	const [customBlocks, setCustomBlocks] = useState<BlockState[]>([])
	const [nextCustomId, setNextCustomId] = useState(1)
	const [builderMode, setBuilderMode] = useState<'automatic' | 'absolute'>('automatic')
	const [builderLength, setBuilderLength] = useState(1.2)

	const orderedStations = useMemo(() => [...stations].sort((a, b) => a.distanceKm - b.distanceKm), [stations])
	const orderedBlocks = useMemo(() => {
		if (!blockStates) return []
		return Object.values(blockStates).sort((a, b) => {
			const aIndex = orderedStations.findIndex((s) => s.code === a.fromStation)
			const bIndex = orderedStations.findIndex((s) => s.code === b.fromStation)
			return aIndex - bIndex
		})
	}, [blockStates, orderedStations])

	const totalDistance = orderedStations.length > 0 ? orderedStations[orderedStations.length - 1].distanceKm - orderedStations[0].distanceKm : 0
	const padding = 80
	const pixelPerKm = Math.max(28, 1200 / Math.max(1, totalDistance))
	const svgWidth = Math.max(900, totalDistance * pixelPerKm + padding * 2)
	const mainY = 150
	const builderY = 210
	const loopHeight = 60
	const stationX: Record<string, number> = {}
	orderedStations.forEach((s) => {
		const x = padding + (s.distanceKm - orderedStations[0].distanceKm) * pixelPerKm
		stationX[s.code] = x
	})

	const handleAddCustomBlock = (fromStation: string, toStation: string) => {
		const id = `GAME-${fromStation}-${toStation}-${nextCustomId}`
		const lengthKm = builderLength
		const block: BlockState = {
			id,
			fromStation,
			toStation,
			lengthKm,
			occupiedBy: null,
			queue: [],
			closed: false,
			traversals: 0,
		}
		setCustomBlocks((prev) => [...prev, block])
		setNextCustomId((n) => n + 1)
	}

	if (!blockStates || orderedBlocks.length === 0) {
		return (
			<div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
				<div className="text-sm text-slate-700">Block diagram will appear once simulation starts.</div>
			</div>
		)
	}

	return (
		<div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm space-y-4">
			<div className="flex items-center justify-between">
				<div>
					<div className="text-xs uppercase font-semibold text-slate-500">Block Diagram</div>
					<div className="text-lg font-bold text-slate-800">Absolute / Automatic blocks with loops</div>
					<div className="text-[11px] text-slate-500 mt-1">Scaled to distance. Signals render automatically based on block length.</div>
				</div>
				<div className="flex items-center gap-2">
					<div className="text-xs text-slate-500">T+{simTimeMin.toFixed(1)} min</div>
					<button
						onClick={() => setSandboxEnabled((v) => !v)}
						className={`rounded-full px-3 py-1 text-[11px] font-semibold shadow-sm border transition-all ${
							sandboxEnabled
								? 'bg-indigo-600 text-white border-indigo-600'
								: 'bg-white text-slate-700 border-slate-200 hover:border-indigo-200'
						}`}
					>
						{sandboxEnabled ? 'Game: Building' : 'Play mode: Add blocks'}
					</button>
				</div>
			</div>

			{sandboxEnabled && (
				<div className="rounded-xl border border-indigo-100 bg-indigo-50 px-3 py-2 text-[11px] text-indigo-800 flex flex-wrap items-center gap-2">
					<span className="font-semibold text-[12px]">Sandbox</span>
					<label className="flex items-center gap-1">
						<span>Type</span>
						<select
							value={builderMode}
							onChange={(e) => setBuilderMode(e.target.value as 'automatic' | 'absolute')}
							className="rounded-lg border border-indigo-200 bg-white px-2 py-1 text-[11px]"
						>
							<option value="automatic">Automatic</option>
							<option value="absolute">Absolute</option>
						</select>
					</label>
					<label className="flex items-center gap-1">
						<span>Length (km)</span>
						<input
							type="number"
							min={0.4}
							step={0.1}
							value={builderLength}
							onChange={(e) => setBuilderLength(Number(e.target.value))}
							className="w-16 rounded-lg border border-indigo-200 bg-white px-2 py-1 text-[11px]"
						/>
					</label>
					<span className="text-indigo-600">Tip: click "Add block" between stations to place it.</span>
				</div>
			)}

			<div className="relative overflow-x-auto pb-3">
				<svg width={svgWidth} height={280} className="min-w-[900px]">
					<defs>
						<marker id="arrow" markerWidth="10" markerHeight="10" refX="6" refY="3" orient="auto" markerUnits="strokeWidth">
							<path d="M0,0 L0,6 L6,3 z" fill="#0f172a" />
						</marker>
					</defs>

					{/* Main line */}
					<line x1={padding / 2} y1={mainY} x2={svgWidth - padding / 2} y2={mainY} stroke="#0f172a" strokeWidth={4} strokeLinecap="round" />

					{/* Builder line (for custom blocks) */}
					{sandboxEnabled && (
						<line
							x1={padding / 2}
							y1={builderY}
							x2={svgWidth - padding / 2}
							y2={builderY}
							stroke="#6366f1"
							strokeWidth={2}
							strokeDasharray="6 6"
							opacity={0.4}
						/>
					)}

					{/* Blocks */}
					{orderedBlocks.map((block) => {
						const fromX = stationX[block.fromStation]
						const toX = stationX[block.toStation]
						const width = Math.max(30, toX - fromX)
						const isAutomatic = block.lengthKm / AUTO_BLOCK_LENGTH_KM >= 2
						const color = statusColor(block)
						const segments = isAutomatic ? Math.max(2, Math.round(block.lengthKm / AUTO_BLOCK_LENGTH_KM)) : 1
						const signals = Math.max(0, segments - 1)
						return (
							<g key={block.id} className="transition-opacity duration-300" opacity={block.closed ? 0.7 : 1} transform={`translate(${fromX},0)`}>
								<rect
									x={0}
									y={mainY - 12}
									width={width}
									height={24}
									rx={8}
									fill={color.fill}
									stroke={color.stroke}
									strokeWidth={2}
									className="shadow-sm"
								/>
								<text x={8} y={mainY - 16} className="text-[10px] fill-slate-600 font-semibold">
									{isAutomatic ? 'Automatic Block' : 'Absolute Block'}
								</text>
								<text x={8} y={mainY + 30} className="text-[10px] fill-slate-500">
									{block.id} · {block.lengthKm.toFixed(1)} km · {statusLabel(block)}
								</text>
								{block.lastReleasedAt !== undefined && (
									<text x={8} y={mainY + 44} className="text-[10px] fill-slate-400">
										Traversals {block.traversals} • Last release @ {block.lastReleasedAt.toFixed(1)}m
									</text>
								)}
								{isAutomatic &&
									Array.from({ length: signals }).map((_, idx) => {
										const x = (width / segments) * (idx + 1)
										return <Signal key={`${block.id}-sig-${idx}`} x={x} y={mainY - 20} aspect={block.closed ? 'red' : block.occupiedBy ? 'amber' : 'green'} />
									})}
								{!isAutomatic && (
									<Signal
										x={width - 14}
										y={mainY - 20}
										aspect={block.closed ? 'red' : block.occupiedBy ? 'amber' : 'green'}
									/>
								)}
								<line
									x1={6}
									y1={mainY + 10}
									x2={width - 6}
									y2={mainY + 10}
									stroke="#0f172a"
									strokeWidth={1.5}
									strokeDasharray="4 4"
									markerEnd="url(#arrow)"
									opacity={0.5}
								/>
							</g>
						)
					})}

					{/* Sandbox blocks (game mode) */}
					{sandboxEnabled &&
						customBlocks.map((block) => {
							const fromX = stationX[block.fromStation]
							const toX = stationX[block.toStation]
							const width = Math.max(30, toX - fromX)
							const isAutomatic = builderMode === 'automatic' || block.lengthKm / AUTO_BLOCK_LENGTH_KM >= 2
							const color = { fill: '#eef2ff', stroke: '#6366f1' }
							const segments = isAutomatic ? Math.max(2, Math.round(block.lengthKm / AUTO_BLOCK_LENGTH_KM)) : 1
							const signals = Math.max(0, segments - 1)
							return (
								<g key={block.id} transform={`translate(${fromX},0)`}>
									<rect
										x={0}
										y={builderY - 14}
										width={width}
										height={28}
										rx={8}
										fill={color.fill}
										stroke={color.stroke}
										strokeWidth={2}
										className="shadow-sm"
									/>
									<text x={8} y={builderY - 18} className="text-[10px] fill-indigo-600 font-semibold">
										{isAutomatic ? 'Game: Auto block' : 'Game: Absolute block'}
									</text>
									<text x={8} y={builderY + 32} className="text-[10px] fill-indigo-500">
										{block.id} · {block.lengthKm.toFixed(1)} km
									</text>
									{Array.from({ length: signals }).map((_, idx) => {
										const x = (width / segments) * (idx + 1)
										return <Signal key={`${block.id}-g-${idx}`} x={x} y={builderY - 24} aspect="green" />
									})}
									<line
										x1={6}
										y1={builderY + 10}
										x2={width - 6}
										y2={builderY + 10}
										stroke="#6366f1"
										strokeWidth={1.5}
										strokeDasharray="4 4"
										markerEnd="url(#arrow)"
										opacity={0.6}
									/>
								</g>
							)
						})}

					{/* Stations & loops */}
					{orderedStations.map((st) => {
						const x = stationX[st.code]
						return (
							<g key={st.code}>
								{/* Loop arc */}
								<path
									d={`M ${x - 26} ${mainY} C ${x - 26} ${mainY - loopHeight}, ${x + 26} ${mainY - loopHeight}, ${x + 26} ${mainY}`}
									fill="none"
									stroke="#cbd5e1"
									strokeWidth={3}
								/>
								{/* Loop signal */}
								<Signal x={x} y={mainY - loopHeight + 10} aspect="green" />

								{/* Station marker */}
								<rect x={x - 26} y={mainY - 8} width={52} height={16} rx={6} fill="#0f172a" />
								<rect x={x - 24} y={mainY - 6} width={48} height={12} rx={4} fill="#f8fafc" stroke="#0f172a" strokeWidth={1} />
								<text x={x} y={mainY + 26} textAnchor="middle" className="text-[11px] fill-slate-700 font-semibold">
									{st.code}
								</text>
								<text x={x} y={mainY + 40} textAnchor="middle" className="text-[10px] fill-slate-500">
									Loop / Yard
								</text>

								{/* Sandbox drop target */}
								{sandboxEnabled && (
									<g>
										<rect
											x={x - 30}
											y={builderY - 8}
											width={60}
											height={16}
											rx={6}
											fill="#eef2ff"
											stroke="#c7d2fe"
											strokeWidth={1}
											opacity={0.7}
										/>
										<text x={x} y={builderY + 18} textAnchor="middle" className="text-[10px] fill-indigo-500">
											{st.code}
										</text>
									</g>
								)}
							</g>
						)
					})}

					{/* Add-block buttons between stations (sandbox) */}
					{sandboxEnabled &&
						orderedStations.map((st, idx) => {
							const next = orderedStations[idx + 1]
							if (!next) return null
							const midX = (stationX[st.code] + stationX[next.code]) / 2
							return (
								<foreignObject key={`${st.code}-${next.code}-btn`} x={midX - 50} y={builderY - 48} width={100} height={34}>
									<button
										onClick={() => handleAddCustomBlock(st.code, next.code)}
										className="w-full h-full rounded-full border border-indigo-200 bg-white text-[10px] font-semibold text-indigo-700 hover:bg-indigo-50 shadow-sm"
									>
										Add block
									</button>
								</foreignObject>
							)
						})}
				</svg>
			</div>

			<div className="flex flex-wrap gap-3 text-[11px] text-slate-600">
				<div className="flex items-center gap-1">
					<span className="h-3 w-3 rounded-full bg-emerald-200 border border-emerald-400" /> Free
				</div>
				<div className="flex items-center gap-1">
					<span className="h-3 w-3 rounded-full bg-amber-200 border border-amber-400" /> Occupied / Queue
				</div>
				<div className="flex items-center gap-1">
					<span className="h-3 w-3 rounded-full bg-rose-200 border border-rose-400" /> Closed (disruption/maintenance)
				</div>
				<div className="flex items-center gap-1">
					<span className="h-3 w-3 rounded-full bg-slate-200 border border-slate-400" /> Loops (schematic only)
				</div>
				<div className="flex items-center gap-1">
					<span className="h-3 w-3 rounded-full bg-white border border-slate-400" /> Signals auto-scaled every {AUTO_BLOCK_LENGTH_KM.toFixed(1)} km
				</div>
			</div>
		</div>
	)
}

