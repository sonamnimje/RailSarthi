import { useMemo } from 'react'
import clsx from 'clsx'
import { blockSections, signals, stations, trains, type Train, type TrainStop } from '../lib/railwayMasterChartData'

export interface RailwayMasterChartProps {
  height?: number
  className?: string
}

type StationPosition = {
  stationId: number
  y: number
}

type TrainGraphics = {
  train: Train
  path: string
  color: string
  dashArray?: string
  label: {
    x: number
    y: number
  }
  halts: Array<{
    x1: number
    x2: number
    y: number
  }>
  arrivals: Array<{
    x: number
    y: number
    hollow?: boolean
  }>
  crossings: Array<{
    x: number
    y: number
    with: string
  }>
}

const MINUTE_SCALE = 3.25
const stationSpacing = 110
const margins = {
  top: 160,
  right: 180,
  bottom: 140,
  left: 260
}

function parseMinutes(value: string): number {
  const [h, m] = value.split(':').map(Number)
  return h * 60 + m
}

function formatTimeLabel(minutes: number): string {
  const hh = Math.floor(minutes / 60)
  const mm = minutes % 60
  return `${`${hh}`.padStart(2, '0')}:${`${mm}`.padStart(2, '0')}`
}

function getTrainColor(train: Train): { color: string; dash?: string } {
  if (train.type === 'goods') {
    return { color: '#16a34a', dash: '8 5' }
  }
  if (train.direction === 'down') {
    return { color: '#2563eb' }
  }
  return { color: '#dc2626' }
}

function buildTrainGraphics(
  train: Train,
  stationPositions: Map<number, number>,
  timeToX: (minutes: number) => number
): TrainGraphics {
  const { color, dash } = getTrainColor(train)

  const halts: TrainGraphics['halts'] = []
  const arrivals: TrainGraphics['arrivals'] = []
  const crossings: TrainGraphics['crossings'] = []
  const pathPoints: Array<{ x: number; y: number }> = []

  train.schedule.forEach((stop, index) => {
    const y = stationPositions.get(stop.stationId)
    if (y == null) return
    const arrivalMinutes = parseMinutes(stop.arrival)
    const departureMinutes = parseMinutes(stop.departure)

    if (stop.crossingWith) {
      crossings.push({
        x: timeToX(Math.round((arrivalMinutes + departureMinutes) / 2)),
        y,
        with: stop.crossingWith
      })
    }

    if (stop.arrival !== stop.departure) {
      halts.push({
        x1: timeToX(arrivalMinutes),
        x2: timeToX(departureMinutes),
        y
      })
    }

    arrivals.push({
      x: timeToX(arrivalMinutes),
      y,
      hollow: index === 0
    })

    if (index === 0) {
      pathPoints.push({ x: timeToX(departureMinutes), y })
    }

    const nextStop = train.schedule[index + 1]
    if (!nextStop) return
    const nextY = stationPositions.get(nextStop.stationId)
    if (nextY == null) return
    const nextArrival = parseMinutes(nextStop.arrival)
    pathPoints.push({ x: timeToX(nextArrival), y: nextY })
  })

  const path = pathPoints
    .map((point, index) => {
      const command = index === 0 ? 'M' : 'L'
      return `${command}${point.x},${point.y}`
    })
    .join(' ')

  const label = getLabelCoordinates(train.schedule, stationPositions, timeToX, train.direction)

  return {
    train,
    path,
    color,
    dashArray: dash,
    label,
    halts,
    arrivals,
    crossings
  }
}

function getLabelCoordinates(
  schedule: TrainStop[],
  stationPositions: Map<number, number>,
  timeToX: (minutes: number) => number,
  direction: Train['direction']
): { x: number; y: number } {
  if (schedule.length === 0) {
    return { x: 0, y: 0 }
  }

  const first = schedule[0]
  const second = schedule[1] ?? first

  const firstDeparture = timeToX(parseMinutes(first.departure))
  const secondArrival = timeToX(parseMinutes(second.arrival))
  const firstY = stationPositions.get(first.stationId) ?? 0
  const secondY = stationPositions.get(second.stationId) ?? firstY

  const x = (firstDeparture + secondArrival) / 2
  const y = (firstY + secondY) / 2 + (direction === 'up' ? -26 : 26)

  return { x, y }
}

function buildStationPositions(): Map<number, number> {
  return new Map(
    stations.map((station, index) => {
      const y = margins.top + index * stationSpacing
      return [station.id, y]
    })
  )
}

function computeTimeBounds(): { min: number; max: number } {
  let min = Number.POSITIVE_INFINITY
  let max = Number.NEGATIVE_INFINITY
  trains.forEach(train => {
    train.schedule.forEach(stop => {
      const arr = parseMinutes(stop.arrival)
      const dep = parseMinutes(stop.departure)
      min = Math.min(min, arr, dep)
      max = Math.max(max, arr, dep)
    })
  })

  // Add buffer of 20 minutes on each side
  return {
    min: Math.max(0, Math.floor((min - 20) / 5) * 5),
    max: Math.ceil((max + 20) / 5) * 5
  }
}

function prepareTimeTicks(min: number, max: number): number[] {
  const ticks: number[] = []
  const start = Math.floor(min / 60) * 60
  for (let minute = start; minute <= max + 60; minute += 60) {
    ticks.push(minute)
  }
  return ticks
}

const SIGNAL_SHAPES: Record<string, (x: number, y: number) => string> = {
  home: (x, y) => `M${x - 4},${y} A4,4 0 1,0 ${x + 4},${y} A4,4 0 1,0 ${x - 4},${y}`,
  starter: (x, y) => `M${x - 4},${y - 4} L${x + 4},${y - 4} L${x + 4},${y + 4} L${x - 4},${y + 4} Z`,
  distant: (x, y) => `M${x},${y - 5} L${x + 5},${y + 5} L${x - 5},${y + 5} Z`
}

const directionColor: Record<'up' | 'down', string> = {
  up: '#dc2626',
  down: '#2563eb'
}

export default function RailwayMasterChart({ height = 720, className }: RailwayMasterChartProps) {
  const stationPositions = useMemo(() => buildStationPositions(), [])
  const timeBounds = useMemo(() => computeTimeBounds(), [])
  const chartWidth = useMemo(
    () => margins.left + margins.right + (timeBounds.max - timeBounds.min) * MINUTE_SCALE,
    [timeBounds.max, timeBounds.min]
  )
  const chartHeight = useMemo(
    () => margins.top + margins.bottom + stationSpacing * (stations.length - 1),
    []
  )

  const timeToX = useMemo(() => {
    return (minutes: number) => margins.left + (minutes - timeBounds.min) * MINUTE_SCALE
  }, [timeBounds.min])

  const trainGraphics = useMemo<TrainGraphics[]>(() => {
    return trains.map(train => buildTrainGraphics(train, stationPositions, timeToX))
  }, [stationPositions, timeToX])

  const timeTicks = useMemo(() => prepareTimeTicks(timeBounds.min, timeBounds.max), [timeBounds.max, timeBounds.min])

  const computedHeight = Math.max(height, chartHeight)

  return (
    <div className={clsx('w-full rounded-2xl border border-slate-200 bg-blue-50 shadow-sm', className)}>
      <div className="flex flex-col gap-3 px-6 pt-6 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-xl font-semibold text-slate-800">मास्टर चार्ट (Master Chart)</h2>
          <p className="text-sm text-slate-500">Train control diagram — Bhusaval Jn (BSL) ⇄ Khandwa Jn (KNW)</p>
        </div>
        <Legend />
      </div>
      <div className="p-6 pt-4">
        <div className="relative overflow-x-auto">
          <svg
            viewBox={`0 0 ${chartWidth} ${computedHeight}`}
            className="min-h-[400px] w-full"
            role="img"
            aria-label="Railway master chart showing train movements between Bhusaval and Khandwa"
          >
            <rect x={0} y={0} width={chartWidth} height={computedHeight} fill="#f8fafc" rx={18} />
            <Grid
              chartWidth={chartWidth}
              chartHeight={computedHeight}
              timeTicks={timeTicks}
              timeToX={timeToX}
              stationPositions={stationPositions}
            />
            <Stations stationPositions={stationPositions} />
            <BlockSections stationPositions={stationPositions} timeBounds={timeBounds} />
            <Signals stationPositions={stationPositions} />
            {trainGraphics.map(graphic => (
              <TrainPath key={graphic.train.id} graphic={graphic} />
            ))}
          </svg>
        </div>
      </div>
      <div className="px-6 pb-6 text-xs text-slate-500">
        Horizontal ticks depict train halts. Arrows indicate direction of movement. Crossing symbols show planned meet-pass
        operations under station control.
      </div>
    </div>
  )
}

interface GridProps {
  chartWidth: number
  chartHeight: number
  timeTicks: number[]
  timeToX: (minutes: number) => number
  stationPositions: Map<number, number>
}

function Grid({ chartWidth, chartHeight, timeTicks, timeToX, stationPositions }: GridProps) {
  return (
    <g>
      {timeTicks.map(tick => {
        const x = timeToX(tick)
        return (
          <g key={tick}>
            <line x1={x} x2={x} y1={margins.top - 20} y2={chartHeight - margins.bottom + 20} stroke="#cbd5f5" strokeWidth={1} />
            <text
              x={x}
              y={chartHeight - margins.bottom + 60}
              textAnchor="middle"
              className="fill-slate-500 text-[12px]"
              fontFamily="Inter, system-ui, sans-serif"
            >
              {formatTimeLabel(tick)}
            </text>
          </g>
        )
      })}
      {stations.map(station => {
        const y = stationPositions.get(station.id)
        if (y == null) return null
        return (
          <line
            key={`h-${station.id}`}
            x1={margins.left - 10}
            x2={chartWidth - margins.right + 20}
            y1={y}
            y2={y}
            stroke="#d1d5db"
            strokeWidth={0.8}
            strokeDasharray="5 4"
          />
        )
      })}
    </g>
  )
}

interface StationsProps {
  stationPositions: Map<number, number>
}

function Stations({ stationPositions }: StationsProps) {
  return (
    <g>
      {stations.map(station => {
        const y = stationPositions.get(station.id)
        if (y == null) return null
        const isCrossing = station.category === 'crossing'
        return (
          <g key={station.id} transform={`translate(0, ${y})`}>
            <circle cx={margins.left - 40} cy={0} r={6} fill="#0f172a" />
            <text
              x={margins.left - 55}
              y={-14}
              textAnchor="end"
              className="fill-slate-800 text-[13px] font-semibold tracking-wide"
              fontFamily="Inter, system-ui, sans-serif"
            >
              {station.name}
            </text>
            <text
              x={margins.left - 55}
              y={4}
              textAnchor="end"
              className="fill-slate-500 text-[11px]"
              fontFamily="Inter, system-ui, sans-serif"
            >
              {station.code} • {station.km} km
            </text>
            {station.notes ? (
              <text
                x={margins.left - 55}
                y={20}
                textAnchor="end"
                className="fill-slate-400 text-[10px]"
                fontFamily="Inter, system-ui, sans-serif"
              >
                {station.notes}
              </text>
            ) : null}
            {isCrossing ? (
              <text
                x={margins.left - 12}
                y={5}
                className="fill-amber-500 text-[11px]"
                fontFamily="Inter, system-ui, sans-serif"
              >
                ✶
              </text>
            ) : null}
          </g>
        )
      })}
    </g>
  )
}

interface BlockSectionsProps {
  stationPositions: Map<number, number>
  timeBounds: { min: number; max: number }
}

function BlockSections({ stationPositions, timeBounds }: BlockSectionsProps) {
  const midX = margins.left - 160
  return (
    <g>
      {blockSections.map(block => {
        const fromY = stationPositions.get(block.fromStationId)
        const toY = stationPositions.get(block.toStationId)
        if (fromY == null || toY == null) return null
        const midY = (fromY + toY) / 2
        return (
          <g key={block.id}>
            <line x1={midX + 50} x2={midX + 50} y1={fromY} y2={toY} stroke="#9ca3af" strokeWidth={1.4} strokeDasharray="3 3" />
            <text
              x={midX}
              y={midY - 6}
              textAnchor="start"
              className="fill-slate-600 text-[11px] font-medium"
              fontFamily="Inter, system-ui, sans-serif"
            >
              {block.name}
            </text>
            <text
              x={midX}
              y={midY + 10}
              textAnchor="start"
              className="fill-slate-400 text-[10px]"
              fontFamily="Inter, system-ui, sans-serif"
            >
              {block.lengthKm} km {block.remarks ? `• ${block.remarks}` : ''}
            </text>
          </g>
        )
      })}
      <text
        x={margins.left + (timeBounds.max - timeBounds.min) * MINUTE_SCALE / 2}
        y={margins.top - 80}
        textAnchor="middle"
        className="fill-slate-600 text-[13px] font-semibold uppercase tracking-[0.2em]"
        fontFamily="Inter, system-ui, sans-serif"
      >
        Time ➝
      </text>
    </g>
  )
}

interface SignalsProps {
  stationPositions: Map<number, number>
}

function Signals({ stationPositions }: SignalsProps) {
  return (
    <g>
      {signals.map(signal => {
        const y = stationPositions.get(signal.stationId)
        if (y == null) return null
        const directionOffset = signal.direction === 'up' ? -24 : 24
        const x = margins.left - 110 + (signal.direction === 'up' ? -10 : 10)
        const pathBuilder = SIGNAL_SHAPES[signal.type]
        const color = directionColor[signal.direction]
        return (
          <path
            key={signal.id}
            d={pathBuilder ? pathBuilder(x, y + directionOffset) : ''}
            fill={signal.type === 'starter' ? color : 'none'}
            stroke={color}
            strokeWidth={1.4}
            opacity={0.9}
          />
        )
      })}
      <text
        x={margins.left - 110}
        y={margins.top - 35}
        textAnchor="middle"
        className="fill-slate-500 text-[10px]"
        fontFamily="Inter, system-ui, sans-serif"
      >
        Signals
      </text>
      <line
        x1={margins.left - 140}
        x2={margins.left - 80}
        y1={margins.top - 28}
        y2={margins.top - 28}
        stroke="#cbd5f5"
        strokeWidth={1}
      />
    </g>
  )
}

interface TrainPathProps {
  graphic: TrainGraphics
}

function TrainPath({ graphic }: TrainPathProps) {
  const labelWidth = 150
  const labelHeight = 34
  return (
    <g>
      <defs>
        <marker
          id={`arrow-${graphic.train.id}`}
          viewBox="0 0 10 10"
          refX="8"
          refY="5"
          markerWidth="8"
          markerHeight="8"
          orient="auto"
        >
          <path d="M 0 0 L 10 5 L 0 10 z" fill={graphic.color} />
        </marker>
      </defs>

      <path
        d={graphic.path}
        fill="none"
        stroke={graphic.color}
        strokeWidth={2.6}
        strokeDasharray={graphic.dashArray}
        markerEnd={`url(#arrow-${graphic.train.id})`}
      />

      {graphic.halts.map((halt, index) => (
        <line
          key={`${graphic.train.id}-halt-${index}`}
          x1={halt.x1}
          x2={halt.x2}
          y1={halt.y}
          y2={halt.y}
          stroke={graphic.color}
          strokeWidth={3}
          strokeLinecap="round"
        />
      ))}

      {graphic.arrivals.map((arrival, index) => (
        <circle
          key={`${graphic.train.id}-arrival-${index}`}
          cx={arrival.x}
          cy={arrival.y}
          r={arrival.hollow ? 4 : 5}
          fill={arrival.hollow ? '#ffffff' : graphic.color}
          stroke={graphic.color}
          strokeWidth={arrival.hollow ? 1.5 : 0}
        />
      ))}

      {graphic.crossings.map((crossing, index) => (
        <g key={`${graphic.train.id}-cross-${index}`} transform={`translate(${crossing.x}, ${crossing.y})`}>
          <line x1={-6} x2={6} y1={-6} y2={6} stroke="#0f172a" strokeWidth={1.6} />
          <line x1={-6} x2={6} y1={6} y2={-6} stroke="#0f172a" strokeWidth={1.6} />
          <text
            x={0}
            y={-10}
            textAnchor="middle"
            className="fill-slate-600 text-[10px]"
            fontFamily="Inter, system-ui, sans-serif"
          >
            X {crossing.with}
          </text>
        </g>
      ))}

      <g transform={`translate(${graphic.label.x - labelWidth / 2}, ${graphic.label.y - labelHeight / 2})`}>
        <rect
          width={labelWidth}
          height={labelHeight}
          rx={6}
          fill="#f1f5f9"
          stroke={graphic.color}
          strokeWidth={1}
          opacity={0.94}
        />
        <text
          x={12}
          y={16}
          className="fill-slate-700 text-[11px] font-semibold"
          fontFamily="Inter, system-ui, sans-serif"
        >
          {graphic.train.number} • {graphic.train.name}
        </text>
        <text
          x={12}
          y={28}
          className="fill-slate-500 text-[10px]"
          fontFamily="Inter, system-ui, sans-serif"
        >
          {graphic.train.direction === 'up' ? 'Up (BSL → KNW)' : 'Down (KNW → BSL)'}
        </text>
      </g>
    </g>
  )
}

function Legend() {
  return (
    <div className="flex flex-wrap items-center gap-3 text-xs font-medium text-slate-600">
      <LegendItem color="#dc2626" label="Up Express / Passenger" />
      <LegendItem color="#2563eb" label="Down Express / Passenger" />
      <LegendItem color="#16a34a" label="Goods / Freight" dashed />
      <LegendSymbol />
    </div>
  )
}

interface LegendItemProps {
  color: string
  label: string
  dashed?: boolean
}

function LegendItem({ color, label, dashed }: LegendItemProps) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1">
      <span
        className="inline-flex h-3 w-8 items-center justify-center"
        style={{
          backgroundColor: dashed ? 'transparent' : color,
          backgroundImage: dashed ? `repeating-linear-gradient(90deg, ${color}, ${color} 6px, transparent 6px, transparent 12px)` : undefined,
          border: dashed ? `1px dashed ${color}` : `1px solid ${color}`,
          borderRadius: '9999px'
        }}
      />
      <span>{label}</span>
    </span>
  )
}

function LegendSymbol() {
  return (
    <span className="inline-flex items-center gap-4 rounded-full border border-slate-200 bg-slate-50 px-3 py-1">
      <span className="inline-flex items-center gap-1 text-slate-600">
        <span className="inline-block h-3 w-3 border border-slate-600" />
        <span>Crossing</span>
      </span>
      <span className="inline-flex items-center gap-1 text-slate-600">
        <span className="inline-block h-[2px] w-6 bg-slate-600" />
        <span>Halt</span>
      </span>
      <span className="inline-flex items-center gap-1 text-slate-600">
        <span className="inline-block text-[12px] leading-none text-amber-500">✶</span>
        <span>Crossing station</span>
      </span>
    </span>
  )
}


