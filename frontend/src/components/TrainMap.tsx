'use client'

import React, { useMemo } from 'react'
import { MapContainer, Polyline, TileLayer, CircleMarker, Tooltip as LeafletTooltip, Marker } from 'react-leaflet'
import L from 'leaflet'
import { SimulationSnapshot, Station, TrainConfig } from '../simulationEngine'
import 'leaflet/dist/leaflet.css'

type Props = {
	stations: Station[]
	trains: TrainConfig[]
	snapshot: SimulationSnapshot
	showPassenger: boolean
	showFreight: boolean
	viewMode: 'inline' | 'outline'
}

const passengerIcon = L.divIcon({
	className: 'train-icon passenger',
	html: '🚆',
	iconSize: [24, 24],
})

const freightIcon = L.divIcon({
	className: 'train-icon freight',
	html: '🚂',
	iconSize: [24, 24],
})

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
	const center = useMemo(() => {
		const avgLat = stations.reduce((a, b) => a + b.lat, 0) / stations.length
		const avgLon = stations.reduce((a, b) => a + b.lon, 0) / stations.length
		return [avgLat, avgLon] as [number, number]
	}, [stations])

	const orderedStations = useMemo(() => [...stations].sort((a, b) => a.distanceKm - b.distanceKm), [stations])

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
				return {
					...pos,
					cfg,
					delay: runtime.delayMin,
					status: runtime.status,
				}
			})
			.filter(Boolean) as {
			lat: number
			lon: number
			cfg: TrainConfig
			delay: number
			status: string
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

	return (
		<div className="rounded-2xl border border-slate-200 bg-white shadow-sm p-4 h-full">
			<div className="flex items-center justify-between mb-3">
				<div className="text-lg font-semibold text-slate-800">Route Map</div>
				<div className="text-sm text-slate-600">
					Mode: {viewMode === 'inline' ? 'Inline (satellite hybrid)' : 'Outline (light)'}
				</div>
			</div>
			<div className="overflow-hidden rounded-xl h-[400px]">
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

					{trainMarkers.map((marker) => (
						<Marker
							key={marker.cfg.trainId}
							position={[marker.lat, marker.lon]}
							icon={marker.cfg.trainType === 'Passenger' ? passengerIcon : freightIcon}
						>
							<LeafletTooltip direction="top" offset={[0, -10]} opacity={0.95}>
								<div className="text-sm font-semibold">{marker.cfg.trainId}</div>
								<div className="text-xs text-slate-600">{marker.cfg.trainType}</div>
								<div className="text-xs text-amber-600">
									Delay: {marker.delay.toFixed(1)} min • {marker.status}
								</div>
							</LeafletTooltip>
						</Marker>
					))}
				</MapContainer>
			</div>
		</div>
	)
}

export default TrainMap


