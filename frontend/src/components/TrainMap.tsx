'use client'

import React, { useMemo, useState } from 'react'
import { MapContainer, Polyline, TileLayer, CircleMarker, Tooltip as LeafletTooltip, Marker } from 'react-leaflet'
import L from 'leaflet'
import { SimulationSnapshot, Station, TrainConfig, TrainRuntime } from '../simulationEngine'
import 'leaflet/dist/leaflet.css'

type Props = {
	stations: Station[]
	trains: TrainConfig[]
	snapshot: SimulationSnapshot
	showPassenger: boolean
	showFreight: boolean
	viewMode: 'inline' | 'outline'
}

type TrainDetails = {
	cfg: TrainConfig
	runtime: TrainRuntime
	direction: 'upline' | 'downline'
	trainName: string
	freightCargo: string | null
	originStation: Station | undefined
	destStation: Station | undefined
	avgSpeed: number
	distanceTraveled: number
	currentSection: number
	totalSections: number
	sectionProgress: number
	scheduledTime: number
	actualTime: number
	eta: number
	currentStation: Station | undefined
	nextStation: Station | undefined
}

// Create icons with direction-based colors
const createTrainIcon = (trainType: 'Passenger' | 'Freight', direction: 'upline' | 'downline') => {
	const emoji = trainType === 'Passenger' ? '🚆' : '🚂'
	const bgColor = direction === 'upline' 
		? (trainType === 'Passenger' ? '#2563eb' : '#7c3aed') // blue/purple for upline
		: (trainType === 'Passenger' ? '#b91c1c' : '#065f46') // red/green for downline
	
	return L.divIcon({
		className: 'train-icon',
		html: `<div style="background-color: ${bgColor}; border-radius: 50%; width: 24px; height: 24px; display: flex; align-items: center; justify-content: center; border: 2px solid white; box-shadow: 0 2px 4px rgba(0,0,0,0.3);">${emoji}</div>`,
		iconSize: [24, 24],
		iconAnchor: [12, 12],
	})
}

// Determine if train is upline (going from higher distance to lower) or downline (lower to higher)
const getTrainDirection = (train: TrainConfig, stations: Station[]): 'upline' | 'downline' => {
	if (train.stations.length < 2) return 'downline' // default
	
	const firstStation = stations.find(s => s.code === train.stations[0].stationCode)
	const lastStation = stations.find(s => s.code === train.stations[train.stations.length - 1].stationCode)
	
	if (!firstStation || !lastStation) return 'downline' // default
	
	// If first station distance < last station distance, it's downline (going forward)
	// If first station distance > last station distance, it's upline (going backward)
	return firstStation.distanceKm < lastStation.distanceKm ? 'downline' : 'upline'
}

const interpolatePosition = (distanceKm: number, stations: Station[]) => {
	const sorted = [...stations].sort((a, b) => a.distanceKm - b.distanceKm)
	const targetIndex = sorted.findIndex((st) => st.distanceKm >= distanceKm)
	if (targetIndex <= 0) {
		const s = sorted[0]
		return { lat: s.lat, lon: s.lon }
	}
	const prev = sorted[targetIndex - 1]
	const next = sorted[targetIndex] ?? prev
	const span = next.distanceKm - prev.distanceKm || 1
	const ratio = Math.min(Math.max((distanceKm - prev.distanceKm) / span, 0), 1)
	return {
		lat: prev.lat + (next.lat - prev.lat) * ratio,
		lon: prev.lon + (next.lon - prev.lon) * ratio,
	}
}

const TrainMap: React.FC<Props> = ({ stations, trains, snapshot, showPassenger, showFreight, viewMode }) => {
	const [selectedTrain, setSelectedTrain] = useState<TrainDetails | null>(null)
	const isDetailsOpen = !!selectedTrain
	
	const center = useMemo(() => {
		const avgLat = stations.reduce((a, b) => a + b.lat, 0) / stations.length
		const avgLon = stations.reduce((a, b) => a + b.lon, 0) / stations.length
		return [avgLat, avgLon] as [number, number]
	}, [stations])

	const orderedStations = useMemo(() => [...stations].sort((a, b) => a.distanceKm - b.distanceKm), [stations])

	// Mock freight cargo types based on train ID
	const getFreightCargo = (trainId: string): string => {
		const cargoTypes = [
			'Coal', 'Iron Ore', 'Cement', 'Food Grains', 'Steel', 
			'Petroleum', 'Fertilizers', 'Containers', 'Automobiles', 
			'Raw Materials', 'Machinery', 'Textiles'
		]
		// Use train ID hash to assign consistent cargo
		const hash = trainId.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0)
		return cargoTypes[hash % cargoTypes.length]
	}

	// Generate train name based on train ID
	const getTrainName = (trainId: string, trainType: string): string => {
		if (trainType === 'Passenger') {
			const names = [
				'Rajdhani Express', 'Shatabdi Express', 'Duronto Express', 
				'Garib Rath', 'Jan Shatabdi', 'Intercity Express',
				'Superfast Express', 'Mail Express', 'Passenger Special', 'Express'
			]
			const hash = trainId.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0)
			return names[hash % names.length]
		} else {
			const names = [
				'Goods Express', 'Freight Special', 'Container Express',
				'Coal Special', 'Iron Ore Express', 'Cement Express'
			]
			const hash = trainId.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0)
			return names[hash % names.length]
		}
	}

	// Format time from minutes to HH:MM:SS
	const formatTime = (minutes: number): string => {
		const hours = Math.floor(minutes / 60)
		const mins = Math.floor(minutes % 60)
		const secs = Math.floor((minutes % 1) * 60)
		return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
	}

	const trainMarkers = useMemo(() => {
		return trains
			.filter((cfg) => {
				if (cfg.trainType === 'Passenger' && !showPassenger) return false
				if (cfg.trainType === 'Freight' && !showFreight) return false
				return true
			})
			.map((cfg) => {
				const runtime = snapshot.trains[cfg.trainId]
				if (!runtime) return null
				const pos = interpolatePosition(runtime.distanceKm, stations)
				
				// Calculate average speed
				let avgSpeed = 0
				if (runtime.speedSamples && runtime.speedSamples.length > 0) {
					const activeSpeeds = runtime.speedSamples.filter(s => s > 0)
					if (activeSpeeds.length > 0) {
						avgSpeed = activeSpeeds.reduce((a, b) => a + b, 0) / activeSpeeds.length
					} else {
						avgSpeed = runtime.currentSpeedKmph
					}
				} else {
					avgSpeed = runtime.currentSpeedKmph
				}
				
				// Calculate distance traveled
				let distanceTraveled = 0
				if (runtime.history.length >= 2) {
					for (let i = 1; i < runtime.history.length; i++) {
						distanceTraveled += Math.abs(runtime.history[i].distanceKm - runtime.history[i - 1].distanceKm)
					}
				} else {
					distanceTraveled = runtime.distanceKm
				}
				
				// Get current/next station
				const currentStation = stations.find(s => 
					Math.abs(s.distanceKm - runtime.distanceKm) < 5
				)
				const nextStationIndex = cfg.stations.findIndex(s => {
					const st = stations.find(st => st.code === s.stationCode)
					return st && st.distanceKm > runtime.distanceKm
				})
				const nextStation = nextStationIndex >= 0 
					? stations.find(s => s.code === cfg.stations[nextStationIndex].stationCode)
					: null
				
				// Get origin and destination stations
				const originStation = stations.find(s => s.code === cfg.stations[0].stationCode)
				const destStation = stations.find(s => s.code === cfg.stations[cfg.stations.length - 1].stationCode)
				
				// Calculate current section (segment index)
				const currentSection = runtime.segmentIndex + 1
				const totalSections = cfg.stations.length - 1
				const sectionProgress = totalSections > 0 ? (currentSection / totalSections) * 100 : 0
				
				// Get scheduled and actual times for current position
				const currentStationSchedule = cfg.stations[runtime.segmentIndex]
				const scheduledTime = currentStationSchedule ? currentStationSchedule.scheduledTimeMin : 0
				const actualTime = currentStationSchedule && runtime.actualTimes[currentStationSchedule.stationCode]
					? runtime.actualTimes[currentStationSchedule.stationCode]
					: snapshot.simTimeMin
				
				// Calculate ETA to next station
				let eta = 0
				if (nextStation && runtime.currentSpeedKmph > 0) {
					const remainingDistance = nextStation.distanceKm - runtime.distanceKm
					const timeToNext = (remainingDistance / runtime.currentSpeedKmph) * 60 // in minutes
					eta = snapshot.simTimeMin + timeToNext
				} else if (nextStationIndex >= 0) {
					const nextStationSchedule = cfg.stations[nextStationIndex]
					eta = nextStationSchedule ? nextStationSchedule.scheduledTimeMin : 0
				}
				
				return {
					...pos,
					cfg,
					runtime,
					delay: runtime.delayMin,
					status: runtime.status,
					avgSpeed,
					distanceTraveled,
					currentStation,
					nextStation,
					freightCargo: cfg.trainType === 'Freight' ? getFreightCargo(cfg.trainId) : null,
					trainName: getTrainName(cfg.trainId, cfg.trainType),
					originStation,
					destStation,
					currentSection,
					totalSections,
					sectionProgress,
					scheduledTime,
					actualTime,
					eta,
				}
			})
			.filter(Boolean) as {
			lat: number
			lon: number
			cfg: TrainConfig
			runtime: TrainRuntime
			delay: number
			status: string
			avgSpeed: number
			distanceTraveled: number
			currentStation: Station | undefined
			nextStation: Station | undefined
			freightCargo: string | null
			trainName: string
			originStation: Station | undefined
			destStation: Station | undefined
			currentSection: number
			totalSections: number
			sectionProgress: number
			scheduledTime: number
			actualTime: number
			eta: number
		}[]
	}, [trains, snapshot, stations, showPassenger, showFreight])

	const polyline = stations
		.sort((a, b) => a.distanceKm - b.distanceKm)
		.map((st) => [st.lat, st.lon]) as [number, number][]

	const disruptionPolylines = useMemo(() => {
		return (snapshot.disruptions || [])
			.map((d) => {
				const start = orderedStations.find((s) => s.code === d.startStation)
				const end = orderedStations.find((s) => s.code === d.endStation)
				if (!start || !end) return null

				const minKm = Math.min(start.distanceKm, end.distanceKm)
				const maxKm = Math.max(start.distanceKm, end.distanceKm)
				const segmentStations = orderedStations.filter((s) => s.distanceKm >= minKm && s.distanceKm <= maxKm)
				const positions = segmentStations.map((s) => [s.lat, s.lon]) as [number, number][]

				// Ensure we include exact start/end even if same km appears multiple times
				if (!positions.length || positions[0][0] !== start.lat || positions[0][1] !== start.lon) {
					positions.unshift([start.lat, start.lon])
				}
				if (positions[positions.length - 1][0] !== end.lat || positions[positions.length - 1][1] !== end.lon) {
					positions.push([end.lat, end.lon])
				}

				return {
					id: d.id,
					label: d.description,
					positions,
				}
			})
			.filter(Boolean) as { id: string; label: string; positions: [number, number][] }[]
	}, [orderedStations, snapshot.disruptions])

	const uplinePassengerColor = '#2563eb'
	const uplineFreightColor = '#7c3aed'
	const downlinePassengerColor = '#b91c1c'
	const downlineFreightColor = '#065f46'

	return (
		<div className="rounded-2xl border border-slate-200 bg-white shadow-sm p-4 h-full">
			<div className="flex items-center justify-between mb-3">
				<div className="text-lg font-semibold text-slate-800">Route Map</div>
				<div className="text-sm text-slate-600">
					Mode: {viewMode === 'inline' ? 'Inline (satellite hybrid)' : 'Outline (light)'}
				</div>
			</div>
			{/* Legend for train directions */}
			<div className="mb-3 space-y-2">
				<div className="flex flex-wrap gap-3 text-xs">
					<div className="flex items-center gap-1.5">
						<div className="w-4 h-4 rounded-full border-2 border-white shadow-sm" style={{ backgroundColor: downlinePassengerColor }} />
						<span className="text-slate-700">Downline Passenger</span>
					</div>
					<div className="flex items-center gap-1.5">
						<div className="w-4 h-4 rounded-full border-2 border-white shadow-sm" style={{ backgroundColor: uplinePassengerColor }} />
						<span className="text-slate-700">Upline Passenger</span>
					</div>
					<div className="flex items-center gap-1.5">
						<div className="w-4 h-4 rounded-full border-2 border-white shadow-sm" style={{ backgroundColor: downlineFreightColor }} />
						<span className="text-slate-700">Downline Freight</span>
					</div>
					<div className="flex items-center gap-1.5">
						<div className="w-4 h-4 rounded-full border-2 border-white shadow-sm" style={{ backgroundColor: uplineFreightColor }} />
						<span className="text-slate-700">Upline Freight</span>
					</div>
				</div>
				<div className="text-[10px] text-slate-500 italic">
					Note: In Time-Distance chart, Freight trains (both downline & upline) are shown as dashed lines
				</div>
			</div>
			<div className="overflow-hidden rounded-xl h-[400px]">
				{isDetailsOpen ? (
					<div className="flex h-full items-center justify-center bg-slate-50 text-sm text-slate-500">
						Map hidden while details window is open
					</div>
				) : (
					<MapContainer
						center={center}
						zoom={7}
						style={{ height: '100%', width: '100%' }}
						scrollWheelZoom={false}
					>
						<TileLayer
							attribution='&copy; OpenStreetMap contributors'
							url={
								viewMode === 'inline'
									? 'https://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png'
									: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'
							}
						/>
						<Polyline positions={polyline} pathOptions={{ color: '#2563eb', weight: 4 }} />
						{disruptionPolylines.map((d) => (
							<Polyline
								key={d.id}
								positions={d.positions}
								pathOptions={{ color: '#f59e0b', weight: 6, opacity: 0.7, dashArray: '8 6' }}
							>
								<LeafletTooltip sticky opacity={0.9} offset={[0, -4]}>
									<div className="text-xs font-semibold text-amber-800">{d.label}</div>
								</LeafletTooltip>
							</Polyline>
						))}
						{stations.map((st) => (
							<CircleMarker
								key={st.code}
								center={[st.lat, st.lon]}
								radius={6}
								pathOptions={{ color: '#0ea5e9', fillColor: '#e0f2fe', fillOpacity: 0.9 }}
							>
								<LeafletTooltip direction="top" offset={[0, -6]} opacity={0.9}>
									<div className="text-sm font-semibold">{st.name}</div>
									<div className="text-xs text-slate-600">
										{st.code} • {st.distanceKm} km
									</div>
								</LeafletTooltip>
							</CircleMarker>
						))}

						{trainMarkers.map((marker) => {
							const direction = getTrainDirection(marker.cfg, stations)
							const icon = createTrainIcon(marker.cfg.trainType, direction)
							const statusColor = marker.status === 'running' ? 'text-green-600' : 
								marker.status === 'halted' ? 'text-yellow-600' : 'text-gray-600'
							const delayColor = marker.delay > 10 ? 'text-red-600' : 
								marker.delay > 5 ? 'text-orange-600' : 'text-green-600'
							
							const handleTrainClick = () => {
								setSelectedTrain({
									cfg: marker.cfg,
									runtime: marker.runtime,
									direction,
									trainName: marker.trainName,
									freightCargo: marker.freightCargo,
									originStation: marker.originStation,
									destStation: marker.destStation,
									avgSpeed: marker.avgSpeed,
									distanceTraveled: marker.distanceTraveled,
									currentSection: marker.currentSection,
									totalSections: marker.totalSections,
									sectionProgress: marker.sectionProgress,
									scheduledTime: marker.scheduledTime,
									actualTime: marker.actualTime,
									eta: marker.eta,
									currentStation: marker.currentStation,
									nextStation: marker.nextStation,
								})
							}
							
							return (
								<Marker
									key={marker.cfg.trainId}
									position={[marker.lat, marker.lon]}
									icon={icon}
									eventHandlers={{
										click: handleTrainClick,
									}}
								>
								<LeafletTooltip 
									direction="top" 
									offset={[0, -10]} 
									opacity={1}
									className="custom-tooltip !bg-transparent !border-0 !p-0"
								>
									<div className="bg-white/95 backdrop-blur-sm rounded-lg shadow-2xl p-4 min-w-[300px] border border-slate-300">
											{/* Train Header with ID and Status */}
											<div className="flex items-start justify-between mb-3">
												<div className="flex-1">
													<div className="flex items-center gap-2 mb-1">
														<span className="text-base font-bold text-slate-900">{marker.cfg.trainId}</span>
														{marker.delay > 10 && (
															<span className="px-2 py-0.5 text-[10px] font-semibold bg-red-100 text-red-700 rounded-full">
																CRITICAL
															</span>
														)}
													</div>
													<div className="text-sm font-semibold text-slate-800">{marker.trainName}</div>
													<div className="flex items-center gap-2 mt-1">
														<span className="w-2 h-2 rounded-full bg-blue-500"></span>
														<span className="text-xs text-slate-600">{marker.cfg.trainType}</span>
													</div>
												</div>
											</div>
											
											{/* On Time Status Banner */}
											<div className={`mb-3 px-2 py-1.5 rounded text-xs font-semibold text-center ${
												marker.delay === 0 
													? 'bg-green-100 text-green-700' 
													: marker.delay <= 5 
													? 'bg-yellow-100 text-yellow-700'
													: 'bg-red-100 text-red-700'
											}`}>
												{marker.delay === 0 ? '✓ On Time' : marker.delay <= 5 ? `⚠ ${marker.delay.toFixed(1)} min delay` : `⚠ ${marker.delay.toFixed(1)} min delay`}
											</div>
											
											{/* Route Information */}
										<div className="mb-3 pb-3 border-b border-slate-200">
											<div className="grid grid-cols-2 gap-2 text-xs">
												<div>
													<div className="text-[10px] text-slate-500 uppercase mb-0.5">FROM</div>
													<div className="font-semibold text-slate-900">
														{marker.originStation?.name || 'N/A'}
													</div>
													<div className="text-[10px] text-slate-600">
														{marker.originStation?.code || ''}
													</div>
												</div>
												<div className="text-right">
													<div className="text-[10px] text-slate-500 uppercase mb-0.5">TO</div>
													<div className="font-semibold text-slate-900">
														{marker.destStation?.name || 'N/A'}
													</div>
													<div className="text-[10px] text-slate-600">
														{marker.destStation?.code || ''}
													</div>
												</div>
											</div>
										</div>
										
										{/* Section Progress */}
										<div className="mb-3 pb-3 border-b border-slate-200">
											<div className="text-[10px] text-slate-500 uppercase mb-1.5">SECTION PROGRESS</div>
											<div className="w-full bg-slate-200 rounded-full h-2 mb-1.5">
												<div 
													className="bg-blue-600 h-2 rounded-full transition-all"
													style={{ width: `${marker.sectionProgress}%` }}
												></div>
											</div>
											<div className="flex items-center gap-1 text-xs text-slate-700">
												<span>📍</span>
												<span>Section {marker.currentSection} of {marker.totalSections}</span>
											</div>
										</div>
										
										{/* Time and Speed Metrics */}
										<div className="mb-3 pb-3 border-b border-slate-200 space-y-2">
											<div className="grid grid-cols-2 gap-3 text-xs">
												<div>
													<div className="flex items-center gap-1 mb-0.5">
														<span>🕐</span>
														<span className="text-[10px] text-slate-500 uppercase">SCHEDULED</span>
													</div>
													<div className="font-semibold text-slate-900">
														{formatTime(marker.scheduledTime)}
													</div>
												</div>
												<div>
													<div className="flex items-center gap-1 mb-0.5">
														<span>🕐</span>
														<span className="text-[10px] text-slate-500 uppercase">ACTUAL</span>
													</div>
													<div className="font-semibold text-slate-900">
														{formatTime(marker.actualTime)}
													</div>
												</div>
											</div>
											
											<div className="grid grid-cols-2 gap-3 text-xs">
												<div>
													<div className="flex items-center gap-1 mb-0.5">
														<span>⚡</span>
														<span className="text-[10px] text-slate-500 uppercase">SPEED</span>
													</div>
													<div className="font-semibold text-blue-600">
														{marker.runtime.currentSpeedKmph.toFixed(0)} km/h
													</div>
												</div>
												<div>
													<div className="flex items-center gap-1 mb-0.5">
														<span>🔗</span>
														<span className="text-[10px] text-slate-500 uppercase">ETA</span>
													</div>
													<div className="font-semibold text-indigo-600">
														{marker.eta > 0 ? formatTime(marker.eta) : 'N/A'}
													</div>
												</div>
											</div>
										</div>
										
										{/* Next Station */}
										{marker.nextStation && (
											<div className="mb-3 pb-3 border-b border-slate-200">
												<div className="text-[10px] text-slate-500 uppercase mb-1.5">NEXT STATION</div>
												<div className="flex items-center gap-2">
													<span>📍</span>
													<span className="text-sm font-semibold text-slate-900">
														{marker.nextStation.name}
													</span>
													<span className="text-xs text-slate-600">
														({marker.nextStation.code})
													</span>
												</div>
											</div>
										)}
										
										{/* Additional Info */}
										<div className="space-y-1.5 text-xs">
											<div className="flex items-center justify-between">
												<span className="text-slate-600">Status:</span>
												<span className={`font-semibold ${statusColor} capitalize`}>
													{marker.status === 'running' ? '▶ Running' : marker.status === 'halted' ? '⏸ Halted' : '✓ Completed'}
												</span>
											</div>
											
											<div className="flex items-center justify-between">
												<span className="text-slate-600">Avg Speed:</span>
												<span className="font-semibold text-indigo-600">
													{marker.avgSpeed.toFixed(0)} km/h
												</span>
											</div>
											
											<div className="flex items-center justify-between">
												<span className="text-slate-600">Distance:</span>
												<span className="font-semibold text-slate-800">
													{marker.runtime.distanceKm.toFixed(1)} km
												</span>
											</div>
											
											{/* Freight Cargo Information */}
											{marker.cfg.trainType === 'Freight' && marker.freightCargo && (
												<div className="pt-1.5 mt-1.5 border-t border-slate-200">
													<div className="flex items-center justify-between">
														<span className="text-slate-600">Cargo:</span>
														<span className="font-semibold text-purple-600">
															🚚 {marker.freightCargo}
														</span>
													</div>
												</div>
											)}
										</div>
									</div>
								</LeafletTooltip>
							</Marker>
						)
					})}
				</MapContainer>
				)}
			</div>
			
			{/* Train Details Modal */}
			{selectedTrain && (
				<div 
					className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
					onClick={() => setSelectedTrain(null)}
				>
					<div 
						className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto"
						onClick={(e) => e.stopPropagation()}
					>
						<TrainDetailsModal 
							train={selectedTrain} 
							snapshot={snapshot}
							stations={stations}
							onClose={() => setSelectedTrain(null)}
						/>
					</div>
				</div>
			)}
		</div>
	)
}

// Train Details Modal Component
const TrainDetailsModal: React.FC<{
	train: TrainDetails
	snapshot: SimulationSnapshot
	stations: Station[]
	onClose: () => void
}> = ({ train, snapshot, stations, onClose }) => {
	// Calculate throughput (distance covered per hour)
	const elapsedTime = snapshot.simTimeMin > 0 ? snapshot.simTimeMin : 1
	const throughput = (train.distanceTraveled / elapsedTime) * 60 // km per hour
	
	// Calculate accuracy (schedule adherence percentage)
	const totalStations = train.cfg.stations.length
	let onTimeStations = 0
	train.cfg.stations.forEach((stationSchedule) => {
		const actualTime = train.runtime.actualTimes[stationSchedule.stationCode]
		if (actualTime !== undefined) {
			const delay = actualTime - stationSchedule.scheduledTimeMin
			if (delay <= 5) onTimeStations++
		}
	})
	const accuracy = totalStations > 0 ? (onTimeStations / totalStations) * 100 : 100
	
	// Get route stations list
	const routeStations = train.cfg.stations.map(s => {
		const station = stations.find(st => st.code === s.stationCode)
		return {
			code: s.stationCode,
			name: station?.name || s.stationCode,
			scheduledTime: s.scheduledTimeMin,
			actualTime: train.runtime.actualTimes[s.stationCode],
		}
	})
	
	const formatTime = (minutes: number): string => {
		const hours = Math.floor(minutes / 60)
		const mins = Math.floor(minutes % 60)
		const secs = Math.floor((minutes % 1) * 60)
		return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
	}
	
	return (
		<div className="p-6">
			{/* Header */}
			<div className="flex items-start justify-between mb-6">
				<div className="flex-1">
					<div className="flex items-center gap-3 mb-2">
						<h2 className="text-2xl font-bold text-slate-900">{train.cfg.trainId}</h2>
						{train.runtime.delayMin > 10 && (
							<span className="px-3 py-1 text-xs font-semibold bg-red-100 text-red-700 rounded-full">
								CRITICAL
							</span>
						)}
					</div>
					<h3 className="text-xl font-semibold text-slate-800 mb-1">{train.trainName}</h3>
					<div className="flex items-center gap-2">
						<span className="w-2 h-2 rounded-full bg-blue-500"></span>
						<span className="text-sm text-slate-600">{train.cfg.trainType}</span>
						<span className="text-slate-400">•</span>
						<span className="text-sm text-slate-600">
							{train.direction === 'upline' ? 'Upline' : 'Downline'}
						</span>
					</div>
				</div>
				<button
					onClick={onClose}
					className="text-slate-400 hover:text-slate-600 text-2xl font-bold w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-100"
				>
					×
				</button>
			</div>
			
			{/* Key Metrics Grid */}
			<div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
				<div className="bg-slate-50 rounded-lg p-4 border border-slate-200">
					<div className="text-xs text-slate-500 uppercase mb-1">Delay</div>
					<div className={`text-2xl font-bold ${
						train.runtime.delayMin > 10 ? 'text-red-600' : 
						train.runtime.delayMin > 5 ? 'text-orange-600' : 'text-green-600'
					}`}>
						{train.runtime.delayMin > 0 ? `${train.runtime.delayMin.toFixed(1)} min` : 'On Time'}
					</div>
				</div>
				
				<div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
					<div className="text-xs text-blue-600 uppercase mb-1">Throughput</div>
					<div className="text-2xl font-bold text-blue-700">
						{throughput.toFixed(1)} km/h
					</div>
				</div>
				
				<div className="bg-green-50 rounded-lg p-4 border border-green-200">
					<div className="text-xs text-green-600 uppercase mb-1">Accuracy</div>
					<div className="text-2xl font-bold text-green-700">
						{accuracy.toFixed(1)}%
					</div>
				</div>
				
				<div className="bg-purple-50 rounded-lg p-4 border border-purple-200">
					<div className="text-xs text-purple-600 uppercase mb-1">Avg Speed</div>
					<div className="text-2xl font-bold text-purple-700">
						{train.avgSpeed.toFixed(0)} km/h
					</div>
				</div>
			</div>
			
			{/* Route Information */}
			<div className="mb-6">
				<h4 className="text-sm font-semibold text-slate-700 uppercase mb-3">Train Route</h4>
				<div className="bg-slate-50 rounded-lg p-4 border border-slate-200">
					<div className="flex items-center justify-between mb-4">
						<div className="text-center flex-1">
							<div className="text-xs text-slate-500 uppercase mb-1">From</div>
							<div className="font-semibold text-slate-900">{train.originStation?.name || 'N/A'}</div>
							<div className="text-xs text-slate-600">{train.originStation?.code || ''}</div>
						</div>
						<div className="text-2xl text-slate-400 mx-4">→</div>
						<div className="text-center flex-1">
							<div className="text-xs text-slate-500 uppercase mb-1">To</div>
							<div className="font-semibold text-slate-900">{train.destStation?.name || 'N/A'}</div>
							<div className="text-xs text-slate-600">{train.destStation?.code || ''}</div>
						</div>
					</div>
					
					{/* Route Stations List */}
					<div className="space-y-2 mt-4 pt-4 border-t border-slate-200">
						<div className="text-xs text-slate-500 uppercase mb-2">Route Stations</div>
						<div className="space-y-1.5 max-h-48 overflow-y-auto">
							{routeStations.map((station, idx) => {
								const delay = station.actualTime !== undefined 
									? station.actualTime - station.scheduledTime
									: null
								return (
									<div key={idx} className="flex items-center justify-between text-xs py-1 px-2 hover:bg-white rounded">
										<div className="flex items-center gap-2">
											<span className="text-slate-400">{idx + 1}.</span>
											<span className="font-medium text-slate-700">{station.name}</span>
											<span className="text-slate-500">({station.code})</span>
										</div>
										<div className="flex items-center gap-3">
											<span className="text-slate-500">
												Sch: {formatTime(station.scheduledTime)}
											</span>
											{station.actualTime !== undefined && (
												<span className={`font-medium ${
													delay && delay > 5 ? 'text-red-600' : 'text-green-600'
												}`}>
													Act: {formatTime(station.actualTime)}
													{delay !== null && delay > 0 && ` (+${delay.toFixed(0)}m)`}
												</span>
											)}
										</div>
									</div>
								)
							})}
						</div>
					</div>
				</div>
			</div>
			
			{/* Freight Cargo Information */}
			{train.cfg.trainType === 'Freight' && train.freightCargo && (
				<div className="mb-6">
					<h4 className="text-sm font-semibold text-slate-700 uppercase mb-3">Freight Information</h4>
					<div className="bg-purple-50 rounded-lg p-4 border border-purple-200">
						<div className="flex items-center gap-3">
							<span className="text-3xl">🚚</span>
							<div>
								<div className="text-xs text-purple-600 uppercase mb-1">Cargo Type</div>
								<div className="text-lg font-bold text-purple-900">{train.freightCargo}</div>
							</div>
						</div>
					</div>
				</div>
			)}
			
			{/* Additional Details */}
			<div className="grid grid-cols-2 gap-4">
				<div className="bg-slate-50 rounded-lg p-4 border border-slate-200">
					<div className="text-xs text-slate-500 uppercase mb-2">Status</div>
					<div className={`font-semibold capitalize ${
						train.runtime.status === 'running' ? 'text-green-600' : 
						train.runtime.status === 'halted' ? 'text-yellow-600' : 'text-gray-600'
					}`}>
						{train.runtime.status === 'running' ? '▶ Running' : train.runtime.status === 'halted' ? '⏸ Halted' : '✓ Completed'}
					</div>
				</div>
				
				<div className="bg-slate-50 rounded-lg p-4 border border-slate-200">
					<div className="text-xs text-slate-500 uppercase mb-2">Distance</div>
					<div className="font-semibold text-slate-900">
						{train.runtime.distanceKm.toFixed(1)} km
					</div>
				</div>
				
				<div className="bg-slate-50 rounded-lg p-4 border border-slate-200">
					<div className="text-xs text-slate-500 uppercase mb-2">Current Section</div>
					<div className="font-semibold text-slate-900">
						Section {train.currentSection} of {train.totalSections}
					</div>
				</div>
				
				<div className="bg-slate-50 rounded-lg p-4 border border-slate-200">
					<div className="text-xs text-slate-500 uppercase mb-2">Current Speed</div>
					<div className="font-semibold text-blue-600">
						{train.runtime.currentSpeedKmph.toFixed(0)} km/h
					</div>
				</div>
			</div>
		</div>
	)
}

export default TrainMap


