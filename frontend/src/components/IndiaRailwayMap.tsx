import React, { useEffect, useRef, useState, useMemo } from 'react';
import { fetchIndiaRailwayMap, fetchIndiaRailwayPositions, type IndiaRailwayMapData, type IndiaRailwayPosition } from '../lib/api';

interface IndiaRailwayMapProps {
	selectedTrain?: string | null;
	onTrainClick?: (trainNo: string) => void;
}

// Get train color based on type
const getTrainColor = (trainType?: string, status?: string): string => {
	if (status === 'STOPPED') return '#9ca3af'; // Grey for stopped
	if (status === 'DELAYED') return '#ef4444'; // Red for delayed
	
	const typeUpper = (trainType || '').toUpperCase();
	
	// Express/Superfast trains - Red
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
	
	// Default to red for express
	return '#ef4444';
};

// Convert lat/lon to SVG coordinates (Mercator-like projection for India)
const projectToSVG = (lat: number, lon: number, bounds: { minLat: number; maxLat: number; minLon: number; maxLon: number }, width: number, height: number) => {
	const x = ((lon - bounds.minLon) / (bounds.maxLon - bounds.minLon)) * width;
	const y = ((bounds.maxLat - lat) / (bounds.maxLat - bounds.minLat)) * height;
	return { x, y };
};

// Generate smooth curve path between two points
const generateCurvePath = (x1: number, y1: number, x2: number, y2: number): string => {
	const dx = x2 - x1;
	const dy = y2 - y1;
	const distance = Math.sqrt(dx * dx + dy * dy);
	
	// Control points for smooth curve
	const cp1x = x1 + dx * 0.3;
	const cp1y = y1;
	const cp2x = x2 - dx * 0.3;
	const cp2y = y2;
	
	return `M ${x1} ${y1} C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${x2} ${y2}`;
};

export default function IndiaRailwayMap({ selectedTrain, onTrainClick }: IndiaRailwayMapProps) {
	const [mapData, setMapData] = useState<IndiaRailwayMapData | null>(null);
	const [trainPositions, setTrainPositions] = useState<Array<IndiaRailwayPosition & { lat?: number; lon?: number }>>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const svgRef = useRef<SVGSVGElement>(null);
	const [dimensions, setDimensions] = useState({ width: 1920, height: 1080 });

	// Calculate bounds from stations
	const bounds = useMemo(() => {
		if (!mapData || mapData.stations.length === 0) {
			return { minLat: 8, maxLat: 37, minLon: 68, maxLon: 97 };
		}
		
		const lats = mapData.stations.map(s => s.lat).filter(lat => lat !== 0);
		const lons = mapData.stations.map(s => s.lon).filter(lon => lon !== 0);
		
		if (lats.length === 0 || lons.length === 0) {
			return { minLat: 8, maxLat: 37, minLon: 68, maxLon: 97 };
		}
		
		return {
			minLat: Math.min(...lats) - 1,
			maxLat: Math.max(...lats) + 1,
			minLon: Math.min(...lons) - 1,
			maxLon: Math.max(...lons) + 1
		};
	}, [mapData]);

	// Build station and section maps
	const stationMap = useMemo(() => {
		if (!mapData) return new Map();
		const map = new Map<string, { lat: number; lon: number; name: string; isJunction: boolean }>();
		mapData.stations.forEach(station => {
			map.set(station.stationCode, {
				lat: station.lat,
				lon: station.lon,
				name: station.stationName,
				isJunction: station.isJunction
			});
		});
		return map;
	}, [mapData]);

	const sectionMap = useMemo(() => {
		if (!mapData) return new Map();
		const map = new Map<string, { from: string; to: string; isTrunk: boolean }>();
		mapData.sections.forEach(section => {
			map.set(section.section_id, {
				from: section.from,
				to: section.to,
				isTrunk: section.isTrunk
			});
		});
		return map;
	}, [mapData]);

	// Update dimensions on resize
	useEffect(() => {
		const updateDimensions = () => {
			if (svgRef.current && svgRef.current.parentElement) {
				const rect = svgRef.current.parentElement.getBoundingClientRect();
				setDimensions({ width: Math.max(rect.width, 1920), height: Math.max(rect.height, 1080) });
			}
		};
		
		updateDimensions();
		const resizeObserver = new ResizeObserver(updateDimensions);
		if (svgRef.current?.parentElement) {
			resizeObserver.observe(svgRef.current.parentElement);
		}
		window.addEventListener('resize', updateDimensions);
		return () => {
			resizeObserver.disconnect();
			window.removeEventListener('resize', updateDimensions);
		};
	}, []);

	// Load map data
	useEffect(() => {
		let mounted = true;
		let timeoutId: ReturnType<typeof setTimeout>;
		
		const loadMapData = async () => {
			try {
				setLoading(true);
				setError(null);
				console.log('Loading India railway map data...');
				
				// Set a timeout to show error if it takes too long
				timeoutId = setTimeout(() => {
					if (mounted) {
						console.warn('Map data loading timeout');
						setError('Loading timeout - please check your connection and try refreshing');
						setLoading(false);
					}
				}, 15000); // 15 second timeout
				
				const data = await fetchIndiaRailwayMap();
				clearTimeout(timeoutId);
				
				console.log('Map data loaded:', { stations: data.stations.length, sections: data.sections.length });
				if (mounted) {
					if (data.stations.length === 0) {
						console.warn('No stations in map data');
						setError('No station data available - backend may not have data for all divisions');
					} else {
						setMapData(data);
					}
					setLoading(false);
				}
			} catch (err) {
				clearTimeout(timeoutId);
				console.error('Failed to load map data:', err);
				if (mounted) {
					const errorMessage = err instanceof Error ? err.message : 'Unknown error';
					console.error('Error details:', errorMessage);
					setError(`Failed to load map data: ${errorMessage}. Please check if the backend is running and accessible.`);
					setLoading(false);
				}
			}
		};

		loadMapData();
		return () => { 
			mounted = false;
			if (timeoutId) clearTimeout(timeoutId);
		};
	}, []);

	// Load train positions
	useEffect(() => {
		if (!mapData) return;
		
		let mounted = true;
		let intervalId: ReturnType<typeof setInterval>;
		
		const loadTrainPositions = async () => {
			try {
				const response = await fetchIndiaRailwayPositions();
				console.log('Train positions loaded:', { count: response.trains?.length || 0 });
				if (mounted && response.trains) {
					// Calculate actual lat/lon for trains
					const positions: Array<IndiaRailwayPosition & { lat?: number; lon?: number }> = response.trains.map(train => {
						const section = sectionMap.get(train.position.sectionId);
						if (section) {
							const fromStation = stationMap.get(section.from);
							const toStation = stationMap.get(section.to);
							
							if (fromStation && toStation) {
								const progress = train.position.progress;
								const lat = fromStation.lat + (toStation.lat - fromStation.lat) * progress;
								const lon = fromStation.lon + (toStation.lon - fromStation.lon) * progress;
								
								return {
									...train,
									lat,
									lon
								};
							}
						}
						return train;
					}).filter((train): train is IndiaRailwayPosition & { lat: number; lon: number } => {
						const t = train as IndiaRailwayPosition & { lat?: number; lon?: number };
						return !!(t.lat && t.lon && t.lat !== 0 && t.lon !== 0);
					}); // Only keep trains with valid coordinates
					
					console.log('Processed train positions:', { count: positions.length });
					setTrainPositions(positions);
				}
			} catch (err) {
				console.error('Failed to load train positions:', err);
			}
		};
		
		loadTrainPositions();
		intervalId = setInterval(loadTrainPositions, 10000); // Update every 10 seconds
		
		return () => {
			mounted = false;
			if (intervalId) clearInterval(intervalId);
		};
	}, [mapData, sectionMap, stationMap]);

	if (loading) {
		return (
			<div className="flex flex-col items-center justify-center h-full w-full bg-gray-900">
				<div className="text-white text-lg mb-2">Loading India Railway Map...</div>
				<div className="text-gray-400 text-sm">Fetching data from all divisions...</div>
				<div className="mt-4 w-64 h-1 bg-gray-700 rounded-full overflow-hidden">
					<div className="h-full bg-blue-500 animate-pulse" style={{ width: '60%' }}></div>
				</div>
			</div>
		);
	}

	if (error) {
		return (
			<div className="flex items-center justify-center h-full w-full bg-gray-900">
				<div className="text-red-400 text-lg">Error: {error}</div>
			</div>
		);
	}

	if (!mapData || mapData.stations.length === 0) {
		return (
			<div className="flex items-center justify-center h-full w-full bg-gray-900">
				<div className="text-white text-lg">No map data available</div>
			</div>
		);
	}

	const { width, height } = dimensions;

	return (
		<div className="w-full h-full relative bg-gray-900 overflow-hidden">
			{/* Title */}
			<div className="absolute top-4 left-4 z-10 bg-gray-800/90 backdrop-blur-sm text-white px-6 py-3 rounded-lg shadow-xl border border-gray-700">
				<div className="font-bold text-xl">INDIA RAILWAY NETWORK</div>
				<div className="text-xs opacity-80 mt-1">Digital Twin Operations Control Center</div>
			</div>

			{/* Legend */}
			<div className="absolute top-4 right-4 z-10 bg-gray-800/90 backdrop-blur-sm text-white px-4 py-3 rounded-lg shadow-xl border border-gray-700">
				<div className="text-xs font-semibold mb-2">TRAIN TYPES</div>
				<div className="space-y-1 text-xs">
					<div className="flex items-center gap-2">
						<div className="w-3 h-3 rounded-full bg-green-500"></div>
						<span>Passenger</span>
					</div>
					<div className="flex items-center gap-2">
						<div className="w-3 h-3 rounded-full bg-red-500"></div>
						<span>Express/Superfast</span>
					</div>
					<div className="flex items-center gap-2">
						<div className="w-3 h-3 rounded-full bg-blue-500"></div>
						<span>Goods/Freight</span>
					</div>
				</div>
			</div>

			{/* SVG Map */}
			<svg
				ref={svgRef}
				width="100%"
				height="100%"
				viewBox={`0 0 ${width} ${height}`}
				className="absolute inset-0"
				style={{ background: '#0f172a' }}
			>
				{/* Definitions for filters and gradients */}
				<defs>
					{/* Glow filter for trunk routes */}
					<filter id="trunkGlow" x="-50%" y="-50%" width="200%" height="200%">
						<feGaussianBlur stdDeviation="3" result="coloredBlur"/>
						<feMerge>
							<feMergeNode in="coloredBlur"/>
							<feMergeNode in="SourceGraphic"/>
						</feMerge>
					</filter>
					
					{/* Glow filter for normal routes */}
					<filter id="routeGlow" x="-50%" y="-50%" width="200%" height="200%">
						<feGaussianBlur stdDeviation="1.5" result="coloredBlur"/>
						<feMerge>
							<feMergeNode in="coloredBlur"/>
							<feMergeNode in="SourceGraphic"/>
						</feMerge>
					</filter>

					{/* Train glow */}
					<filter id="trainGlow" x="-50%" y="-50%" width="200%" height="200%">
						<feGaussianBlur stdDeviation="2" result="coloredBlur"/>
						<feMerge>
							<feMergeNode in="coloredBlur"/>
							<feMergeNode in="SourceGraphic"/>
						</feMerge>
					</filter>

					{/* Station glow */}
					<filter id="stationGlow" x="-50%" y="-50%" width="200%" height="200%">
						<feGaussianBlur stdDeviation="1" result="coloredBlur"/>
						<feMerge>
							<feMergeNode in="coloredBlur"/>
							<feMergeNode in="SourceGraphic"/>
						</feMerge>
					</filter>
				</defs>

				{/* Draw railway sections (routes) */}
				{mapData.sections.map((section) => {
					const fromStation = stationMap.get(section.from);
					const toStation = stationMap.get(section.to);
					
					if (!fromStation || !toStation) return null;
					
					const from = projectToSVG(fromStation.lat, fromStation.lon, bounds, width, height);
					const to = projectToSVG(toStation.lat, toStation.lon, bounds, width, height);
					
					const path = generateCurvePath(from.x, from.y, to.x, to.y);
					const isTrunk = section.isTrunk;
					
					return (
						<path
							key={section.section_id}
							d={path}
							fill="none"
							stroke={isTrunk ? '#fbbf24' : '#60a5fa'}
							strokeWidth={isTrunk ? 4 : 2}
							opacity={isTrunk ? 0.9 : 0.6}
							filter={isTrunk ? 'url(#trunkGlow)' : 'url(#routeGlow)'}
							strokeLinecap="round"
							strokeLinejoin="round"
						/>
					);
				})}

				{/* Draw stations */}
				{mapData.stations.map((station) => {
					const pos = projectToSVG(station.lat, station.lon, bounds, width, height);
					const isJunction = station.isJunction;
					
					return (
						<g key={station.stationCode}>
							{/* Station circle */}
							<circle
								cx={pos.x}
								cy={pos.y}
								r={isJunction ? 6 : 4}
								fill="#ffffff"
								stroke="#1e293b"
								strokeWidth={1.5}
								filter="url(#stationGlow)"
								className="cursor-pointer hover:r-8 transition-all"
							/>
							{/* Station label */}
							<text
								x={pos.x + 8}
								y={pos.y + 4}
								fill="#ffffff"
								fontSize="11"
								fontWeight="500"
								className="pointer-events-none select-none"
								style={{ textShadow: '0 0 4px rgba(0,0,0,0.8)' }}
							>
								{station.stationName}
							</text>
						</g>
					);
				})}

				{/* Draw trains */}
				{trainPositions.map((train) => {
					if (!train.lat || !train.lon) return null;
					
					const pos = projectToSVG(train.lat, train.lon, bounds, width, height);
					const color = getTrainColor(train.trainType, train.status);
					const isSelected = selectedTrain === train.trainNo;
					
					// Determine direction (use section direction)
					const section = sectionMap.get(train.position.sectionId);
					let direction = 0; // Default direction (east)
					if (section) {
						const fromStation = stationMap.get(section.from);
						const toStation = stationMap.get(section.to);
						if (fromStation && toStation) {
							// Calculate direction from fromStation to toStation
							const dx = toStation.lon - fromStation.lon;
							const dy = toStation.lat - fromStation.lat;
							// Convert to degrees (SVG uses degrees, not radians)
							direction = Math.atan2(-dy, dx) * (180 / Math.PI); // Negative dy because SVG y increases downward
						}
					}
					
					return (
						<g key={train.trainNo}>
							{/* Train icon (circle with direction arrow) */}
							<circle
								cx={pos.x}
								cy={pos.y}
								r={isSelected ? 10 : 8}
								fill={color}
								stroke="#ffffff"
								strokeWidth={isSelected ? 2.5 : 2}
								filter="url(#trainGlow)"
								className="cursor-pointer"
								onClick={() => onTrainClick?.(train.trainNo)}
								style={{ 
									boxShadow: `0 0 10px ${color}`,
									animation: train.status === 'RUNNING' ? 'pulse 2s infinite' : 'none'
								}}
							/>
							
							{/* Direction arrow */}
							<g transform={`translate(${pos.x}, ${pos.y}) rotate(${direction})`}>
								<polygon
									points="0,-5 5,0 0,5 -2,0"
									fill="#ffffff"
									stroke={color}
									strokeWidth={0.5}
									opacity={0.9}
								/>
							</g>
							
							{/* Train label with arrow indicator */}
							<g transform={`translate(${pos.x + 14}, ${pos.y - 14})`}>
								<rect
									x={-6}
									y={-10}
									width={train.trainNo.length * 7 + 12}
									height={20}
									rx={4}
									fill="rgba(0, 0, 0, 0.9)"
									stroke={color}
									strokeWidth={1.5}
									opacity={0.95}
								/>
								<text
									x={0}
									y={5}
									fill="#ffffff"
									fontSize="10"
									fontWeight="bold"
									textAnchor="start"
									className="pointer-events-none select-none"
									style={{ textShadow: '0 0 2px rgba(0,0,0,0.8)' }}
								>
									{train.trainNo}
								</text>
							</g>
						</g>
					);
				})}
			</svg>

			{/* Stats overlay */}
			<div className="absolute bottom-4 left-4 z-10 bg-gray-800/90 backdrop-blur-sm text-white px-4 py-2 rounded-lg shadow-xl border border-gray-700 text-xs">
				<div>Stations: {mapData.stations.length} | Trains: {trainPositions.length} | Routes: {mapData.sections.length}</div>
			</div>

			{/* CSS for pulse animation */}
			<style>{`
				@keyframes pulse {
					0%, 100% { opacity: 1; }
					50% { opacity: 0.7; }
				}
			`}</style>
		</div>
	);
}

