// Core real-time simulation engine for Jabalpur → Itarsi
// Handles interpolation, dwell times, disruptions, and train state timelines.

export type TrainType = 'Passenger' | 'Freight'

export type Station = {
	code: string
	name: string
	distanceKm: number
	haltMinutes: number
	lat: number
	lon: number
}

export type StationSchedule = {
	stationCode: string
	scheduledTimeMin: number
}

export type TrainConfig = {
	trainId: string
	trainType: TrainType
	speedKmph: number
	speedProfile?: {
		cruise: number
		slow: number
	}
	stations: StationSchedule[]
	color: string
}

export type DisruptionType = 'signal_failure' | 'track_block' | 'weather_slowdown'

export type Disruption = {
	id: string
	type: DisruptionType
	description: string
	startStation: string
	endStation: string
	startAtMin: number
	durationMin: number
	speedReduction: Record<TrainType, number> // multiplier (0-1)
}

export type TrainHistoryPoint = {
	timeMin: number
	distanceKm: number
	delayMin: number
	stationCode?: string
}

export type TrainRuntime = {
	trainId: string
	trainType: TrainType
	distanceKm: number
	segmentIndex: number
	delayMin: number
	status: 'running' | 'halted' | 'completed'
	currentSpeedKmph: number
	dwellRemaining: number
	actualTimes: Record<string, number>
	history: TrainHistoryPoint[]
	speedSamples: number[]
}

export type SimulationSnapshot = {
	simTimeMin: number
	running: boolean
	disruptions: Disruption[]
	trains: Record<string, TrainRuntime>
	lastDisruptionEnd?: number
	speedMultiplier: number
}

type EngineConfig = {
	stations: Station[]
	trains: TrainConfig[]
}

type Subscriber = (state: SimulationSnapshot) => void

const clampHistory = (history: TrainHistoryPoint[], max = 500) =>
	history.length > max ? history.slice(history.length - max) : history

const clampSpeeds = (speeds: number[], max = 200) =>
	speeds.length > max ? speeds.slice(speeds.length - max) : speeds

const findStation = (stations: Station[], code: string) =>
	stations.find((s) => s.code === code)

const getDistanceForStation = (stations: Station[], code: string) =>
	findStation(stations, code)?.distanceKm ?? 0

const isDisruptionActive = (
	disruption: Disruption,
	stations: Station[],
	simTimeMin: number,
	distanceKm: number
) => {
	const startDist = getDistanceForStation(stations, disruption.startStation)
	const endDist = getDistanceForStation(stations, disruption.endStation)
	const inWindow =
		simTimeMin >= disruption.startAtMin && simTimeMin <= disruption.startAtMin + disruption.durationMin
	const inSection =
		distanceKm >= Math.min(startDist, endDist) && distanceKm <= Math.max(startDist, endDist)
	return inWindow && inSection
}

const computeSegmentSpeed = (
	config: TrainConfig,
	stations: Station[],
	segmentIndex: number
) => {
	const curr = config.stations[segmentIndex]
	const next = config.stations[segmentIndex + 1]
	if (!next) return 0
	const distDelta =
		getDistanceForStation(stations, next.stationCode) - getDistanceForStation(stations, curr.stationCode)
	const timeDelta = Math.max(next.scheduledTimeMin - curr.scheduledTimeMin, 1)
	const nominal = (distDelta / timeDelta) * 60 // km/h
	if (config.speedProfile?.cruise) {
		return Math.min(config.speedProfile.cruise, nominal)
	}
	return nominal || config.speedKmph
}

export const createSimulationEngine = (config: EngineConfig) => {
	let state: SimulationSnapshot = {
		simTimeMin: 0,
		running: false,
		disruptions: [],
		trains: {},
		speedMultiplier: 1,
	}

	const subscribers = new Set<Subscriber>()
	let rafId: number | null = null
	let lastFrame = 0

	const initTrains = () => {
		const trains: Record<string, TrainRuntime> = {}
		for (const train of config.trains) {
			const firstStationCode = train.stations[0].stationCode
			const firstStation = findStation(config.stations, firstStationCode)
			trains[train.trainId] = {
				trainId: train.trainId,
				trainType: train.trainType,
				distanceKm: firstStation?.distanceKm ?? 0,
				segmentIndex: 0,
				delayMin: 0,
				status: 'halted',
				currentSpeedKmph: 0,
				dwellRemaining: firstStation?.haltMinutes ?? 0,
				actualTimes: { [firstStationCode]: 0 },
				history: [{ timeMin: 0, distanceKm: firstStation?.distanceKm ?? 0, delayMin: 0, stationCode: firstStationCode }],
				speedSamples: [],
			}
		}
		return trains
	}

	const notify = () => subscribers.forEach((s) => s(state))

	const reset = () => {
		state = {
			simTimeMin: 0,
			running: false,
			disruptions: state.disruptions,
			trains: initTrains(),
			speedMultiplier: state.speedMultiplier,
		}
		notify()
	}

	const addHistoryPoint = (runtime: TrainRuntime, timeMin: number) => {
		const point: TrainHistoryPoint = {
			timeMin,
			distanceKm: runtime.distanceKm,
			delayMin: runtime.delayMin,
		}
		runtime.history = clampHistory([...runtime.history, point])
	}

	const advanceTrain = (
		runtime: TrainRuntime,
		trainCfg: TrainConfig,
		deltaMin: number,
		snapshotTimeMin: number
	) => {
		if (runtime.status === 'completed') return

		let remaining = deltaMin
		while (remaining > 0) {
			const nextSegment = trainCfg.stations[runtime.segmentIndex + 1]
			if (!nextSegment) {
				runtime.status = 'completed'
				runtime.currentSpeedKmph = 0
				addHistoryPoint(runtime, snapshotTimeMin - remaining + deltaMin)
				return
			}

			if (runtime.dwellRemaining > 0) {
				const consume = Math.min(remaining, runtime.dwellRemaining)
				runtime.dwellRemaining -= consume
				remaining -= consume
				runtime.status = runtime.dwellRemaining > 0 ? 'halted' : 'running'
				runtime.currentSpeedKmph = 0
				if (runtime.dwellRemaining <= 0) {
					runtime.actualTimes[trainCfg.stations[runtime.segmentIndex].stationCode] =
						(snapshotTimeMin + deltaMin - remaining) ?? snapshotTimeMin
				}
				continue
			}

			const baseSpeed = computeSegmentSpeed(trainCfg, config.stations, runtime.segmentIndex) || trainCfg.speedKmph
			const activeFactors = state.disruptions
				.filter((d) => isDisruptionActive(d, config.stations, state.simTimeMin, runtime.distanceKm))
				.map((d) => d.speedReduction[trainCfg.trainType])
			const factor = activeFactors.length ? Math.min(...activeFactors) : 1
			const speed = baseSpeed * factor
			runtime.currentSpeedKmph = speed

			const currentStationCode = trainCfg.stations[runtime.segmentIndex].stationCode
			const nextStationCode = nextSegment.stationCode
			const currentDist = getDistanceForStation(config.stations, currentStationCode)
			const targetDist = getDistanceForStation(config.stations, nextStationCode)
			const distRemaining = Math.max(targetDist - runtime.distanceKm, 0)
			const kmPerMin = speed / 60

			if (kmPerMin <= 0.001) {
				// stalled due to zero speed reduction
				addHistoryPoint(runtime, snapshotTimeMin + (deltaMin - remaining))
				return
			}

			const timeToNext = distRemaining / kmPerMin
			if (timeToNext <= remaining) {
				// arrive within this frame
				runtime.distanceKm = targetDist
				const arrivalTime = snapshotTimeMin + (deltaMin - remaining) + timeToNext
				runtime.actualTimes[nextStationCode] = arrivalTime
				const scheduledArrival = nextSegment.scheduledTimeMin
				runtime.delayMin = Math.max(arrivalTime - scheduledArrival, 0)
				runtime.dwellRemaining = findStation(config.stations, nextStationCode)?.haltMinutes ?? 0
				runtime.segmentIndex += 1
				remaining -= timeToNext
				addHistoryPoint(runtime, arrivalTime)
				if (!trainCfg.stations[runtime.segmentIndex + 1]) {
					runtime.status = 'completed'
				}
			} else {
				// move within segment
				runtime.distanceKm = runtime.distanceKm + kmPerMin * remaining
				addHistoryPoint(runtime, snapshotTimeMin + (deltaMin - remaining))
				remaining = 0
			}

			runtime.speedSamples = clampSpeeds([...runtime.speedSamples, runtime.currentSpeedKmph])
		}
	}

	const step = (now: number) => {
		if (!state.running) {
			rafId = requestAnimationFrame(step)
			lastFrame = now
			return
		}
		const deltaMs = now - lastFrame
		lastFrame = now
		const deltaMin = (deltaMs / 60000) * state.speedMultiplier
		state.simTimeMin += deltaMin

		for (const trainCfg of config.trains) {
			const runtime = state.trains[trainCfg.trainId]
			if (!runtime) continue
			advanceTrain(runtime, trainCfg, deltaMin, state.simTimeMin - deltaMin)
		}

		notify()
		rafId = requestAnimationFrame(step)
	}

	const start = () => {
		if (state.running) return
		state.running = true
		lastFrame = performance.now()
		rafId = requestAnimationFrame(step)
		notify()
	}

	const pause = () => {
		state.running = false
		notify()
	}

	const setDisruptions = (disruptions: Disruption[]) => {
		const now = performance.now()
		state.disruptions = disruptions
		const latestEnd = disruptions.map((d) => d.startAtMin + d.durationMin).sort((a, b) => b - a)[0]
		if (latestEnd) state.lastDisruptionEnd = latestEnd
		lastFrame = now
		notify()
	}

	const setSpeedMultiplier = (multiplier: number) => {
		state.speedMultiplier = multiplier
		notify()
	}

	const subscribe = (fn: Subscriber) => {
		subscribers.add(fn)
		fn(state)
		return () => {
			subscribers.delete(fn)
		}
	}

	const getState = () => state

	// initialize
	state.trains = initTrains()
	rafId = requestAnimationFrame((t) => {
		lastFrame = t
		step(t)
	})

	return {
		start,
		pause,
		reset,
		subscribe,
		setDisruptions,
		setSpeedMultiplier,
		getState,
	}
}


