import React, { useEffect, useMemo, useRef, useState } from 'react';
import { MapContainer, TileLayer, Polyline, CircleMarker, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { fetchDigitalTwinMap, fetchDigitalTwinPositions, fetchDigitalTwinDisruptions, type DigitalTwinMapData, type DigitalTwinPosition, type DigitalTwinDisruption, type ComprehensiveKPIs } from '../lib/api';
import KPIPanel from './KPIPanel';
import WhatIfScenarioPanel from './WhatIfScenarioPanel';

// Fix for default marker icons in Leaflet with Vite
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
	iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
	iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
	shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

interface RailwaySchematicMapProps {
	division: string;
	selectedTrain?: string | null;
	onTrainClick?: (trainNo: string) => void;
}

interface TrainPosition extends DigitalTwinPosition {
	lat?: number;
	lon?: number;
	rerouted?: boolean;
	alternativeRoute?: string[];
	originalSection?: string;
}

const getTrainTypeColor = (trainType?: string, status?: string): string => {
	if (status === 'REROUTED') return '#8b5cf6'; // Purple for rerouted
	if (status === 'QUEUED') return '#f97316'; // Orange for queued (waiting)
	if (status === 'RESTRICTED') return '#f59e0b'; // Amber for restricted speed (signal failure)
	if (status === 'BLOCKED') return '#f59e0b'; // Amber for blocked
	if (status === 'STOPPED') return '#9ca3af'; // Grey for stopped
	if (status === 'DELAYED') return '#ef4444'; // Red for delayed
	
	const typeUpper = trainType?.toUpperCase() || '';
	
	// Express trains - Red
	if (typeUpper.includes('EXPRESS') || typeUpper.includes('SUPERFAST') || 
	    typeUpper.includes('SHATABDI') || typeUpper.includes('RAJDHANI')) {
		return '#ef4444'; // Red
	}
	
	// Passenger trains - Green
	if (typeUpper.includes('PASSENGER') || typeUpper.includes('LOCAL') || 
	    typeUpper.includes('SUBURBAN')) {
		return '#10b981'; // Green
	}
	
	// Goods/Freight trains - Blue
	if (typeUpper.includes('GOODS') || typeUpper.includes('FREIGHT') || 
	    typeUpper.includes('CARGO')) {
		return '#3b82f6'; // Blue
	}
	
	// Default to grey for unknown
	return '#9ca3af';
};

const getDisruptionColor = (type: string, severity: string): string => {
	const typeLower = type.toLowerCase();
	
	if (typeLower.includes('signal')) {
		return severity === 'high' ? '#f59e0b' : '#fbbf24'; // Amber/Orange for signal failures
	}
	if (typeLower.includes('track') || typeLower.includes('block')) {
		return severity === 'high' ? '#ef4444' : '#f87171'; // Red for track blocks
	}
	if (typeLower.includes('weather')) {
		return severity === 'high' ? '#3b82f6' : '#60a5fa'; // Blue for weather
	}
	
	// Default based on severity
	return severity === 'high' ? '#ef4444' : severity === 'medium' ? '#f59e0b' : '#84cc16';
};

const getDisruptionOpacity = (severity: string): number => {
	return severity === 'high' ? 0.7 : severity === 'medium' ? 0.5 : 0.3;
};

// Custom component to fit map bounds
function FitBounds({ stations }: { stations: Array<{ lat: number; lon: number }> }) {
	const map = useMap();
	
	useEffect(() => {
		if (stations.length > 0) {
			const bounds = L.latLngBounds(stations.map(s => [s.lat, s.lon] as [number, number]));
			map.fitBounds(bounds, { padding: [50, 50] });
		}
	}, [map, stations]);
	
	return null;
}

export default function RailwaySchematicMap({ division, selectedTrain, onTrainClick }: RailwaySchematicMapProps) {
	const [mapData, setMapData] = useState<DigitalTwinMapData | null>(null);
	const [trainPositions, setTrainPositions] = useState<TrainPosition[]>([]);
	const [disruptions, setDisruptions] = useState<DigitalTwinDisruption[]>([]);
	const [impactMetrics, setImpactMetrics] = useState<any>(null);
	const [kpis, setKpis] = useState<ComprehensiveKPIs | null>(null);
	const [showKPIPanel, setShowKPIPanel] = useState(false);
	const [showScenarioPanel, setShowScenarioPanel] = useState(false);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [stationsMap, setStationsMap] = useState<Map<string, { lat: number; lon: number; name: string }>>(new Map());
	const [sectionsMap, setSectionsMap] = useState<Map<string, { from: { lat: number; lon: number }, to: { lat: number; lon: number } }>>(new Map());

	// Helper function to setup fallback data
	const setupFallbackData = () => {
		const fallbackData: DigitalTwinMapData = {
			division: 'ktv_psa',
			stations: [
				{ stationCode: 'KTV', stationName: 'Kottavalasa Jn (KTV)', lat: 17.89, lon: 83.19 },
				{ stationCode: 'KPL', stationName: 'Kantakapalle (KPL)', lat: 17.95, lon: 83.21 },
				{ stationCode: 'ALM', stationName: 'Alamanda (ALM)', lat: 18.01, lon: 83.27 },
				{ stationCode: 'KUK', stationName: 'Koru Konda (KUK)', lat: 18.05, lon: 83.32 },
				{ stationCode: 'VZM', stationName: 'Vizianagaram Jn (VZM)', lat: 18.11, lon: 83.4 },
				{ stationCode: 'NML', stationName: 'Nellimarla (NML)', lat: 18.19, lon: 83.46 },
				{ stationCode: 'GVI', stationName: 'Garividi (GVI)', lat: 18.27, lon: 83.53 },
				{ stationCode: 'CPP', stationName: 'Chipurupalle (CPP)', lat: 18.32, lon: 83.57 },
				{ stationCode: 'BTVA', stationName: 'Batuva (BTVA)', lat: 18.34, lon: 83.62 },
				{ stationCode: 'SGDM', stationName: 'Sigadam (SGDM)', lat: 18.36, lon: 83.68 },
				{ stationCode: 'PDU', stationName: 'Ponduru (PDU)', lat: 18.36, lon: 83.78 },
				{ stationCode: 'DUSI', stationName: 'Dusi (DUSI)', lat: 18.37, lon: 83.86 },
				{ stationCode: 'CHE', stationName: 'Srikakulam Road (CHE)', lat: 18.41, lon: 83.9 },
				{ stationCode: 'ULM', stationName: 'Urlam (ULM)', lat: 18.44, lon: 83.99 },
				{ stationCode: 'TIU', stationName: 'Tilaru (TIU)', lat: 18.47, lon: 84.07 },
				{ stationCode: 'HCM', stationName: 'Harischandrapuram (HCM)', lat: 18.48, lon: 84.12 },
				{ stationCode: 'KBM', stationName: 'Kotabommali (KBM)', lat: 18.49, lon: 84.2 },
				{ stationCode: 'DGB', stationName: 'Dandu Gopalapuram (DGB)', lat: 18.54, lon: 84.24 },
				{ stationCode: 'NWP', stationName: 'Naupada Jn (NWP)', lat: 18.58, lon: 84.28 },
				{ stationCode: 'RMZ', stationName: 'Routhpuram (RMZ)', lat: 18.62, lon: 84.34 },
				{ stationCode: 'PUN', stationName: 'Pundi (PUN)', lat: 18.67, lon: 84.37 },
				{ stationCode: 'PSA', stationName: 'Palasa (PSA)', lat: 18.76, lon: 84.42 },
			],
			sections: [
				{ section_id: 'KTV-KPL', from: 'KTV', to: 'KPL' },
				{ section_id: 'KPL-ALM', from: 'KPL', to: 'ALM' },
				{ section_id: 'ALM-KUK', from: 'ALM', to: 'KUK' },
				{ section_id: 'KUK-VZM', from: 'KUK', to: 'VZM' },
				{ section_id: 'VZM-NML', from: 'VZM', to: 'NML' },
				{ section_id: 'NML-GVI', from: 'NML', to: 'GVI' },
				{ section_id: 'GVI-CPP', from: 'GVI', to: 'CPP' },
				{ section_id: 'CPP-BTVA', from: 'CPP', to: 'BTVA' },
				{ section_id: 'BTVA-SGDM', from: 'BTVA', to: 'SGDM' },
				{ section_id: 'SGDM-PDU', from: 'SGDM', to: 'PDU' },
				{ section_id: 'PDU-DUSI', from: 'PDU', to: 'DUSI' },
				{ section_id: 'DUSI-CHE', from: 'DUSI', to: 'CHE' },
				{ section_id: 'CHE-ULM', from: 'CHE', to: 'ULM' },
				{ section_id: 'ULM-TIU', from: 'ULM', to: 'TIU' },
				{ section_id: 'TIU-HCM', from: 'TIU', to: 'HCM' },
				{ section_id: 'HCM-KBM', from: 'HCM', to: 'KBM' },
				{ section_id: 'KBM-DGB', from: 'KBM', to: 'DGB' },
				{ section_id: 'DGB-NWP', from: 'DGB', to: 'NWP' },
				{ section_id: 'NWP-RMZ', from: 'NWP', to: 'RMZ' },
				{ section_id: 'RMZ-PUN', from: 'RMZ', to: 'PUN' },
				{ section_id: 'PUN-PSA', from: 'PUN', to: 'PSA' },
			]
		};
		
		setMapData(fallbackData);
		
		const stations = new Map<string, { lat: number; lon: number; name: string }>();
		fallbackData.stations.forEach(station => {
			stations.set(station.stationCode, {
				lat: station.lat,
				lon: station.lon,
				name: station.stationName
			});
		});
		setStationsMap(stations);
		
		const sections = new Map<string, { from: { lat: number; lon: number }, to: { lat: number; lon: number } }>();
		fallbackData.sections.forEach(section => {
			const fromStation = stations.get(section.from);
			const toStation = stations.get(section.to);
			if (fromStation && toStation) {
				sections.set(section.section_id, {
					from: { lat: fromStation.lat, lon: fromStation.lon },
					to: { lat: toStation.lat, lon: toStation.lon }
				});
			}
		});
		setSectionsMap(sections);
	};

	// Load map data
	useEffect(() => {
		let mounted = true;
		let timeoutId: ReturnType<typeof setTimeout>;
		let fallbackUsed = false;
		
		const loadMapData = async () => {
			try {
				setLoading(true);
				setError(null);
				console.log(`Loading map data for division: ${division}`);
				
				// Set timeout to use fallback data after 2 seconds
				timeoutId = setTimeout(() => {
					if (mounted && !fallbackUsed) {
						console.log('API timeout, using fallback data');
						fallbackUsed = true;
						setupFallbackData();
						setLoading(false);
					}
				}, 2000);
				
				const data = await fetchDigitalTwinMap(division);
				clearTimeout(timeoutId);
				console.log('Map data loaded:', data);
				if (mounted && !fallbackUsed) { // Only process if we didn't already use fallback
					if (data && data.stations && data.stations.length > 0) {
						setMapData(data);
						
						// Build stations map
						const stations = new Map<string, { lat: number; lon: number; name: string }>();
						data.stations.forEach(station => {
							stations.set(station.stationCode, {
								lat: station.lat,
								lon: station.lon,
								name: station.stationName
							});
						});
						setStationsMap(stations);
						
						// Build sections map
						const sections = new Map<string, { from: { lat: number; lon: number }, to: { lat: number; lon: number } }>();
						if (data.sections) {
							data.sections.forEach(section => {
								const fromStation = stations.get(section.from);
								const toStation = stations.get(section.to);
								if (fromStation && toStation) {
									sections.set(section.section_id, {
										from: { lat: fromStation.lat, lon: fromStation.lon },
										to: { lat: toStation.lat, lon: toStation.lon }
									});
								}
							});
						}
						setSectionsMap(sections);
					} else {
						console.warn('No stations in map data, using fallback');
						setupFallbackData();
					}
				}
			} catch (err) {
				clearTimeout(timeoutId);
				console.error('Failed to load map data:', err);
				if (mounted) {
					// Use fallback data on error
					console.log('Using fallback map data due to API error');
					setupFallbackData();
				}
			} finally {
				if (mounted) {
					setLoading(false);
				}
			}
		};

		loadMapData();
		return () => { 
			mounted = false;
			if (timeoutId) clearTimeout(timeoutId);
		};
	}, [division]);

	// Load train positions
	useEffect(() => {
		if (!mapData) return;
		
		let mounted = true;
		let intervalId: ReturnType<typeof setInterval>;
		
		const loadTrainPositions = async () => {
			try {
				const response = await fetchDigitalTwinPositions(division);
				if (mounted && response.trains) {
					// Update impact metrics
					if (response.impact_metrics) {
						setImpactMetrics(response.impact_metrics);
					}
					// Update KPIs
					if (response.kpis) {
						setKpis(response.kpis);
					}
					
					// Calculate actual lat/lon for trains
					const positions: TrainPosition[] = response.trains.map(train => {
						const section = sectionsMap.get(train.position.sectionId);
						if (section) {
							const from = section.from;
							const to = section.to;
							const progress = train.position.progress;
							
							// Interpolate position along section
							const lat = from.lat + (to.lat - from.lat) * progress;
							const lon = from.lon + (to.lon - from.lon) * progress;
							
							return {
								...train,
								lat,
								lon,
								rerouted: (train as any).rerouted || false,
								alternativeRoute: (train as any).alternativeRoute || null,
								originalSection: (train as any).originalSection || null
							};
						}
						return train as TrainPosition;
					});
					
					setTrainPositions(positions);
				}
			} catch (err) {
				console.error('Failed to load train positions:', err);
			}
		};
		
		loadTrainPositions();
		// Update every 10 seconds
		intervalId = setInterval(loadTrainPositions, 10000);
		
		return () => {
			mounted = false;
			if (intervalId) clearInterval(intervalId);
		};
	}, [mapData, division, sectionsMap]);

	// Load disruptions
	useEffect(() => {
		if (!mapData) return;
		
		let mounted = true;
		let intervalId: ReturnType<typeof setInterval>;
		
		const loadDisruptions = async () => {
			try {
				const response = await fetchDigitalTwinDisruptions(division);
				if (mounted && response.disruptions) {
					// Filter only active disruptions
					const activeDisruptions = response.disruptions.filter(d => d.status === 'active');
					setDisruptions(activeDisruptions);
				}
			} catch (err) {
				console.error('Failed to load disruptions:', err);
			}
		};
		
		loadDisruptions();
		// Update every 5 seconds for disruptions
		intervalId = setInterval(loadDisruptions, 5000);
		
		return () => {
			mounted = false;
			if (intervalId) clearInterval(intervalId);
		};
	}, [mapData, division]);

	// WebSocket connection for real-time updates
	useEffect(() => {
		if (!division) return;

		const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
		const wsUrl = `${protocol}//${window.location.host}/ws/live?division=${division}`;
		const ws = new WebSocket(wsUrl);

		ws.onopen = () => {
			console.log('WebSocket connected for live train updates');
		};

					ws.onmessage = (event) => {
			try {
				const data = JSON.parse(event.data);
				if (data.type === 'live_update' && data.trains) {
					// Update train positions from WebSocket
					const positions: TrainPosition[] = data.trains.map((t: any) => {
						const section = sectionsMap.get(t.currentSection || t.sectionId);
						if (section) {
							const from = section.from;
							const to = section.to;
							const progress = Math.max(0, Math.min(1, t.progress || 0.5));
							
							const lat = from.lat + (to.lat - from.lat) * progress;
							const lon = from.lon + (to.lon - from.lon) * progress;
							
							return {
								trainNo: t.trainNo,
								trainName: t.trainName,
								trainType: t.trainType,
								status: t.status || 'RUNNING',
								position: {
									sectionId: t.currentSection || t.sectionId,
									progress
								},
								lat,
								lon,
								rerouted: t.rerouted || false,
								alternativeRoute: t.alternativeRoute || null,
								originalSection: t.originalSection || null
							};
						}
						return null;
					}).filter(Boolean) as TrainPosition[];
					
					setTrainPositions(positions);
				}
				
				// Update disruptions if provided in WebSocket message
				if (data.type === 'live_update' && data.disruptions) {
					const activeDisruptions = data.disruptions.filter((d: DigitalTwinDisruption) => d.status === 'active');
					setDisruptions(activeDisruptions);
				}
			} catch (err) {
				console.error('Failed to parse WebSocket message:', err);
			}
		};

		ws.onerror = (error) => {
			console.error('WebSocket error:', error);
		};

		ws.onclose = () => {
			console.log('WebSocket closed');
		};

		return () => {
			ws.close();
		};
	}, [division, sectionsMap]);

	if (loading) {
		return (
			<div className="flex items-center justify-center h-full" style={{ backgroundColor: '#bfdbfe', minHeight: '600px' }}>
				<div className="text-gray-700 text-lg">Loading KTV–PSA map...</div>
			</div>
		);
	}

	if (error) {
		return (
			<div className="flex items-center justify-center h-full" style={{ backgroundColor: '#bfdbfe', minHeight: '600px' }}>
				<div className="text-red-600 text-lg">Error: {error}</div>
			</div>
		);
	}

	if (!mapData || mapData.stations.length === 0) {
		return (
			<div className="flex items-center justify-center h-full" style={{ backgroundColor: '#bfdbfe', minHeight: '600px' }}>
				<div className="text-gray-700 text-lg">No map data available for {division}</div>
			</div>
		);
	}

	const stations = Array.from(stationsMap.values());
	const mapCenter = useMemo<[number, number]>(() => {
		if (stations.length > 0) {
			const avgLat = stations.reduce((sum, s) => sum + s.lat, 0) / stations.length;
			const avgLon = stations.reduce((sum, s) => sum + s.lon, 0) / stations.length;
			return [avgLat, avgLon];
		}
		return [22.9, 77.55];
	}, [stations]);

	return (
		<div className="w-full h-full relative" style={{ backgroundColor: '#bfdbfe', minHeight: '600px', height: '100%' }}>
			{/* Section title */}
			<div className="absolute top-4 left-4 z-[1000] bg-blue-600 text-white px-4 py-2 rounded-lg shadow-lg">
				<div className="font-bold text-lg">KTV → PSA Section</div>
				<div className="text-xs opacity-90">Live twin map (WCR)</div>
			</div>
			
			{/* Control Buttons */}
			<div className="absolute bottom-4 left-4 z-[1000] flex flex-col gap-2">
				<button
					onClick={() => setShowKPIPanel(!showKPIPanel)}
					className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg shadow-lg font-semibold text-sm flex items-center gap-2"
				>
					📊 {showKPIPanel ? 'Hide' : 'Show'} KPIs
				</button>
				<button
					onClick={() => setShowScenarioPanel(!showScenarioPanel)}
					className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg shadow-lg font-semibold text-sm flex items-center gap-2"
				>
					🎯 {showScenarioPanel ? 'Hide' : 'Show'} Scenarios
				</button>
			</div>
			
			{/* KPI Panel */}
			{showKPIPanel && kpis && (
				<div className="absolute bottom-20 left-4 z-[1000] w-96">
					<KPIPanel kpis={kpis} />
				</div>
			)}
			
			{/* What-If Scenario Panel */}
			{showScenarioPanel && (
				<div className="absolute bottom-20 left-4 z-[1000] w-[500px] max-h-[700px]">
					<WhatIfScenarioPanel
						division={division}
						onScenarioApplied={(scenario) => {
							console.log('Scenario applied:', scenario);
							// Refresh disruptions and positions
							setTimeout(() => {
								window.location.reload();
							}, 1000);
						}}
					/>
				</div>
			)}
			
			{/* Impact Metrics Panel */}
			{impactMetrics && impactMetrics.active_disruptions > 0 && (
				<div className="absolute top-4 right-4 z-[1000] bg-white px-4 py-3 rounded-lg shadow-lg border border-gray-200 max-w-xs">
					<div className="font-bold text-sm text-red-700 mb-2">📊 System Impact</div>
					<div className="space-y-2 text-xs">
						<div className="flex justify-between">
							<span className="text-gray-600">Affected Trains:</span>
							<span className="font-semibold">{impactMetrics.affected_trains}/{impactMetrics.total_trains}</span>
						</div>
						<div className="flex justify-between">
							<span className="text-gray-600">In Queue:</span>
							<span className="font-semibold text-orange-600">{impactMetrics.trains_in_queue}</span>
						</div>
						<div className="flex justify-between">
							<span className="text-gray-600">Rerouted:</span>
							<span className="font-semibold text-purple-600">{impactMetrics.trains_rerouted}</span>
						</div>
						<div className="border-t pt-2 mt-2">
							<div className="flex justify-between mb-1">
								<span className="text-gray-600">Passenger Delay:</span>
								<span className="font-semibold text-red-600">{impactMetrics.avg_passenger_delay_minutes?.toFixed(1)} min</span>
							</div>
							<div className="flex justify-between">
								<span className="text-gray-600">Freight Delay:</span>
								<span className="font-semibold text-amber-600">{impactMetrics.avg_freight_delay_minutes?.toFixed(1)} min</span>
							</div>
						</div>
						<div className="border-t pt-2 mt-2">
							<div className="flex justify-between">
								<span className="text-gray-600">Throughput Impact:</span>
								<span className="font-semibold text-red-600">-{impactMetrics.throughput_impact_percent}%</span>
							</div>
						</div>
					</div>
				</div>
			)}
			
			{/* Disruption legend */}
			{disruptions.length > 0 && (
				<div className={`absolute ${impactMetrics && impactMetrics.active_disruptions > 0 ? 'top-48' : 'top-4'} right-4 z-[1000] bg-white px-4 py-3 rounded-lg shadow-lg border border-gray-200`}>
					<div className="font-bold text-sm text-gray-800 mb-2">⚠️ Active Disruptions</div>
					<div className="space-y-1 text-xs">
						{disruptions.map((d) => (
							<div key={d.id} className="flex items-center gap-2">
								<div 
									className="w-3 h-3 rounded-full animate-pulse"
									style={{ backgroundColor: getDisruptionColor(d.type, d.severity) }}
								></div>
								<span className="text-gray-700">
									{d.startStation && d.endStation ? `${d.startStation}-${d.endStation}` : d.sectionId || d.type}
								</span>
							</div>
						))}
					</div>
				</div>
			)}
			
			<MapContainer
				key={`map-${division}-${mapData?.stations.length || 0}`}
				center={mapCenter}
				zoom={9}
				style={{ height: '100%', width: '100%', minHeight: '600px', backgroundColor: '#bfdbfe' }}
				zoomControl={true}
				attributionControl={false}
				whenReady={() => console.log('Map is ready')}
			>
				{/* Custom tile layer with light blue water background - styled like Indian Railway Network Map */}
				<TileLayer
					url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
					attribution=""
					opacity={0.7}
				/>
				
				{/* Fit bounds to stations */}
				<FitBounds stations={stations} />
				
				{/* Draw railway sections (tracks) - styled like Indian Railway Network Map */}
				{Array.from(sectionsMap.entries()).map(([sectionId, section]) => {
					// Check if this section has an active disruption
					const sectionDisruption = disruptions.find(d => {
						// Direct section ID match
						if (d.sectionId === sectionId) return true;
						
						// Match by station codes
						if (d.startStation && d.endStation && mapData) {
							const sectionData = mapData.sections.find(s => s.section_id === sectionId);
							if (sectionData) {
								const matchesForward = sectionData.from === d.startStation && sectionData.to === d.endStation;
								const matchesReverse = sectionData.from === d.endStation && sectionData.to === d.startStation;
								return matchesForward || matchesReverse;
							}
						}
						return false;
					});
					
					const hasDisruption = !!sectionDisruption;
					const baseColor = '#dc2626'; // Red for trunk routes (electrified)
					const disruptionColor = sectionDisruption 
						? getDisruptionColor(sectionDisruption.type, sectionDisruption.severity)
						: baseColor;
					
					return (
						<Polyline
							key={sectionId}
							positions={[
								[section.from.lat, section.from.lon],
								[section.to.lat, section.to.lon]
							]}
							pathOptions={{
								color: disruptionColor,
								weight: hasDisruption ? 8 : 5,
								opacity: hasDisruption 
									? getDisruptionOpacity(sectionDisruption.severity)
									: 0.9,
								lineCap: 'round',
								lineJoin: 'round'
							}}
						>
							{hasDisruption && sectionDisruption && (
								<Popup>
									<div className="font-bold text-base text-red-700">⚠️ Disruption Active</div>
									<div className="text-sm font-semibold mt-1">{sectionDisruption.description}</div>
									
									{/* Operational Effects - Freight & Passenger */}
									{sectionDisruption.operational_effects && (
										<div className="mt-2 space-y-2">
											{sectionDisruption.operational_effects.freight && (
												<div className="p-2 bg-blue-50 border border-blue-200 rounded">
													<div className="text-xs font-semibold text-blue-800 mb-1">🚚 Freight Effects:</div>
													{sectionDisruption.operational_effects.freight.action && (
														<div className="text-xs text-blue-700 mb-1">
															<span className="font-semibold">Action:</span> {sectionDisruption.operational_effects.freight.action.replace(/_/g, ' ')}
														</div>
													)}
													{sectionDisruption.operational_effects.freight.speed_kmph !== undefined && (
														<div className="text-xs text-blue-700 mb-1">
															<span className="font-semibold">Speed:</span> {sectionDisruption.operational_effects.freight.speed_kmph} km/h
														</div>
													)}
													{sectionDisruption.operational_effects.freight.delay_minutes && (
														<div className="text-xs text-blue-700">
															<span className="font-semibold">Delay:</span> ~{sectionDisruption.operational_effects.freight.delay_minutes} min
														</div>
													)}
												</div>
											)}
											{sectionDisruption.operational_effects.passenger && (
												<div className="p-2 bg-green-50 border border-green-200 rounded">
													<div className="text-xs font-semibold text-green-800 mb-1">🚆 Passenger Effects:</div>
													{sectionDisruption.operational_effects.passenger.action && (
														<div className="text-xs text-green-700 mb-1">
															<span className="font-semibold">Action:</span> {sectionDisruption.operational_effects.passenger.action.replace(/_/g, ' ')}
														</div>
													)}
													{sectionDisruption.operational_effects.passenger.speed_kmph !== undefined && (
														<div className="text-xs text-green-700 mb-1">
															<span className="font-semibold">Speed:</span> {sectionDisruption.operational_effects.passenger.speed_kmph} km/h
														</div>
													)}
													{sectionDisruption.operational_effects.passenger.delay_minutes && (
														<div className="text-xs text-green-700">
															<span className="font-semibold">Delay:</span> ~{sectionDisruption.operational_effects.passenger.delay_minutes} min
														</div>
													)}
												</div>
											)}
										</div>
									)}
									
									{/* Detailed operational impact for signal failures */}
									{sectionDisruption.type === 'signal_failure' && sectionDisruption.operational_mode === 'FAIL_SAFE' && (
										<div className="mt-2 p-2 bg-amber-50 border border-amber-200 rounded">
											<div className="text-xs font-semibold text-amber-800 mb-1">🔴 Fail-Safe Mode Active</div>
											{sectionDisruption.requires_ta912_authority && (
												<div className="text-xs text-amber-700 mb-1">
													<span className="font-semibold">TA-912 Authority:</span> Required
												</div>
											)}
											{sectionDisruption.restricted_speed_kmph && (
												<div className="text-xs text-amber-700 mb-1">
													<span className="font-semibold">Restricted Speed:</span> {sectionDisruption.restricted_speed_kmph} km/h
												</div>
											)}
											{sectionDisruption.block_clearance_time_min && sectionDisruption.normal_block_clearance_time_min && (
												<div className="text-xs text-amber-700 mb-1">
													<span className="font-semibold">Block Clearance:</span> {sectionDisruption.normal_block_clearance_time_min} min → {sectionDisruption.block_clearance_time_min} min
												</div>
											)}
											{sectionDisruption.throughput_drop_percent && (
												<div className="text-xs text-amber-700 mb-1">
													<span className="font-semibold">Throughput Drop:</span> {sectionDisruption.throughput_drop_percent}%
												</div>
											)}
											{sectionDisruption.passenger_delay_minutes && (
												<div className="text-xs text-amber-700">
													<span className="font-semibold">Passenger Delay:</span> ~{sectionDisruption.passenger_delay_minutes} min
												</div>
											)}
											{sectionDisruption.freight_delay_minutes && (
												<div className="text-xs text-amber-700">
													<span className="font-semibold">Freight Delay:</span> ~{sectionDisruption.freight_delay_minutes} min
												</div>
											)}
										</div>
									)}
									
									<div className="text-xs text-gray-600 mt-2">
										<span className="font-semibold">Type:</span> {sectionDisruption.type.replace('_', ' ').toUpperCase()}
									</div>
									<div className="text-xs text-gray-600">
										<span className="font-semibold">Severity:</span> {sectionDisruption.severity.toUpperCase()}
									</div>
									{sectionDisruption.startStation && sectionDisruption.endStation && (
										<div className="text-xs text-gray-600">
											<span className="font-semibold">Section:</span> {sectionDisruption.startStation} → {sectionDisruption.endStation}
										</div>
									)}
									<div className="text-xs text-gray-600">
										<span className="font-semibold">Duration:</span> {Math.round(sectionDisruption.durationSeconds / 60)} min
									</div>
									{sectionDisruption.description_detail && (
										<div className="text-xs text-gray-500 mt-2 italic">
											{sectionDisruption.description_detail}
										</div>
									)}
								</Popup>
							)}
						</Polyline>
					);
				})}
				
				{/* Draw disruption markers/overlays */}
				{disruptions.map((disruption) => {
					if (!disruption.startStation || !disruption.endStation) return null;
					
					const startStation = stationsMap.get(disruption.startStation);
					const endStation = stationsMap.get(disruption.endStation);
					if (!startStation || !endStation) return null;
					
					// Place marker at midpoint of the section
					const midLat = (startStation.lat + endStation.lat) / 2;
					const midLon = (startStation.lon + endStation.lon) / 2;
					
					const disruptionColor = getDisruptionColor(disruption.type, disruption.severity);
					
					return (
						<CircleMarker
							key={`disruption-${disruption.id}`}
							center={[midLat, midLon]}
							radius={disruption.type === 'signal_failure' ? 14 : 12}
							pathOptions={{
								fillColor: disruptionColor,
								fillOpacity: 0.8,
								color: disruption.type === 'signal_failure' ? '#f59e0b' : '#ffffff',
								weight: disruption.type === 'signal_failure' ? 3 : 2
							}}
						>
							<Popup className="max-w-xs">
								<div className="font-bold text-base text-red-700">⚠️ Active Disruption</div>
								<div className="text-sm font-semibold mt-1">{disruption.description}</div>
								
								{/* Operational Effects - Freight & Passenger */}
								{disruption.operational_effects && (
									<div className="mt-2 space-y-2">
										{disruption.operational_effects.freight && (
											<div className="p-2 bg-blue-50 border border-blue-200 rounded">
												<div className="text-xs font-semibold text-blue-800 mb-1">🚚 Freight Effects:</div>
												{disruption.operational_effects.freight.action && (
													<div className="text-xs text-blue-700 mb-1">
														<span className="font-semibold">Action:</span> {disruption.operational_effects.freight.action.replace(/_/g, ' ')}
													</div>
												)}
												{disruption.operational_effects.freight.speed_kmph !== undefined && (
													<div className="text-xs text-blue-700 mb-1">
														<span className="font-semibold">Speed:</span> {disruption.operational_effects.freight.speed_kmph} km/h
													</div>
												)}
												{disruption.operational_effects.freight.delay_minutes && (
													<div className="text-xs text-blue-700">
														<span className="font-semibold">Delay:</span> ~{disruption.operational_effects.freight.delay_minutes} min
													</div>
												)}
												{disruption.operational_effects.freight.reroute_to_alternate_loops && (
													<div className="text-xs text-blue-700 mt-1">
														<span className="font-semibold">Reroute:</span> To alternate loops
													</div>
												)}
											</div>
										)}
										{disruption.operational_effects.passenger && (
											<div className="p-2 bg-green-50 border border-green-200 rounded">
												<div className="text-xs font-semibold text-green-800 mb-1">🚆 Passenger Effects:</div>
												{disruption.operational_effects.passenger.action && (
													<div className="text-xs text-green-700 mb-1">
														<span className="font-semibold">Action:</span> {disruption.operational_effects.passenger.action.replace(/_/g, ' ')}
													</div>
												)}
												{disruption.operational_effects.passenger.speed_kmph !== undefined && (
													<div className="text-xs text-green-700 mb-1">
														<span className="font-semibold">Speed:</span> {disruption.operational_effects.passenger.speed_kmph} km/h
													</div>
												)}
												{disruption.operational_effects.passenger.delay_minutes && (
													<div className="text-xs text-green-700">
														<span className="font-semibold">Delay:</span> ~{disruption.operational_effects.passenger.delay_minutes} min
													</div>
												)}
												{disruption.operational_effects.passenger.reroute_enabled && (
													<div className="text-xs text-green-700 mt-1">
														<span className="font-semibold">Reroute:</span> Enabled
													</div>
												)}
											</div>
										)}
									</div>
								)}
								
								{/* Detailed operational impact for signal failures */}
								{disruption.type === 'signal_failure' && disruption.operational_mode === 'FAIL_SAFE' && (
									<div className="mt-2 p-2 bg-amber-50 border border-amber-200 rounded">
										<div className="text-xs font-semibold text-amber-800 mb-1">🔴 Fail-Safe Mode Active</div>
										{disruption.requires_ta912_authority && (
											<div className="text-xs text-amber-700 mb-1">
												<span className="font-semibold">TA-912 Authority:</span> Required
											</div>
										)}
										{disruption.restricted_speed_kmph && (
											<div className="text-xs text-amber-700 mb-1">
												<span className="font-semibold">Restricted Speed:</span> {disruption.restricted_speed_kmph} km/h
											</div>
										)}
										{disruption.block_clearance_time_min && disruption.normal_block_clearance_time_min && (
											<div className="text-xs text-amber-700 mb-1">
												<span className="font-semibold">Block Clearance:</span> {disruption.normal_block_clearance_time_min} min → {disruption.block_clearance_time_min} min
											</div>
										)}
										{disruption.throughput_drop_percent && (
											<div className="text-xs text-amber-700 mb-1">
												<span className="font-semibold">Throughput Drop:</span> {disruption.throughput_drop_percent}%
											</div>
										)}
										{disruption.passenger_delay_minutes && (
											<div className="text-xs text-amber-700">
												<span className="font-semibold">Passenger Delay:</span> ~{disruption.passenger_delay_minutes} min
											</div>
										)}
										{disruption.freight_delay_minutes && (
											<div className="text-xs text-amber-700">
												<span className="font-semibold">Freight Delay:</span> ~{disruption.freight_delay_minutes} min
											</div>
										)}
									</div>
								)}
								
								<div className="text-xs text-gray-600 mt-2">
									<span className="font-semibold">Type:</span> {disruption.type.replace('_', ' ').toUpperCase()}
								</div>
								<div className="text-xs text-gray-600">
									<span className="font-semibold">Severity:</span> {disruption.severity.toUpperCase()}
								</div>
								{disruption.startStation && disruption.endStation && (
									<div className="text-xs text-gray-600">
										<span className="font-semibold">Section:</span> {disruption.startStation} → {disruption.endStation}
									</div>
								)}
								<div className="text-xs text-gray-600">
									<span className="font-semibold">Duration:</span> {Math.round(disruption.durationSeconds / 60)} min
								</div>
								<div className="text-xs text-gray-500 mt-1">
									Started: {new Date(disruption.startTime).toLocaleTimeString()}
								</div>
								{disruption.description_detail && (
									<div className="text-xs text-gray-500 mt-2 italic border-t pt-2">
										{disruption.description_detail}
									</div>
								)}
							</Popup>
						</CircleMarker>
					);
				})}
				
				{/* Draw stations with icons */}
				{mapData.stations.map((station) => {
					const stationData = stationsMap.get(station.stationCode);
					if (!stationData) return null;
					
					// Determine if it's a major station
					const isMajor = ['ET', 'RKMP', 'BPL'].includes(station.stationCode);
					
					// Create custom station icon
					const stationIcon = L.divIcon({
						className: 'station-icon',
						html: `
							<div style="
								width: ${isMajor ? '24px' : '20px'};
								height: ${isMajor ? '24px' : '20px'};
								background-color: #ffffff;
								border: 3px solid #000000;
								border-radius: 50%;
								display: flex;
								align-items: center;
								justify-content: center;
								box-shadow: 0 2px 4px rgba(0,0,0,0.3);
							">
								<div style="
									width: ${isMajor ? '10px' : '8px'};
									height: ${isMajor ? '10px' : '8px'};
									background-color: #000000;
									border-radius: 50%;
								"></div>
							</div>
						`,
						iconSize: [isMajor ? 24 : 20, isMajor ? 24 : 20],
						iconAnchor: [isMajor ? 12 : 10, isMajor ? 12 : 10]
					});
					
					return (
						<Marker
							key={station.stationCode}
							position={[stationData.lat, stationData.lon]}
							icon={stationIcon}
						>
							<Popup>
								<div className="font-semibold text-base">{stationData.name}</div>
								<div className="text-sm text-gray-600">{station.stationCode}</div>
								<div className="text-xs text-gray-500 mt-1">KTV–PSA corridor</div>
							</Popup>
						</Marker>
					);
				})}
				
				{/* Draw station labels */}
				{mapData.stations.map((station) => {
					const stationData = stationsMap.get(station.stationCode);
					if (!stationData) return null;
					
					return (
						<Marker
							key={`label-${station.stationCode}`}
							position={[stationData.lat + 0.002, stationData.lon + 0.002]}
							icon={L.divIcon({
								className: 'station-label',
								html: `<div style="
									color: #000;
									font-size: 11px;
									font-weight: 500;
									text-shadow: 1px 1px 2px rgba(255,255,255,0.8);
									pointer-events: none;
									white-space: nowrap;
								">${stationData.name}</div>`,
								iconSize: [100, 20],
								iconAnchor: [0, 10]
							})}
						/>
					);
				})}
				
				{/* Draw alternative routes for rerouted trains */}
				{trainPositions
					.filter(t => t.rerouted && t.alternativeRoute && t.alternativeRoute.length > 1)
					.map((train) => {
						if (!train.alternativeRoute) return null;
						
						// Draw alternative route as dashed line
						const routePoints: [number, number][] = [];
						for (let i = 0; i < train.alternativeRoute.length - 1; i++) {
							const fromStation = stationsMap.get(train.alternativeRoute[i]);
							const toStation = stationsMap.get(train.alternativeRoute[i + 1]);
							if (fromStation && toStation) {
								routePoints.push([fromStation.lat, fromStation.lon]);
								routePoints.push([toStation.lat, toStation.lon]);
							}
						}
						
						if (routePoints.length < 2) return null;
						
						return (
							<Polyline
								key={`alt-route-${train.trainNo}`}
								positions={routePoints}
								pathOptions={{
									color: '#8b5cf6', // Purple for alternative route
									weight: 4,
									opacity: 0.6,
									dashArray: '10, 5',
									lineCap: 'round',
									lineJoin: 'round'
								}}
							/>
						);
					})}
				
				{/* Draw trains with color coding */}
				{trainPositions.map((train) => {
					if (!train.lat || !train.lon) return null;
					
					const color = getTrainTypeColor(train.trainType, train.status);
					const isSelected = selectedTrain === train.trainNo;
					const isRerouted = train.status === 'REROUTED' || train.rerouted;
					const isQueued = train.status === 'QUEUED';
					
					// Determine train type for display
					const typeUpper = (train.trainType || '').toUpperCase();
					let trainTypeLabel = train.trainType || 'Unknown';
					if (typeUpper.includes('EXPRESS') || typeUpper.includes('SUPERFAST')) {
						trainTypeLabel = 'Express';
					} else if (typeUpper.includes('PASSENGER')) {
						trainTypeLabel = 'Passenger';
					} else if (typeUpper.includes('GOODS') || typeUpper.includes('FREIGHT')) {
						trainTypeLabel = 'Goods';
					}
					
					return (
						<CircleMarker
							key={train.trainNo}
							center={[train.lat, train.lon]}
							radius={isSelected ? 16 : isRerouted ? 14 : isQueued ? 13 : 12}
							pathOptions={{
								fillColor: color,
								fillOpacity: isQueued ? 0.8 : 1,
								color: isRerouted ? '#8b5cf6' : isQueued ? '#f97316' : '#ffffff',
								weight: isSelected ? 3 : isRerouted ? 3 : isQueued ? 2.5 : 2.5
							}}
							eventHandlers={{
								click: () => {
									if (onTrainClick) {
										onTrainClick(train.trainNo);
									}
								}
							}}
						>
							<Popup>
								<div className="font-bold text-lg">{train.trainNo}</div>
								<div className="text-sm font-medium">{train.trainName || 'Train'}</div>
								{isRerouted && (
									<div className="text-xs text-purple-600 font-semibold mt-1 flex items-center gap-1">
										<span>🔄 REROUTED</span>
									</div>
								)}
								{isQueued && (
									<div className="text-xs text-orange-600 font-semibold mt-1 flex items-center gap-1">
										<span>⏸️ QUEUED - Waiting for clearance</span>
									</div>
								)}
								<div className="text-xs mt-1 flex items-center gap-1">
									<span className="font-semibold">Type:</span>
									<span className="inline-block w-3 h-3 rounded-full" style={{ backgroundColor: color }}></span>
									<span>{trainTypeLabel}</span>
								</div>
								<div className="text-xs">
									<span className="font-semibold">Status:</span> {train.status || 'RUNNING'}
								</div>
								{isRerouted && train.alternativeRoute && (
									<div className="text-xs text-purple-600 mt-1">
										<span className="font-semibold">Alternative Route:</span> {train.alternativeRoute.join(' → ')}
									</div>
								)}
								{isRerouted && train.originalSection && (
									<div className="text-xs text-amber-600 mt-1">
										<span className="font-semibold">Blocked Section:</span> {train.originalSection}
									</div>
								)}
								{train.delay && train.delay > 0 && (
									<div className="text-xs text-red-600 mt-1">
										<span className="font-semibold">Delay:</span> {train.delay} min
									</div>
								)}
							</Popup>
						</CircleMarker>
					);
				})}
				
				{/* Train labels in black boxes */}
				{trainPositions.map((train) => {
					if (!train.lat || !train.lon) return null;
					
					return (
						<Marker
							key={`label-${train.trainNo}`}
							position={[train.lat + 0.001, train.lon + 0.001]}
							icon={L.divIcon({
								className: 'train-label',
								html: `<div style="
									background-color: rgba(0,0,0,0.85);
									color: #fff;
									padding: 2px 6px;
									border-radius: 3px;
									font-size: 11px;
									font-weight: bold;
									pointer-events: none;
									white-space: nowrap;
									box-shadow: 0 2px 4px rgba(0,0,0,0.3);
								">${train.trainNo}</div>`,
								iconSize: [60, 20],
								iconAnchor: [0, 10]
							})}
						/>
					);
				})}
			</MapContainer>
		</div>
	);
}
