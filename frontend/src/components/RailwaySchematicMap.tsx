import React, { useEffect, useRef, useState } from 'react';
import { MapContainer, TileLayer, Polyline, CircleMarker, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { fetchDigitalTwinMap, fetchDigitalTwinPositions, type DigitalTwinMapData, type DigitalTwinPosition } from '../lib/api';

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
}

const getTrainTypeColor = (trainType?: string, status?: string): string => {
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
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [stationsMap, setStationsMap] = useState<Map<string, { lat: number; lon: number; name: string }>>(new Map());
	const [sectionsMap, setSectionsMap] = useState<Map<string, { from: { lat: number; lon: number }, to: { lat: number; lon: number } }>>(new Map());

	// Helper function to setup fallback data
	const setupFallbackData = () => {
		const fallbackData: DigitalTwinMapData = {
			division: 'mumbai',
			stations: [
				{ stationCode: 'MMCT', stationName: 'Mumbai Central', lat: 19.0760, lon: 72.8777 },
				{ stationCode: 'CSTM', stationName: 'Mumbai CST', lat: 18.9400, lon: 72.8354 },
				{ stationCode: 'DR', stationName: 'Dadar', lat: 19.0176, lon: 72.8562 },
				{ stationCode: 'KYN', stationName: 'Kalyan', lat: 19.2437, lon: 73.1355 },
				{ stationCode: 'TNA', stationName: 'Thane', lat: 19.1947, lon: 72.9706 },
			],
			sections: [
				{ section_id: 'MMCT-CSTM', from: 'MMCT', to: 'CSTM' },
				{ section_id: 'MMCT-DR', from: 'MMCT', to: 'DR' },
				{ section_id: 'DR-KYN', from: 'DR', to: 'KYN' },
				{ section_id: 'KYN-TNA', from: 'KYN', to: 'TNA' },
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
								lon
							};
						}
						return train;
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
								lon
							};
						}
						return null;
					}).filter(Boolean) as TrainPosition[];
					
					setTrainPositions(positions);
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
				<div className="text-gray-700 text-lg">Loading Central Railway map...</div>
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

	return (
		<div className="w-full h-full relative" style={{ backgroundColor: '#bfdbfe', minHeight: '600px', height: '100%' }}>
			{/* Central Railway Title */}
			<div className="absolute top-4 left-4 z-[1000] bg-blue-600 text-white px-4 py-2 rounded-lg shadow-lg">
				<div className="font-bold text-lg">CENTRAL RAILWAY</div>
				<div className="text-xs opacity-90">Train Status Map</div>
			</div>
			
			<MapContainer
				key={`map-${division}-${mapData?.stations.length || 0}`}
				center={[19.0760, 72.8777]} // Mumbai coordinates (Central Railway)
				zoom={10}
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
				{Array.from(sectionsMap.entries()).map(([sectionId, section]) => (
					<Polyline
						key={sectionId}
						positions={[
							[section.from.lat, section.from.lon],
							[section.to.lat, section.to.lon]
						]}
						pathOptions={{
							color: '#dc2626', // Red for trunk routes (electrified)
							weight: 5,
							opacity: 0.9,
							lineCap: 'round',
							lineJoin: 'round'
						}}
					/>
				))}
				
				{/* Draw stations with icons */}
				{mapData.stations.map((station) => {
					const stationData = stationsMap.get(station.stationCode);
					if (!stationData) return null;
					
					// Determine if it's a major station
					const isMajor = station.stationCode === 'MMCT' || station.stationCode === 'CSTM' || 
					                station.stationCode === 'DR' || station.stationCode === 'KYN';
					
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
								<div className="text-xs text-gray-500 mt-1">Central Railway</div>
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
				
				{/* Draw trains with color coding */}
				{trainPositions.map((train) => {
					if (!train.lat || !train.lon) return null;
					
					const color = getTrainTypeColor(train.trainType, train.status);
					const isSelected = selectedTrain === train.trainNo;
					
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
							radius={isSelected ? 14 : 12}
							pathOptions={{
								fillColor: color,
								fillOpacity: 1,
								color: '#ffffff',
								weight: isSelected ? 3 : 2.5
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
								<div className="text-xs mt-1 flex items-center gap-1">
									<span className="font-semibold">Type:</span>
									<span className="inline-block w-3 h-3 rounded-full" style={{ backgroundColor: color }}></span>
									<span>{trainTypeLabel}</span>
								</div>
								<div className="text-xs">
									<span className="font-semibold">Status:</span> {train.status || 'RUNNING'}
								</div>
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
