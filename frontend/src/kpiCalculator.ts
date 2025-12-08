import { SimulationSnapshot, Station, TrainConfig, TrainRuntime } from './simulationEngine'

export type KpiResult = {
	otpPercent: number
	avgDelayByType: Record<string, number>
	sectionTravelTime: Record<string, number>
	speedVariance: Record<string, number>
	delayRatioPassengerFreight: number
	recoveryTimeAfterDisruption: number
	trainsAffected: number
}

const variance = (values: number[]) => {
	if (!values.length) return 0
	const mean = values.reduce((a, b) => a + b, 0) / values.length
	return (
		values.reduce((acc, v) => acc + Math.pow(v - mean, 2), 0) /
		values.length
	)
}

const finalDelay = (runtime: TrainRuntime, config: TrainConfig) => {
	const finalStation = config.stations[config.stations.length - 1].stationCode
	const actual = runtime.actualTimes[finalStation]
	const scheduled = config.stations[config.stations.length - 1].scheduledTimeMin
	return actual ? Math.max(actual - scheduled, 0) : runtime.delayMin
}

export const computeKpis = (
	state: SimulationSnapshot,
	stations: Station[],
	configs: TrainConfig[]
): KpiResult => {
	const results: KpiResult = {
		otpPercent: 0,
		avgDelayByType: {},
		sectionTravelTime: {},
		speedVariance: {},
		delayRatioPassengerFreight: 0,
		recoveryTimeAfterDisruption: 0,
		trainsAffected: 0,
	}

	const delaysByType: Record<string, number[]> = {}
	const travelTimeByType: Record<string, number[]> = {}
	const speedVarByType: Record<string, number[]> = {}
	let onTimeCount = 0

	for (const cfg of configs) {
		const runtime = state.trains[cfg.trainId]
		if (!runtime) continue
		const delay = finalDelay(runtime, cfg)
		delaysByType[cfg.trainType] = delaysByType[cfg.trainType] || []
		delaysByType[cfg.trainType].push(delay)

		const startCode = cfg.stations[0].stationCode
		const endCode = cfg.stations[cfg.stations.length - 1].stationCode
		const startActual = runtime.actualTimes[startCode] ?? 0
		const endActual = runtime.actualTimes[endCode]
		if (endActual !== undefined) {
			travelTimeByType[cfg.trainType] = travelTimeByType[cfg.trainType] || []
			travelTimeByType[cfg.trainType].push(endActual - startActual)
		}

		speedVarByType[cfg.trainType] = speedVarByType[cfg.trainType] || []
		if (runtime.speedSamples.length > 3) {
			speedVarByType[cfg.trainType].push(variance(runtime.speedSamples))
		}

		if (delay <= 5) onTimeCount += 1
		if (delay > 0) results.trainsAffected += 1
	}

	const totalTrains = configs.length || 1
	results.otpPercent = Math.round((onTimeCount / totalTrains) * 100)

	for (const [type, values] of Object.entries(delaysByType)) {
		const avg = values.reduce((a, b) => a + b, 0) / values.length
		results.avgDelayByType[type] = Number(avg.toFixed(1))
	}

	for (const [type, values] of Object.entries(travelTimeByType)) {
		const avg = values.reduce((a, b) => a + b, 0) / values.length
		results.sectionTravelTime[type] = Number(avg.toFixed(1))
	}

	for (const [type, values] of Object.entries(speedVarByType)) {
		const avg = values.reduce((a, b) => a + b, 0) / values.length
		results.speedVariance[type] = Number(avg.toFixed(2))
	}

	// Calculate delay ratio using averages, not first values
	const passengerAvg = results.avgDelayByType['Passenger'] ?? 0
	const freightAvg = results.avgDelayByType['Freight'] ?? 0
	// Avoid division by zero - if freight delay is 0, return 0 or a safe value
	if (freightAvg === 0) {
		results.delayRatioPassengerFreight = passengerAvg > 0 ? 999 : 0
	} else {
		results.delayRatioPassengerFreight = Number((passengerAvg / freightAvg).toFixed(2))
	}

	if (state.lastDisruptionEnd && state.simTimeMin > state.lastDisruptionEnd) {
		results.recoveryTimeAfterDisruption = Number((state.simTimeMin - state.lastDisruptionEnd).toFixed(1))
	}

	return results
}


