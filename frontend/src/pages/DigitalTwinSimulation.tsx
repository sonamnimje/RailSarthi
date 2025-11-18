import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import {
	Play,
	Pause,
	RotateCcw,
	FolderOpen,
	Droplet,
	Cloud,
	Activity,
	Brain,
	Clock,
	TrendingUp,

	Train,
	AlertCircle,
	CheckCircle2,
	Zap,
	RefreshCw,
	Wifi,
	Radio,
	Shield,
	Settings,
	Info,
	X,
	Timer,
	Gauge,
	MapPin,
	AlertTriangle,
	Square,
} from 'lucide-react';
import { fetchKpis, fetchLiveTrains, fetchAlerts, fetchMe, type LiveTrain } from '../lib/api';
import { useWebSocket } from '../lib/useWebSocket';
import { useRealTimeData } from '../lib/RealTimeDataContext';
import { useOverrides } from '../lib/OverrideContext';
import RailwaySchematicMap from '../components/RailwaySchematicMap';
import IndiaRailwayMap from '../components/IndiaRailwayMap';

interface TrainPosition {
	id: string;
	trainNo: string;
	trainName?: string;
	trainType?: 'SUPERFAST' | 'PASSENGER' | 'GOODS' | 'EXPRESS' | 'SHATABDI' | 'RAJDHANI';
	lat: number;
	lon: number;
	speed: number;
	status: 'RUNNING' | 'STOPPED' | 'DELAYED';
	sectionId: string;
	delay?: number;
	platform?: string;
}

interface EventLogEntry {
	id: string;
	timestamp: string;
	type: 'info' | 'warning' | 'success' | 'error';
	message: string;
}

interface KPI {
	label: string;
	value: string | number;
	unit?: string;
	trend?: number;
	color: 'blue' | 'green' | 'yellow' | 'purple';
}

// Smart Train Prioritization Component
type PrioritizationSuggestion = {
	id: string;
	action: string;
	impact: string;
	reason?: string;
};

export default function DigitalTwinSimulation() {
	const { trains: realTimeTrains, kpis: realTimeKpis, alerts: realTimeAlerts, isConnected: realTimeConnected, refreshData } = useRealTimeData();
	const { addOverride } = useOverrides();
	const [isSimulating, setIsSimulating] = useState(false);
	const [simulationSpeed, setSimulationSpeed] = useState(1);
	const [trains, setTrains] = useState<TrainPosition[]>([]);
	const [initialTrainPositions, setInitialTrainPositions] = useState<TrainPosition[]>([]);
	const [eventLog, setEventLog] = useState<EventLogEntry[]>([]);
	const [selectedTrain, setSelectedTrain] = useState<string | null>(null);
	const [showTrainModal, setShowTrainModal] = useState(false);
	const [delayMinutes, setDelayMinutes] = useState<number>(15);
	const [speedKmh, setSpeedKmh] = useState<number>(80);
	const [holdMinutes, setHoldMinutes] = useState<number>(5);
	const [kpis, setKpis] = useState<KPI[]>([]);
	const [loading, setLoading] = useState(true);
	const [lastUpdated, setLastUpdated] = useState<Date>(new Date());
	const [selectedStation, setSelectedStation] = useState<string>('MMCT'); // Default to Mumbai Central (Central Railway)
	const [dataSources, setDataSources] = useState({ websocket: false, sensors: true, signals: true });
	const [constraintStatus, setConstraintStatus] = useState({ safety: true, platform: true, scheduling: true });
	const [feedbackCount, setFeedbackCount] = useState({ accepted: 0, overridden: 0 });
	const [prioritizationExpandedId, setPrioritizationExpandedId] = useState<string | null>(null);
	const [prioritizationDismissedIds, setPrioritizationDismissedIds] = useState<Set<string>>(new Set());
	const [showOverrideModal, setShowOverrideModal] = useState(false);
	const [overrideDetails, setOverrideDetails] = useState<{ minutes: number; location: string; trainNo: string; suggestionId: string } | null>(null);
	const [editableHoldDuration, setEditableHoldDuration] = useState<number>(0);
	const [showSuccessToast, setShowSuccessToast] = useState(false);
	const [successMessage, setSuccessMessage] = useState('');
	const [controllerId, setControllerId] = useState<string>('controller-1');
	const animationFrameRef = useRef<number>();
	
	// Map station code to division name
	const getDivisionFromStation = (stationCode: string): string => {
		const stationToDivision: Record<string, string> = {
			'MMCT': 'mumbai',
			'PUNE': 'pune',
			'NGP': 'nagpur',
			'SUR': 'solapur',
			'BSL': 'bhusaval',
		};
		return stationToDivision[stationCode] || 'mumbai';
	};

	// Get current user/controller ID
	useEffect(() => {
		fetchMe()
			.then(user => {
				setControllerId(`controller-${user.id || user.username || '1'}`);
			})
			.catch(() => {
				// Fallback to default if not authenticated
				setControllerId('controller-1');
			});
	}, []);

	// Get WebSocket URL - construct from API base URL or use default
	const getWebSocketUrl = () => {
		if (typeof window === 'undefined') return 'ws://localhost:8000/ws/live';
		
		const API_BASE = ((import.meta as any).env?.VITE_API_URL || '').trim();
		const apiBaseUrl = API_BASE
			? API_BASE
			: (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
				? `${window.location.protocol}//${window.location.hostname}:8000`
				: 'https://railanukriti.onrender.com';
		
		return apiBaseUrl.replace('http://', 'ws://').replace('https://', 'wss://') + '/ws/live';
	};
	const wsUrl = getWebSocketUrl();
	
	// WebSocket connection for real-time updates
	const { isConnected, lastMessage } = useWebSocket(wsUrl, {
		onMessage: (data) => {
			// Handle WebSocket messages
			if (data && typeof data === 'object') {
				if (data.trains) {
					updateTrainsFromData(data.trains);
				}
				if (data.type === 'event') {
					addEventToLog({
						id: Date.now().toString(),
						timestamp: new Date().toLocaleTimeString(),
						type: data.severity || 'info',
						message: data.message || 'System update',
					});
				}
			}
		},
		onOpen: () => {
			setDataSources((prev) => ({ ...prev, websocket: true }));
		},
		onError: (error) => {
			console.error('WebSocket error:', error);
			setDataSources((prev) => ({ ...prev, websocket: false }));
			addEventToLog({
				id: Date.now().toString(),
				timestamp: new Date().toLocaleTimeString(),
				type: 'error',
				message: 'WebSocket connection error',
			});
		},
		onClose: () => {
			setDataSources((prev) => ({ ...prev, websocket: false }));
		},
	});

	// Update data sources status based on WebSocket connection
	useEffect(() => {
		setDataSources((prev) => ({ ...prev, websocket: isConnected }));
	}, [isConnected]);

	// Helper function to convert LiveTrain to TrainPosition
	const convertLiveTrainToPosition = (train: LiveTrain, index: number): TrainPosition => {
		// Generate normalized coordinates based on train number (for visualization)
		const seed = parseInt(train.trainNumber) || index;
		const lat = 0.2 + ((seed * 7) % 60) / 100;
		const lon = 0.2 + ((seed * 11) % 60) / 100;
		
		// Determine status based on delay
		let status: 'RUNNING' | 'STOPPED' | 'DELAYED' = 'RUNNING';
		if (train.delay && typeof train.delay === 'number' && train.delay > 15) {
			status = 'DELAYED';
		} else if (train.status?.toLowerCase().includes('stop') || train.stop) {
			status = 'STOPPED';
		}

		// Estimate speed (mock for now, could be enhanced with real data)
		const speed = status === 'STOPPED' ? 0 : 60 + (seed % 40);

		return {
			id: train.trainNumber,
			trainNo: train.trainNumber,
			trainName: train.trainName,
			lat,
			lon,
			speed,
			status,
			sectionId: train.station_name || `S${index + 1}`,
			delay: typeof train.delay === 'number' ? train.delay : typeof train.delay === 'string' ? parseInt(train.delay) : undefined,
			platform: train.platform_number?.toString(),
		};
	};

	// Update trains from API data
	const updateTrainsFromData = (liveTrains: LiveTrain[]) => {
		const positions = liveTrains.map((train, idx) => convertLiveTrainToPosition(train, idx));
		setTrains(positions);
	};

	// Sync with real-time data from context
	useEffect(() => {
		if (realTimeTrains && realTimeTrains.length > 0) {
			const positions = realTimeTrains.map((train, idx) => convertLiveTrainToPosition(train, idx));
			setTrains(positions);
		}
	}, [realTimeTrains]);

	// Add event to log
	const addEventToLog = (event: EventLogEntry) => {
		setEventLog((prev) => [event, ...prev.slice(0, 19)]);
	};

	// Fetch real-time data
	const fetchRealTimeData = async () => {
		try {
			setLoading(true);

			// Fetch KPIs
			const kpisData = await fetchKpis(24).catch((err) => {
				console.error('Failed to fetch KPIs:', err);
				return null;
			});

			if (kpisData) {
				// Calculate delay reduction (mock calculation based on on_time_percentage)
				const delayReduction = kpisData.on_time_percentage > 85 ? (kpisData.on_time_percentage - 85) * 2 : 0;
				const platformUtil = 100 - (kpisData.congestion_index * 10);
				const routeEfficiency = kpisData.on_time_percentage;
				const trainDensity = kpisData.throughput_per_hour / 20; // Normalize

				setKpis([
					{
						label: 'Delay Reduction',
						value: delayReduction.toFixed(1),
						unit: '%',
						trend: delayReduction > 20 ? 2.5 : -1.2,
						color: 'green',
					},
					{
						label: 'Platform Utilization',
						value: Math.max(0, Math.min(100, platformUtil)).toFixed(1),
						unit: '%',
						trend: platformUtil > 80 ? 1.5 : -0.8,
						color: 'blue',
					},
					{
						label: 'Route Efficiency',
						value: routeEfficiency.toFixed(1),
						unit: '%',
						trend: routeEfficiency > 85 ? 1.2 : -0.5,
						color: 'purple',
					},
					{
						label: 'Train Density',
						value: trainDensity.toFixed(1),
						unit: 'trains/km',
						trend: trainDensity > 10 ? -0.3 : 0.5,
						color: 'yellow',
					},
				]);
			} else {
				// Fallback to mock KPIs if API fails
				setKpis([
					{ label: 'Delay Reduction', value: '23.5', unit: '%', trend: 5.2, color: 'green' },
					{ label: 'Platform Utilization', value: '87.3', unit: '%', trend: 2.1, color: 'blue' },
					{ label: 'Route Efficiency', value: '94.8', unit: '%', trend: 1.8, color: 'purple' },
					{ label: 'Train Density', value: '12.4', unit: 'trains/km', trend: -0.5, color: 'yellow' },
				]);
			}

			// Fetch live trains
			const liveTrainsData = await fetchLiveTrains({
				fromStationCode: selectedStation,
				hours: 2,
			}).catch((err) => {
				console.error('Failed to fetch live trains:', err);
				return null;
			});

			if (liveTrainsData && liveTrainsData.trains && liveTrainsData.trains.length > 0) {
				updateTrainsFromData(liveTrainsData.trains);
				
				// Add events for train updates
				const recentTrain = liveTrainsData.trains[0];
				addEventToLog({
					id: Date.now().toString(),
					timestamp: new Date().toLocaleTimeString(),
					type: 'info',
					message: `Train ${recentTrain.trainNumber} ${recentTrain.trainName || ''} updated`,
				});
			} else {
				// Fallback to mock trains if API fails or returns empty
				if (trains.length === 0) {
					const mockTrains: TrainPosition[] = [
						{ id: '12104', trainNo: '12104', trainName: 'Mumbai Express', lat: 0.35, lon: 0.45, speed: 85, status: 'RUNNING', sectionId: 'S1-Kalyan', delay: 0, platform: '3' },
						{ id: '12110', trainNo: '12110', trainName: 'Pune Shatabdi', lat: 0.55, lon: 0.35, speed: 92, status: 'RUNNING', sectionId: 'S2-Thane', delay: 0, platform: '1' },
						{ id: '12120', trainNo: '12120', trainName: 'Delhi Rajdhani', lat: 0.25, lon: 0.65, speed: 0, status: 'STOPPED', sectionId: 'S3-Kurla', delay: 0, platform: '5' },
						{ id: '12130', trainNo: '12130', trainName: 'Howrah Mail', lat: 0.65, lon: 0.55, speed: 78, status: 'RUNNING', sectionId: 'S4-Dadar', delay: 0, platform: '2' },
						{ id: '12140', trainNo: '12140', trainName: 'Chennai Express', lat: 0.45, lon: 0.25, speed: 0, status: 'DELAYED', sectionId: 'S5-Andheri', delay: 18, platform: '4' },
						{ id: '12150', trainNo: '12150', trainName: 'Bangalore Express', lat: 0.75, lon: 0.40, speed: 88, status: 'RUNNING', sectionId: 'S6-Borivali', delay: 0, platform: '6' },
					];
					setTrains(mockTrains);
				}
			}

			// Fetch alerts
			const alertsData = await fetchAlerts().catch((err) => {
				console.error('Failed to fetch alerts:', err);
				return null;
			});

			if (alertsData && alertsData.alerts && alertsData.alerts.length > 0) {
				alertsData.alerts.slice(0, 3).forEach((alert) => {
					addEventToLog({
						id: alert.id,
						timestamp: new Date(alert.timestamp).toLocaleTimeString(),
						type: alert.severity === 'high' ? 'error' : alert.severity === 'medium' ? 'warning' : 'info',
						message: alert.message,
					});
				});
			}

			setLastUpdated(new Date());
		} catch (error) {
			console.error('Error fetching real-time data:', error);
			addEventToLog({
				id: Date.now().toString(),
				timestamp: new Date().toLocaleTimeString(),
				type: 'error',
				message: 'Failed to fetch real-time data',
			});
		} finally {
			setLoading(false);
		}
	};

	// Initialize with mock data for demonstration
	useEffect(() => {
		// Set initial mock KPIs
		if (kpis.length === 0) {
			setKpis([
				{ label: 'Delay Reduction', value: '23.5', unit: '%', trend: 5.2, color: 'green' },
				{ label: 'Platform Utilization', value: '87.3', unit: '%', trend: 2.1, color: 'blue' },
				{ label: 'Route Efficiency', value: '94.8', unit: '%', trend: 1.8, color: 'purple' },
				{ label: 'Train Density', value: '12.4', unit: 'trains/km', trend: -0.5, color: 'yellow' },
			]);
		}

				// Set initial mock trains if no trains loaded
				if (trains.length === 0) {
					const mockTrains: TrainPosition[] = [
						{ id: '12104', trainNo: '12104', trainName: 'Mumbai Superfast', trainType: 'SUPERFAST', lat: 0.35, lon: 0.45, speed: 85, status: 'RUNNING', sectionId: 'S1-Kalyan (KYN)', delay: 0, platform: '3' },
						{ id: '12110', trainNo: '12110', trainName: 'Pune Shatabdi', trainType: 'SHATABDI', lat: 0.55, lon: 0.35, speed: 92, status: 'RUNNING', sectionId: 'S2-Thane (TNA)', delay: 0, platform: '1' },
						{ id: '12120', trainNo: '12120', trainName: 'Delhi Rajdhani', trainType: 'RAJDHANI', lat: 0.25, lon: 0.65, speed: 0, status: 'STOPPED', sectionId: 'S3-Kurla (CLA)', delay: 0, platform: '5' },
						{ id: '12130', trainNo: '12130', trainName: 'Howrah Superfast', trainType: 'SUPERFAST', lat: 0.65, lon: 0.55, speed: 78, status: 'RUNNING', sectionId: 'S4-Dadar (DR)', delay: 0, platform: '2' },
						{ id: '12140', trainNo: '12140', trainName: 'Chennai Superfast', trainType: 'SUPERFAST', lat: 0.45, lon: 0.25, speed: 0, status: 'DELAYED', sectionId: 'S5-Andheri (ADH)', delay: 18, platform: '4' },
						{ id: '12150', trainNo: '12150', trainName: 'Bangalore Superfast', trainType: 'SUPERFAST', lat: 0.75, lon: 0.40, speed: 88, status: 'RUNNING', sectionId: 'S6-Borivali (BVI)', delay: 0, platform: '6' },
						{ id: '14321', trainNo: '14321', trainName: 'Local Passenger', trainType: 'PASSENGER', lat: 0.50, lon: 0.60, speed: 45, status: 'RUNNING', sectionId: 'S7-Vashi', delay: 0, platform: '7' },
						{ id: 'F902', trainNo: 'F902', trainName: 'Freight Goods', trainType: 'GOODS', lat: 0.30, lon: 0.50, speed: 60, status: 'RUNNING', sectionId: 'S8-Panvel', delay: 0 },
					];
					setTrains(mockTrains);
				}

		// Set initial event log
		if (eventLog.length === 0) {
			const mockEvents: EventLogEntry[] = [
				{ id: '1', timestamp: new Date().toLocaleTimeString(), type: 'info', message: 'Train 12104 arrived at Kalyan Junction (KYN)' },
				{ id: '2', timestamp: new Date().toLocaleTimeString(), type: 'success', message: 'Signal S12 cleared for Train 12110 at Thane (TNA)' },
				{ id: '3', timestamp: new Date().toLocaleTimeString(), type: 'info', message: 'Crossing scheduled at Kurla Junction (CLA)' },
				{ id: '4', timestamp: new Date().toLocaleTimeString(), type: 'success', message: 'Disruption resolved in Section S4 - Dadar (DR)' },
				{ id: '5', timestamp: new Date().toLocaleTimeString(), type: 'warning', message: 'Train 12140 delayed by 18 minutes at Andheri (ADH)' },
			];
			setEventLog(mockEvents);
		}
	}, []);

	// Save initial train positions when trains are first loaded
	useEffect(() => {
		if (trains.length > 0 && initialTrainPositions.length === 0) {
			setInitialTrainPositions(trains.map(t => ({ ...t })));
		}
	}, [trains.length]); // Only trigger when trains are first loaded

	// Initial data fetch and periodic updates
	useEffect(() => {
		fetchRealTimeData();
		const updateInterval = isSimulating ? 5000 : 30000; // Update every 5s when simulating, 30s otherwise
		const interval = setInterval(fetchRealTimeData, updateInterval);
		return () => clearInterval(interval);
	}, [selectedStation, isSimulating]);

	// Map data and train positions are now handled by RailwaySchematicMap component

	// Simulation loop - animates all trains
	useEffect(() => {
		if (!isSimulating) {
			if (animationFrameRef.current) {
				cancelAnimationFrame(animationFrameRef.current);
			}
			return;
		}

		let lastUpdateTime = Date.now();
		const updateSimulation = () => {
			const currentTime = Date.now();
			const deltaTime = (currentTime - lastUpdateTime) / 1000; // Convert to seconds
			lastUpdateTime = currentTime;

			setTrains((prevTrains) =>
				prevTrains.map((train) => {
					// Only move running trains
					if (train.status === 'RUNNING' && train.speed > 0) {
						// Calculate movement based on speed (km/h converted to canvas units per second)
						// Speed in km/h, convert to movement per second
						// Assuming 1 canvas unit = ~10km, so 100 km/h = 0.1 units per second at 1x speed
						const speedMultiplier = simulationSpeed;
						const movementPerSecond = (train.speed / 100) * 0.001 * speedMultiplier;
						const movement = movementPerSecond * deltaTime;

						// Move train along a path (simulate track movement)
						// Use a simple directional movement pattern
						let newLat = train.lat;
						let newLon = train.lon;

						// Determine movement direction based on current position (simulate track routing)
						// Trains move in a pattern: some go left-right, some go up-down, some diagonal
						const trainIdHash = train.id.charCodeAt(0) + train.id.charCodeAt(train.id.length - 1);
						const direction = trainIdHash % 4;

						switch (direction) {
							case 0: // Move right
								newLon = Math.min(0.95, train.lon + movement);
								break;
							case 1: // Move left
								newLon = Math.max(0.05, train.lon - movement);
								break;
							case 2: // Move down
								newLat = Math.min(0.95, train.lat + movement);
								break;
							case 3: // Move up
								newLat = Math.max(0.05, train.lat - movement);
								break;
						}

						// Boundary checks
						newLat = Math.max(0.05, Math.min(0.95, newLat));
						newLon = Math.max(0.05, Math.min(0.95, newLon));

						return { ...train, lat: newLat, lon: newLon };
					}
					// Handle delayed trains - they might start moving after delay
					else if (train.status === 'DELAYED' && train.delay && train.delay > 0) {
						// Reduce delay over time (1 minute per 2 seconds of simulation at 1x speed)
						const delayReduction = deltaTime * (30 / simulationSpeed); // 30 seconds per real second
						const newDelay = Math.max(0, (train.delay || 0) - delayReduction);
						
						if (newDelay <= 0) {
							// Delay cleared, train can resume
							return { ...train, status: 'RUNNING' as const, delay: 0 };
						}
						return { ...train, delay: newDelay };
					}
					return train;
				})
			);

			// Occasionally add simulation events
			if (Math.random() > 0.98) {
				const runningTrains = trains.filter(t => t.status === 'RUNNING');
				if (runningTrains.length > 0) {
					const randomTrain = runningTrains[Math.floor(Math.random() * runningTrains.length)];
					const events: EventLogEntry[] = [
						{ 
							id: Date.now().toString(), 
							timestamp: new Date().toLocaleTimeString(), 
							type: 'info', 
							message: `Train ${randomTrain.trainNo} (${randomTrain.trainName || ''}) moving at ${randomTrain.speed} km/h` 
						},
					];
					setEventLog((prev) => [...events, ...prev.slice(0, 19)]);
				}
			}

			animationFrameRef.current = requestAnimationFrame(updateSimulation);
		};

		animationFrameRef.current = requestAnimationFrame(updateSimulation);
		return () => {
			if (animationFrameRef.current) {
				cancelAnimationFrame(animationFrameRef.current);
			}
		};
	}, [isSimulating, simulationSpeed]);

	const handleStartSimulation = () => {
		setIsSimulating(true);
		addEventToLog({
			id: Date.now().toString(),
			timestamp: new Date().toLocaleTimeString(),
			type: 'success',
			message: 'Simulation started',
		});
	};

	const handlePauseSimulation = () => {
		setIsSimulating(false);
		addEventToLog({
			id: Date.now().toString(),
			timestamp: new Date().toLocaleTimeString(),
			type: 'info',
			message: 'Simulation paused',
		});
	};

	const handleStopSimulation = () => {
		setIsSimulating(false);
		// Reset trains to initial positions if available
		if (initialTrainPositions.length > 0) {
			setTrains([...initialTrainPositions]);
		}
		addEventToLog({
			id: Date.now().toString(),
			timestamp: new Date().toLocaleTimeString(),
			type: 'warning',
			message: 'Simulation stopped - all trains reset to initial positions',
		});
	};

	const handleReset = () => {
		setIsSimulating(false);
		// Reset trains to initial positions if available
		if (initialTrainPositions.length > 0) {
			setTrains([...initialTrainPositions]);
			addEventToLog({
				id: Date.now().toString(),
				timestamp: new Date().toLocaleTimeString(),
				type: 'info',
				message: 'Simulation reset - all trains restored to initial positions',
			});
		} else {
			fetchRealTimeData(); // Refresh data if no initial positions saved
			addEventToLog({
				id: Date.now().toString(),
				timestamp: new Date().toLocaleTimeString(),
				type: 'info',
				message: 'Simulation reset - data refreshed',
			});
		}
	};

	const handleLoadScenario = () => {
		addEventToLog({
			id: Date.now().toString(),
			timestamp: new Date().toLocaleTimeString(),
			type: 'info',
			message: 'Scenario loaded: Peak Hours',
		});
	};

	const handleApplyDelay = async () => {
		// Apply delay to all running trains
		const affectedTrains: string[] = [];
		setTrains((prev) =>
			prev.map((t) => {
				if (t.status === 'RUNNING') {
					affectedTrains.push(t.trainNo);
					return { ...t, status: 'DELAYED' as const, delay: (t.delay || 0) + delayMinutes };
				}
				return t;
			})
		);
		
		if (affectedTrains.length > 0) {
			// Record override for each affected train
			for (const trainNo of affectedTrains) {
				await addOverride({
					controller_id: controllerId,
					train_id: trainNo,
					action: `APPLY_DELAY_${delayMinutes}min`,
					ai_action: 'CONTINUE',
					reason: `Controller applied ${delayMinutes} minute delay to train ${trainNo} in simulation`,
					source: 'simulation',
				});
			}

			addEventToLog({
				id: Date.now().toString(),
				timestamp: new Date().toLocaleTimeString(),
				type: 'warning',
				message: `Delay of ${delayMinutes} minutes applied to ${affectedTrains.length} train(s): ${affectedTrains.slice(0, 3).join(', ')}${affectedTrains.length > 3 ? '...' : ''}`,
			});
		} else {
			addEventToLog({
				id: Date.now().toString(),
				timestamp: new Date().toLocaleTimeString(),
				type: 'info',
				message: 'No running trains to apply delay to',
			});
		}
	};

	const handleChangeSpeed = async () => {
		if (selectedTrain) {
			const train = trains.find((t) => t.id === selectedTrain);
			if (train) {
				setTrains((prev) =>
					prev.map((t) =>
						t.id === selectedTrain ? { ...t, speed: speedKmh } : t
					)
				);

				// Record override
				await addOverride({
					controller_id: controllerId,
					train_id: train.trainNo,
					action: `CHANGE_SPEED_${speedKmh}kmh`,
					ai_action: 'MAINTAIN_SPEED',
					reason: `Controller changed speed to ${speedKmh} km/h for train ${train.trainNo} in simulation`,
					source: 'simulation',
				});

				addEventToLog({
					id: Date.now().toString(),
					timestamp: new Date().toLocaleTimeString(),
					type: 'info',
					message: `Speed changed to ${speedKmh} km/h for Train ${train.trainNo}`,
				});
				setShowTrainModal(false);
				setSelectedTrain(null);
			}
		}
	};

	const handleHoldTrain = async () => {
		if (selectedTrain) {
			const train = trains.find((t) => t.id === selectedTrain);
			if (train) {
				setTrains((prev) =>
					prev.map((t) =>
						t.id === selectedTrain
							? { ...t, status: 'STOPPED' as const, speed: 0 }
							: t
					)
				);

				// Record override
				await addOverride({
					controller_id: controllerId,
					train_id: train.trainNo,
					action: `HOLD_TRAIN_${holdMinutes}min`,
					ai_action: 'CONTINUE',
					reason: `Controller held train ${train.trainNo} for ${holdMinutes} minutes in simulation`,
					source: 'simulation',
				});

				addEventToLog({
					id: Date.now().toString(),
					timestamp: new Date().toLocaleTimeString(),
					type: 'warning',
					message: `Train ${train.trainNo} held for ${holdMinutes} minutes`,
				});
				// Auto-resume after hold duration
				setTimeout(() => {
					setTrains((prev) =>
						prev.map((t) =>
							t.id === selectedTrain
								? { ...t, status: 'RUNNING' as const, speed: train.speed }
								: t
						)
					);
					addEventToLog({
						id: Date.now().toString(),
						timestamp: new Date().toLocaleTimeString(),
						type: 'success',
						message: `Train ${train.trainNo} resumed after hold`,
					});
				}, holdMinutes * 60 * 1000);
				setShowTrainModal(false);
				setSelectedTrain(null);
			}
		}
	};

	const handleEmergencyPriority = async () => {
		if (selectedTrain) {
			const train = trains.find((t) => t.id === selectedTrain);
			if (train) {
				setTrains((prev) =>
					prev.map((t) =>
						t.id === selectedTrain
							? { ...t, status: 'RUNNING' as const, speed: 120 } // Max speed for emergency
							: t
					)
				);

				// Record override
				await addOverride({
					controller_id: controllerId,
					train_id: train.trainNo,
					action: 'EMERGENCY_PRIORITY',
					ai_action: 'NORMAL_PRIORITY',
					reason: `Controller activated emergency priority for train ${train.trainNo} in simulation - all other trains must yield`,
					source: 'simulation',
				});

				addEventToLog({
					id: Date.now().toString(),
					timestamp: new Date().toLocaleTimeString(),
					type: 'error',
					message: `Emergency priority activated for Train ${train.trainNo} - All other trains must yield`,
				});
				setShowTrainModal(false);
				setSelectedTrain(null);
			}
		}
	};

	const handleWeatherChange = () => {
		// Weather change affects all trains - reduce speed for safety
		const weatherConditions = ['Light Rain', 'Heavy Rain', 'Fog', 'Clear'];
		const randomWeather = weatherConditions[Math.floor(Math.random() * weatherConditions.length)];
		
		setTrains((prev) =>
			prev.map((t) => {
				if (t.status === 'RUNNING' && t.speed > 0) {
					// Reduce speed by 10-20% depending on weather severity
					const speedReduction = randomWeather === 'Heavy Rain' || randomWeather === 'Fog' ? 0.2 : 0.1;
					const newSpeed = Math.max(30, Math.floor(t.speed * (1 - speedReduction)));
					return { ...t, speed: newSpeed };
				}
				return t;
			})
		);
		
		addEventToLog({
			id: Date.now().toString(),
			timestamp: new Date().toLocaleTimeString(),
			type: 'warning',
			message: `Weather condition changed to: ${randomWeather} - All trains speed reduced for safety`,
		});
	};

	const handleRefresh = () => {
		fetchRealTimeData();
		addEventToLog({
			id: Date.now().toString(),
			timestamp: new Date().toLocaleTimeString(),
			type: 'info',
			message: 'Manual refresh triggered',
		});
	};

	// Smart Train Prioritization Suggestions
	const prioritizationSuggestions: PrioritizationSuggestion[] = [
		{
			id: '1',
			action: 'give_precedence: Express 2215 before Passenger 1432 at New Delhi (NDLS)',
			impact: 'saves ~45 mins cumulative delay, throughput +3%, fuel -2%',
			reason: 'Express 2215 has higher passenger load and priority status. Giving precedence reduces overall network delay and improves fuel efficiency by avoiding unnecessary stops.',
		},
		{
			id: '2',
			action: 'hold_train: Freight F902 for 6 mins at Bina Junction (BINA)',
			impact: 'ensures on-time arrival of Shatabdi 12002, prevents platform conflict',
			reason: 'Shatabdi 12002 is a high-priority passenger train arriving at the same platform. Brief hold of freight train prevents platform conflict and ensures passenger service punctuality.',
		},
		{
			id: '3',
			action: 'reroute: Passenger 1735 → Platform 3 at Itarsi Junction (ET)',
			impact: 'avoids clash with Express 2299 arriving in 5 mins',
			reason: 'Express 2299 is scheduled to arrive at Platform 2 where Passenger 1735 is currently routed. Rerouting to Platform 3 prevents scheduling conflict and maintains service flow.',
		},
		{
			id: '4',
			action: 'regulate_speed: Passenger 1207 → 50 km/h for next 12 km between Kalyan (KYN) and Thane (TNA)',
			impact: 'prevents bunching with Intercity 1311, saves ~8 mins downstream',
			reason: 'Speed regulation prevents train bunching with Intercity 1311 on the same section. This optimization reduces downstream delays and improves overall section throughput.',
		},
		{
			id: '5',
			action: 'emergency_priority: Medical Relief Train MRT-07 at Mumbai Central (BCT)',
			impact: 'clear single-line section immediately, emergency handling',
			reason: 'Medical Relief Train MRT-07 requires immediate priority clearance for emergency medical transport. All other trains must yield to ensure timely delivery of critical supplies.',
		},
	];

	const visiblePrioritizationSuggestions = prioritizationSuggestions.filter(s => !prioritizationDismissedIds.has(s.id));

	const handlePrioritizationAccept = async (suggestion: PrioritizationSuggestion) => {
		console.log('Accepted prioritization:', suggestion);
		setPrioritizationDismissedIds(prev => new Set([...prev, suggestion.id]));
		setFeedbackCount((prev) => ({ ...prev, accepted: prev.accepted + 1 }));
		
		// Extract train ID from suggestion action
		const trainMatch = suggestion.action.match(/Train\s+(\w+)/i) || suggestion.action.match(/(\d{5})/);
		const trainId = trainMatch ? trainMatch[1] : 'UNKNOWN';

		// Record override (accepting AI recommendation)
		await addOverride({
			controller_id: controllerId,
			train_id: trainId,
			action: suggestion.action,
			ai_action: suggestion.action,
			reason: `Controller accepted AI recommendation: ${suggestion.reason || suggestion.impact}`,
			source: 'simulation',
		});
		
		// Show success toast
		setSuccessMessage(`✅ Applied successfully: ${suggestion.action}`);
		setShowSuccessToast(true);
		setTimeout(() => {
			setShowSuccessToast(false);
		}, 3000);
		
		addEventToLog({
			id: Date.now().toString(),
			timestamp: new Date().toLocaleTimeString(),
			type: 'success',
			message: `Prioritization action accepted: ${suggestion.action}`,
		});
	};

	const handlePrioritizationOverride = (suggestion: PrioritizationSuggestion) => {
		// Parse the action to extract hold information
		let holdMinutes = 0;
		let location = '';
		let trainNo = '';

		// Parse different action types
		if (suggestion.action.includes('hold_train:')) {
			// Format: "hold_train: Freight F902 for 6 mins at Bina Junction (BINA)"
			const holdMatch = suggestion.action.match(/hold_train:\s*([^f]+)\s+for\s+(\d+)\s+mins?\s+at\s+(.+)/i);
			if (holdMatch) {
				trainNo = holdMatch[1].trim();
				holdMinutes = parseInt(holdMatch[2]) || 0;
				location = holdMatch[3].trim();
			}
		} else if (suggestion.action.includes('give_precedence:')) {
			// Format: "give_precedence: Express 2215 before Passenger 1432 at New Delhi (NDLS)"
			const precedenceMatch = suggestion.action.match(/give_precedence:\s*(.+?)\s+before\s+(.+?)\s+at\s+(.+)/i);
			if (precedenceMatch) {
				trainNo = precedenceMatch[2].trim(); // The train that needs to be held
				holdMinutes = 5; // Default hold time for precedence
				location = precedenceMatch[3].trim(); // Extract location from action
			} else {
				// Fallback for old format without location
				const oldPrecedenceMatch = suggestion.action.match(/give_precedence:\s*(.+?)\s+before\s+(.+)/i);
				if (oldPrecedenceMatch) {
					trainNo = oldPrecedenceMatch[2].trim();
					holdMinutes = 5;
					location = 'New Delhi (NDLS)'; // Default to major station
				}
			}
		} else if (suggestion.action.includes('reroute:')) {
			// Format: "reroute: Passenger 1735 → Platform 3 at Itarsi Junction (ET)"
			const rerouteMatch = suggestion.action.match(/reroute:\s*(.+?)\s+→\s+.+?\s+at\s+(.+)/i);
			if (rerouteMatch) {
				trainNo = rerouteMatch[1].trim();
				location = rerouteMatch[2].trim();
				holdMinutes = 3; // Default hold for rerouting
			}
		} else if (suggestion.action.includes('regulate_speed:')) {
			// Format: "regulate_speed: Passenger 1207 → 50 km/h for next 12 km between Kalyan (KYN) and Thane (TNA)"
			const speedMatch = suggestion.action.match(/regulate_speed:\s*(.+?)\s+→/i);
			if (speedMatch) {
				trainNo = speedMatch[1].trim();
				holdMinutes = 0; // Speed regulation doesn't require hold
				// Try to extract location from the action
				const locationMatch = suggestion.action.match(/between\s+(.+)/i);
				location = locationMatch ? locationMatch[1].trim() : 'In Transit';
			}
		} else if (suggestion.action.includes('emergency_priority:')) {
			// Format: "emergency_priority: Medical Relief Train MRT-07 at Mumbai Central (BCT)"
			const emergencyMatch = suggestion.action.match(/emergency_priority:\s*(.+?)\s+at\s+(.+)/i);
			if (emergencyMatch) {
				trainNo = emergencyMatch[1].trim();
				location = emergencyMatch[2].trim();
				holdMinutes = 0; // Emergency priority doesn't require hold
			}
		}

		// Always show override modal, even if no hold information
		// If no hold info found, use defaults
		if (!location) {
			location = 'Current Location';
		}
		if (holdMinutes === 0 && (suggestion.action.includes('give_precedence:') || suggestion.action.includes('reroute:'))) {
			holdMinutes = 5; // Default hold for precedence/reroute
		}
		
		setOverrideDetails({ 
			minutes: holdMinutes, 
			location, 
			trainNo: trainNo || suggestion.action.split(':')[1]?.trim().split(' ')[0] || 'Train', 
			suggestionId: suggestion.id 
		});
		setEditableHoldDuration(holdMinutes > 0 ? holdMinutes : 5); // Initialize editable duration with default if needed
		setShowOverrideModal(true);
	};

	const handleConfirmOverride = async (suggestionId: string) => {
		if (overrideDetails) {
			// Use the editable hold duration instead of the original
			const finalHoldDuration = editableHoldDuration > 0 ? editableHoldDuration : 0;
			
			// Apply the hold to the train if it exists and hold duration > 0
			if (finalHoldDuration > 0) {
				const trainToHold = trains.find(t => 
					t.trainNo === overrideDetails.trainNo || 
					t.trainName?.includes(overrideDetails.trainNo.split(' ')[0])
				);
				
				if (trainToHold) {
					setTrains((prev) =>
						prev.map((t) =>
							t.id === trainToHold.id
								? { ...t, status: 'STOPPED' as const, speed: 0 }
								: t
						)
					);
					
					// Auto-resume after hold duration (using editable duration)
					setTimeout(() => {
						setTrains((prev) =>
							prev.map((t) =>
								t.id === trainToHold.id
									? { ...t, status: 'RUNNING' as const, speed: trainToHold.speed }
									: t
							)
						);
						addEventToLog({
							id: Date.now().toString(),
							timestamp: new Date().toLocaleTimeString(),
							type: 'success',
							message: `Train ${trainToHold.trainNo} resumed after ${finalHoldDuration} minute hold`,
						});
					}, finalHoldDuration * 60 * 1000);
				}

				// Record override
				await addOverride({
					controller_id: controllerId,
					train_id: overrideDetails.trainNo,
					action: `OVERRIDE_HOLD_${finalHoldDuration}min`,
					ai_action: 'CONTINUE',
					reason: `Controller overrode AI recommendation and held train ${overrideDetails.trainNo} for ${finalHoldDuration} minutes at ${overrideDetails.location}`,
					source: 'simulation',
				});

				// Show success toast (using editable duration)
				setSuccessMessage(`✅ Override successful: Hold ${overrideDetails.trainNo} for ${finalHoldDuration} min at ${overrideDetails.location}`);
			} else {
				// Record override (no hold, just override)
				await addOverride({
					controller_id: controllerId,
					train_id: overrideDetails.trainNo,
					action: 'OVERRIDE_RECOMMENDATION',
					ai_action: 'AI_RECOMMENDATION',
					reason: `Controller overrode AI recommendation for train ${overrideDetails.trainNo} at ${overrideDetails.location}`,
					source: 'simulation',
				});

				// No hold, just override
				setSuccessMessage(`✅ Override successful: Recommendation overridden for ${overrideDetails.trainNo} at ${overrideDetails.location}`);
			}
			
			setShowSuccessToast(true);
			setTimeout(() => {
				setShowSuccessToast(false);
			}, 3000);

			if (finalHoldDuration > 0) {
				addEventToLog({
					id: Date.now().toString(),
					timestamp: new Date().toLocaleTimeString(),
					type: 'warning',
					message: `Override confirmed: Hold Train ${overrideDetails.trainNo} for ${finalHoldDuration} minutes at ${overrideDetails.location}`,
				});
			} else {
				addEventToLog({
					id: Date.now().toString(),
					timestamp: new Date().toLocaleTimeString(),
					type: 'warning',
					message: `Override confirmed: Recommendation overridden for ${overrideDetails.trainNo} at ${overrideDetails.location}`,
				});
			}
		}

		setPrioritizationDismissedIds(prev => new Set([...prev, suggestionId]));
		setFeedbackCount((prev) => ({ ...prev, overridden: prev.overridden + 1 }));
		setShowOverrideModal(false);
		setOverrideDetails(null);
		setEditableHoldDuration(0);
	};

	const handlePrioritizationWhy = (id: string) => {
		setPrioritizationExpandedId(prioritizationExpandedId === id ? null : id);
	};

	const getEventIcon = (type: string) => {
		switch (type) {
			case 'success':
				return <CheckCircle2 className="w-4 h-4 text-green-600" />;
			case 'warning':
				return <AlertCircle className="w-4 h-4 text-yellow-600" />;
			case 'error':
				return <AlertCircle className="w-4 h-4 text-red-600" />;
			default:
				return <Activity className="w-4 h-4 text-blue-600" />;
		}
	};

	const getKPIColor = (color: string) => {
		switch (color) {
			case 'green':
				return 'from-green-500 to-emerald-600';
			case 'blue':
				return 'from-blue-500 to-blue-600';
			case 'yellow':
				return 'from-yellow-500 to-amber-600';
			case 'purple':
				return 'from-purple-500 to-purple-600';
			default:
				return 'from-blue-500 to-blue-600';
		}
	};

	const getTrainTypeColor = (trainType?: string, status?: string) => {
		// If train is stopped or delayed, use status-based colors
		if (status === 'STOPPED') return '#6b7280'; // Gray
		if (status === 'DELAYED') return '#ef4444'; // Red
		
		// Otherwise use train type colors
		switch (trainType) {
			case 'SUPERFAST':
				return '#ef4444'; // Red
			case 'PASSENGER':
				return '#10b981'; // Green
			case 'GOODS':
				return '#06b6d4'; // Cyan/Bright Blue for better visibility
			case 'EXPRESS':
				return '#3b82f6'; // Blue (fallback for express)
			case 'SHATABDI':
				return '#8b5cf6'; // Purple
			case 'RAJDHANI':
				return '#f59e0b'; // Amber/Gold
			default:
				return '#10b981'; // Default green
		}
	};

	const getTrainTypeLabel = (trainType?: string) => {
		switch (trainType) {
			case 'SUPERFAST':
				return 'Superfast';
			case 'EXPRESS':
				return 'Express';
			case 'SHATABDI':
				return 'Shatabdi';
			case 'RAJDHANI':
				return 'Rajdhani';
			case 'PASSENGER':
				return 'Passenger';
			case 'GOODS':
				return 'Goods';
			default:
				return 'Train';
		}
	};

	return (
		<div className="min-h-screen bg-gradient-to-br from-blue-50 via-blue-100 to-indigo-50 p-4 md:p-6">
			{/* Success Toast Notification */}
			{showSuccessToast && (
				<div className="fixed top-4 right-4 z-[100] animate-slide-in-right">
					<div className="bg-white rounded-lg shadow-2xl border-2 border-green-500 p-4 flex items-center gap-3 min-w-[300px] max-w-md">
						<CheckCircle2 className="w-6 h-6 text-green-600 flex-shrink-0" />
						<p className="text-gray-800 font-medium flex-1">{successMessage}</p>
						<button
							onClick={() => setShowSuccessToast(false)}
							className="text-gray-400 hover:text-gray-600 transition-colors"
						>
							<X className="w-5 h-5" />
						</button>
					</div>
				</div>
			)}

			{/* Hero Title */}
			<div className="mb-6 text-center">
				<div className="flex items-center justify-between mb-4">
					<h1 className="text-3xl md:text-4xl lg:text-5xl font-bold text-gray-900">
						Digital Twin & Simulation System
					</h1>
					<div className="flex items-center gap-2">
						{/* Overrides view removed per request */}
						<button
							onClick={handleRefresh}
							disabled={loading}
							className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
						>
							<RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
							<span className="hidden md:inline">Refresh</span>
						</button>
					</div>
				</div>
				<div className="flex items-center justify-center gap-2 text-sm text-gray-600 flex-wrap">
					<div className="flex items-center gap-1">
						<div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`}></div>
						<span>WebSocket: {isConnected ? 'Connected' : 'Disconnected'}</span>
					</div>
					<span>•</span>
					<div className="flex items-center gap-1">
						<div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
						<span>System Health: Operational</span>
					</div>
					<span>•</span>
					<div className="flex items-center gap-1">
						<Brain className="w-4 h-4 text-purple-500" />
						<span>AI Engine: Active</span>
					</div>
					<span>•</span>
					<div className="flex items-center gap-1">
						<Clock className="w-4 h-4 text-blue-500" />
						<span>Last Sync: {lastUpdated.toLocaleTimeString()}</span>
					</div>
					<span>•</span>
					<div className="flex items-center gap-1">
						<span className="text-xs">Station:</span>
						<select
							value={selectedStation}
							onChange={(e) => setSelectedStation(e.target.value)}
							className="text-xs border border-gray-300 rounded px-2 py-1 bg-white"
						>
							<option value="MMCT">MMCT (Mumbai Central)</option>
							<option value="PUNE">PUNE (Pune Division)</option>
							<option value="NGP">NGP (Nagpur Division)</option>
							<option value="SUR">SUR (Solapur Division)</option>
							<option value="BSL">BSL (Bhusaval Division)</option>
						</select>
					</div>
				</div>
			</div>

			{/* Digital Twin Map - At the Top */}
			<div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6 mb-6">
				{/* Digital Twin Panel - Larger Size (2/3 width) */}
				<div className="lg:col-span-2 bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden">
					<div className="bg-blue-600 px-6 py-4">
						<div className="flex items-center justify-between flex-wrap gap-3">
							<h2 className="text-lg font-bold text-white uppercase tracking-wide flex items-center gap-2">
								<Train className="w-5 h-5" />
								Digital Twin Visualization
							</h2>
							{/* Train Type Legend */}
							<div className="flex items-center gap-4 text-xs text-white flex-wrap">
								<div className="flex items-center gap-1.5">
									<div className="w-3 h-3 rounded-full bg-red-500"></div>
									<span>Superfast</span>
								</div>
								<div className="flex items-center gap-1.5">
									<div className="w-3 h-3 rounded-full bg-green-500"></div>
									<span>Passenger</span>
								</div>
								<div className="flex items-center gap-1.5">
									<div className="w-3 h-3 rounded-full bg-blue-500"></div>
									<span>Goods</span>
								</div>
							</div>
						</div>
					</div>
					<div className="p-0 relative" style={{ minHeight: '600px', height: '600px' }}>
						{selectedStation ? (
							<RailwaySchematicMap
								division={getDivisionFromStation(selectedStation)}
								selectedTrain={selectedTrain}
								onTrainClick={(trainNo) => {
								setSelectedTrain(trainNo);
								setShowTrainModal(true);
								}}
							/>
						) : (
							<IndiaRailwayMap
								selectedTrain={selectedTrain}
								onTrainClick={(trainNo) => {
								setSelectedTrain(trainNo);
								setShowTrainModal(true);
								}}
							/>
						)}
					</div>

					{/* KPIs Grid - Below Map */}
					<div className="px-4 pb-4 grid grid-cols-4 gap-3">
						{kpis.map((kpi, idx) => (
							<div
								key={idx}
								className={`bg-gradient-to-br ${getKPIColor(kpi.color)} rounded-lg p-4 text-white shadow-md hover:shadow-lg transition-all duration-300 hover:scale-105`}
							>
								<div className="flex items-center justify-between mb-2">
									<span className="text-xs font-medium opacity-90">{kpi.label}</span>
									{kpi.trend !== undefined && (
										<div className="flex items-center gap-1">
											<TrendingUp className="w-3 h-3" />
											<span className="text-xs">{kpi.trend > 0 ? '+' : ''}{kpi.trend}%</span>
										</div>
									)}
								</div>
								<div className="flex items-baseline gap-1">
									<span className="text-2xl font-bold">{kpi.value}</span>
									{kpi.unit && <span className="text-sm opacity-90">{kpi.unit}</span>}
								</div>
							</div>
						))}
					</div>
				</div>

				{/* Simulation Panel - Right Side (1/3 width) */}
				<div className="lg:col-span-1 bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden flex flex-col">
					<div className="bg-gradient-to-r from-indigo-600 to-purple-700 px-6 py-4">
						<h2 className="text-xl font-bold text-white uppercase tracking-wide flex items-center gap-2">
							<Zap className="w-5 h-5" />
							Simulation
						</h2>
					</div>

					{/* Simulation Controls */}
					<div className="p-4">
						<div className="grid grid-cols-3 gap-3 mb-4">
							<button
								onClick={isSimulating ? handlePauseSimulation : handleStartSimulation}
								className={`flex flex-col items-center justify-center gap-2 p-4 rounded-lg border-2 transition-all duration-300 ${
									isSimulating
										? 'bg-yellow-50 border-yellow-300 text-yellow-700 hover:bg-yellow-100'
										: 'bg-green-50 border-green-300 text-green-700 hover:bg-green-100'
								}`}
							>
								{isSimulating ? (
									<Pause className="w-6 h-6" />
								) : (
									<Play className="w-6 h-6" />
								)}
								<span className="text-xs font-semibold">
									{isSimulating ? 'Pause' : 'Start'}
								</span>
							</button>

							<button
								onClick={handleStopSimulation}
								className="flex flex-col items-center justify-center gap-2 p-4 rounded-lg border-2 border-red-300 bg-red-50 text-red-700 hover:bg-red-100 transition-all duration-300"
							>
								<Square className="w-6 h-6" />
								<span className="text-xs font-semibold">Stop</span>
							</button>

							<button
								onClick={handleReset}
								className="flex flex-col items-center justify-center gap-2 p-4 rounded-lg border-2 border-gray-300 bg-gray-50 text-gray-700 hover:bg-gray-100 transition-all duration-300"
							>
								<RotateCcw className="w-6 h-6" />
								<span className="text-xs font-semibold">Reset</span>
							</button>

							<button
								onClick={handleLoadScenario}
								className="flex flex-col items-center justify-center gap-2 p-4 rounded-lg border-2 border-blue-300 bg-blue-50 text-blue-700 hover:bg-blue-100 transition-all duration-300"
							>
								<FolderOpen className="w-6 h-6" />
								<span className="text-xs font-semibold">Load Scenario</span>
							</button>

							<button
								onClick={handleApplyDelay}
								className="flex flex-col items-center justify-center gap-2 p-4 rounded-lg border-2 border-orange-300 bg-orange-50 text-orange-700 hover:bg-orange-100 transition-all duration-300"
							>
								<Droplet className="w-6 h-6" />
								<span className="text-xs font-semibold">Apply Delay</span>
							</button>

							<button
								onClick={handleWeatherChange}
								className="flex flex-col items-center justify-center gap-2 p-4 rounded-lg border-2 border-cyan-300 bg-cyan-50 text-cyan-700 hover:bg-cyan-100 transition-all duration-300"
							>
								<Cloud className="w-6 h-6" />
								<span className="text-xs font-semibold">Weather Change</span>
							</button>

						</div>

						{/* Event Log */}
						<div className="mt-4">
							<h3 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
								<Activity className="w-4 h-4" />
								Event Log
							</h3>
							<div className="bg-gray-50 border border-gray-200 rounded-lg p-3 h-64 overflow-y-auto space-y-2 font-mono text-xs">
								{eventLog.map((event) => (
									<div
										key={event.id}
										className="flex items-start gap-2 text-gray-700 hover:bg-gray-100 p-2 rounded transition-colors"
									>
										{getEventIcon(event.type)}
										<span className="text-gray-500 min-w-[60px]">{event.timestamp}</span>
										<span className="flex-1 text-gray-800">{event.message}</span>
									</div>
								))}
							</div>
						</div>
					</div>
				</div>
			</div>

			{/* Smart Train Prioritization Panel - Side by Side with Architecture Status */}
			<div className="mb-4 grid grid-cols-1 lg:grid-cols-3 gap-4">
				{/* Smart Train Prioritization - Takes 2/3 width */}
				<div className="lg:col-span-2 bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden">
					<div className="bg-gradient-to-r from-emerald-600 to-teal-700 px-6 py-4">
						<h2 className="text-xl font-bold text-white uppercase tracking-wide flex items-center gap-2">
							<Train className="w-5 h-5" />
							Smart Train Prioritization
							<span className="ml-auto text-sm font-normal normal-case opacity-90">
								{visiblePrioritizationSuggestions.length} Active Suggestions
							</span>
						</h2>
					</div>
					<div className="p-6 max-h-96 overflow-y-auto">
						{visiblePrioritizationSuggestions.length === 0 ? (
							<div className="text-center py-8 text-gray-500 text-sm">
								No prioritization suggestions at this time.
							</div>
						) : (
							<div className="space-y-4">
								{visiblePrioritizationSuggestions.map((suggestion) => (
									<div
										key={suggestion.id}
										className="bg-gray-50 border border-gray-200 rounded-xl p-4 hover:shadow-md transition-shadow"
									>
										<div className="flex items-start justify-between gap-4">
											<div className="flex-1 min-w-0">
												<div className="font-semibold text-gray-900 mb-1 text-sm">
													{suggestion.action}
												</div>
												<div className="text-sm text-gray-600">
													{suggestion.impact}
												</div>
												{prioritizationExpandedId === suggestion.id && suggestion.reason && (
													<div className="mt-3 p-3 bg-blue-50 rounded-lg text-sm text-gray-700 border border-blue-200">
														<div className="flex items-start gap-2">
															<Info className="h-4 w-4 text-blue-600 mt-0.5 flex-shrink-0" />
															<span>{suggestion.reason}</span>
														</div>
													</div>
												)}
											</div>
											<div className="flex items-center gap-2 flex-shrink-0">
												<button
													onClick={() => handlePrioritizationWhy(suggestion.id)}
													className="text-xs text-blue-600 hover:text-blue-800 font-medium px-3 py-1.5 rounded transition-colors border border-blue-300 hover:bg-blue-50"
												>
													Why?
												</button>
												<button
													onClick={() => handlePrioritizationAccept(suggestion)}
													className="bg-green-600 hover:bg-green-700 text-white text-xs font-semibold px-4 py-2 rounded-lg transition-colors"
												>
													Accept
												</button>
												<button
													onClick={() => {
														// Store suggestion ID for confirmation
														const currentSuggestion = prioritizationSuggestions.find(s => s.id === suggestion.id);
														if (currentSuggestion) {
															handlePrioritizationOverride(currentSuggestion);
														}
													}}
													className="bg-red-600 hover:bg-red-700 text-white text-xs font-semibold px-4 py-2 rounded-lg transition-colors"
												>
													Override
												</button>
											</div>
										</div>
									</div>
								))}
							</div>
						)}
					</div>
				</div>

				{/* Architecture Status Indicators - Takes 1/3 width */}
				<div className="lg:col-span-1 space-y-4">
					{/* Real-time Data Ingestion Status */}
					<div className="bg-white rounded-lg shadow-md p-4 border border-gray-200">
						<div className="flex items-center justify-between mb-2">
							<h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
								<Radio className="w-4 h-4" />
								Data Ingestion
							</h3>
						</div>
						<div className="space-y-1 text-xs">
							<div className="flex items-center justify-between">
								<span className="text-gray-600">WebSocket:</span>
								<span className={`font-semibold ${dataSources.websocket ? 'text-green-600' : 'text-red-600'}`}>
									{dataSources.websocket ? 'Connected' : 'Disconnected'}
								</span>
							</div>
							<div className="flex items-center justify-between">
								<span className="text-gray-600">Sensors:</span>
								<span className={`font-semibold ${dataSources.sensors ? 'text-green-600' : 'text-red-600'}`}>
									{dataSources.sensors ? 'Active' : 'Inactive'}
								</span>
							</div>
							<div className="flex items-center justify-between">
								<span className="text-gray-600">Signals:</span>
								<span className={`font-semibold ${dataSources.signals ? 'text-green-600' : 'text-red-600'}`}>
									{dataSources.signals ? 'Active' : 'Inactive'}
								</span>
							</div>
						</div>
					</div>

					{/* Constraint Optimization Status */}
					<div className="bg-white rounded-lg shadow-md p-4 border border-gray-200">
						<div className="flex items-center justify-between mb-2">
							<h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
								<Shield className="w-4 h-4" />
								Constraints
							</h3>
						</div>
						<div className="space-y-1 text-xs">
							<div className="flex items-center justify-between">
								<span className="text-gray-600">Safety Rules:</span>
								<span className={`font-semibold ${constraintStatus.safety ? 'text-green-600' : 'text-red-600'}`}>
									{constraintStatus.safety ? 'Enforced' : 'Violated'}
								</span>
							</div>
							<div className="flex items-center justify-between">
								<span className="text-gray-600">Platform Alloc:</span>
								<span className={`font-semibold ${constraintStatus.platform ? 'text-green-600' : 'text-red-600'}`}>
									{constraintStatus.platform ? 'Optimized' : 'Conflict'}
								</span>
							</div>
							<div className="flex items-center justify-between">
								<span className="text-gray-600">Scheduling:</span>
								<span className={`font-semibold ${constraintStatus.scheduling ? 'text-green-600' : 'text-red-600'}`}>
									{constraintStatus.scheduling ? 'Valid' : 'Invalid'}
								</span>
							</div>
						</div>
					</div>

					{/* Feedback Loop Status */}
					<div className="bg-white rounded-lg shadow-md p-4 border border-gray-200">
						<div className="flex items-center justify-between mb-2">
							<h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
								<Brain className="w-4 h-4" />
								Feedback Loop
							</h3>
						</div>
						<div className="space-y-1 text-xs">
							<div className="flex items-center justify-between">
								<span className="text-gray-600">Accepted:</span>
								<span className="font-semibold text-green-600">{feedbackCount.accepted}</span>
							</div>
							<div className="flex items-center justify-between">
								<span className="text-gray-600">Overridden:</span>
								<span className="font-semibold text-orange-600">{feedbackCount.overridden}</span>
							</div>
							<div className="flex items-center justify-between">
								<span className="text-gray-600">Learning:</span>
								<span className="font-semibold text-purple-600">Active</span>
							</div>
						</div>
					</div>
				</div>
			</div>

			{/* Bottom Status Bar */}
			<div className="bg-white rounded-xl shadow-lg border border-gray-200 p-4">
				<div className="flex flex-wrap items-center justify-between gap-4 text-sm">
					<div className="flex items-center gap-2">
						<span className="text-gray-600 font-medium">System Health:</span>
						<div className="flex items-center gap-1">
							<div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
							<span className="text-gray-900">Operational</span>
						</div>
					</div>
					<div className="flex items-center gap-2">
						<span className="text-gray-600 font-medium">AI Engine Status:</span>
						<div className="flex items-center gap-1">
							<div className="w-2 h-2 bg-green-500 rounded-full"></div>
							<span className="text-gray-900">AI</span>
						</div>
					</div>
					<div className="flex items-center gap-2">
						<span className="text-gray-600 font-medium">Last Sync Time:</span>
						<span className="text-gray-900">{new Date().toLocaleTimeString()}</span>
					</div>
				</div>
			</div>

			{/* Override Confirmation Modal */}
			{showOverrideModal && overrideDetails && (
				<div 
					className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
					onClick={() => {
						setShowOverrideModal(false);
						setOverrideDetails(null);
					}}
				>
					<div 
						className="bg-white rounded-xl shadow-2xl max-w-md w-full"
						onClick={(e) => e.stopPropagation()}
					>
						<div className="bg-gradient-to-r from-red-600 to-orange-600 px-6 py-4 rounded-t-xl">
							<h2 className="text-xl font-bold text-white flex items-center gap-2">
								<AlertTriangle className="w-5 h-5" />
								Override Confirmation
							</h2>
						</div>
						<div className="p-6">
							<div className="mb-4">
								<p className="text-gray-700 mb-4">
									You are overriding the recommendation. Please confirm the hold details:
								</p>
								<div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 space-y-3">
									<div className="flex items-center justify-between">
										<span className="text-gray-600 font-medium">Train:</span>
										<span className="font-semibold text-gray-900">{overrideDetails.trainNo}</span>
									</div>
									<div className="flex items-center justify-between">
										<span className="text-gray-600 font-medium">Hold Duration:</span>
										<div className="flex items-center gap-2">
											<input
												type="number"
												min="0"
												max="60"
												value={editableHoldDuration}
												onChange={(e) => {
													const value = parseInt(e.target.value) || 0;
													if (value >= 0 && value <= 60) {
														setEditableHoldDuration(value);
													}
												}}
												className="w-20 px-2 py-1 border border-orange-300 rounded-lg text-center font-semibold text-orange-600 focus:outline-none focus:ring-2 focus:ring-orange-500"
											/>
											<span className="text-sm text-gray-600">minutes</span>
										</div>
									</div>
									{editableHoldDuration === 0 && (
										<div className="mt-1 text-xs text-gray-500 italic">
											(No hold required - override only)
										</div>
									)}
									<div className="flex items-center justify-between">
										<span className="text-gray-600 font-medium">Location:</span>
										<span className="font-semibold text-blue-600">{overrideDetails.location}</span>
									</div>
									{editableHoldDuration !== overrideDetails.minutes && (
										<div className="mt-2 text-xs text-gray-500 italic">
											Original: {overrideDetails.minutes} minutes
										</div>
									)}
								</div>
							</div>
							<div className="flex items-center gap-3">
								<button
									onClick={() => {
										if (overrideDetails) {
											handleConfirmOverride(overrideDetails.suggestionId);
										}
									}}
									className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors font-semibold"
								>
									Confirm Override
								</button>
								<button
									onClick={() => {
										setShowOverrideModal(false);
										setOverrideDetails(null);
										setEditableHoldDuration(0);
									}}
									className="flex-1 px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors font-semibold"
								>
									Cancel
								</button>
							</div>
						</div>
					</div>
				</div>
			)}

			{/* Train Action Modal */}
			{showTrainModal && selectedTrain && (
				<div 
					className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
					onClick={() => {
						setShowTrainModal(false);
						setSelectedTrain(null);
					}}
				>
					<div 
						className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto"
						onClick={(e) => e.stopPropagation()}
					>
						{/* Modal Header */}
						<div className="bg-gradient-to-r from-blue-600 to-blue-700 px-6 py-4 rounded-t-xl flex items-center justify-between">
							<h2 className="text-xl font-bold text-white flex items-center gap-2">
								<Train className="w-5 h-5" />
								Train Actions
							</h2>
							<button
								onClick={() => {
									setShowTrainModal(false);
									setSelectedTrain(null);
								}}
								className="text-white hover:text-gray-200 transition-colors"
							>
								<X className="w-5 h-5" />
							</button>
						</div>

						{/* Modal Content */}
						<div className="p-6">
							{trains
								.filter((t) => t.id === selectedTrain)
								.map((train) => (
									<div key={train.id} className="space-y-6">
										{/* Train Details */}
										<div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
											<h3 className="font-semibold text-gray-900 mb-3">Train Information</h3>
											<div className="grid grid-cols-2 gap-3 text-sm">
												<div>
													<span className="text-gray-600">Train No:</span>
													<span className="ml-2 font-semibold">{train.trainNo}</span>
													{train.trainName && (
														<div className="text-xs text-gray-500 mt-1">{train.trainName}</div>
													)}
												</div>
												<div>
													<span className="text-gray-600">Train Type:</span>
													<span 
														className="ml-2 font-semibold inline-flex items-center gap-1"
														style={{ color: getTrainTypeColor(train.trainType, train.status) }}
													>
														<div 
															className="w-3 h-3 rounded-full"
															style={{ backgroundColor: getTrainTypeColor(train.trainType, train.status) }}
														></div>
														{getTrainTypeLabel(train.trainType)}
													</span>
												</div>
												<div>
													<span className="text-gray-600">Current Speed:</span>
													<span className="ml-2 font-semibold">{train.speed} km/h</span>
												</div>
												<div>
													<span className="text-gray-600">Status:</span>
													<span
														className={`ml-2 font-semibold ${
															train.status === 'RUNNING'
																? 'text-green-600'
																: train.status === 'DELAYED'
																? 'text-red-600'
																: 'text-gray-600'
														}`}
													>
														{train.status}
													</span>
												</div>
												<div>
													<span className="text-gray-600">Section:</span>
													<span className="ml-2 font-semibold">{train.sectionId}</span>
												</div>
												{train.delay && train.delay > 0 && (
													<div>
														<span className="text-gray-600">Current Delay:</span>
														<span className="ml-2 font-semibold text-red-600">{train.delay} min</span>
													</div>
												)}
												{train.platform && (
													<div>
														<span className="text-gray-600">Platform:</span>
														<span className="ml-2 font-semibold">{train.platform}</span>
													</div>
												)}
											</div>
										</div>

										{/* Actions */}
										<div className="space-y-4">
											<h3 className="font-semibold text-gray-900">Available Actions</h3>

											{/* Apply Delay */}
											<div className="border border-gray-200 rounded-lg p-4">
												<div className="flex items-center gap-2 mb-3">
													<Timer className="w-5 h-5 text-orange-600" />
													<span className="font-semibold text-gray-900">Apply Delay</span>
												</div>
												<div className="flex items-center gap-3">
													<input
														type="number"
														min="1"
														max="120"
														value={delayMinutes}
														onChange={(e) => setDelayMinutes(parseInt(e.target.value) || 15)}
														className="w-24 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
														placeholder="Minutes"
													/>
													<span className="text-sm text-gray-600">minutes</span>
													<button
														onClick={handleApplyDelay}
														className="ml-auto px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors text-sm font-semibold"
													>
														Apply Delay
													</button>
												</div>
											</div>

											{/* Change Speed */}
											<div className="border border-gray-200 rounded-lg p-4">
												<div className="flex items-center gap-2 mb-3">
													<Gauge className="w-5 h-5 text-blue-600" />
													<span className="font-semibold text-gray-900">Change Speed</span>
												</div>
												<div className="flex items-center gap-3">
													<input
														type="number"
														min="0"
														max="120"
														value={speedKmh}
														onChange={(e) => setSpeedKmh(parseInt(e.target.value) || 80)}
														className="w-24 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
														placeholder="km/h"
													/>
													<span className="text-sm text-gray-600">km/h</span>
													<button
														onClick={handleChangeSpeed}
														className="ml-auto px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-semibold"
													>
														Change Speed
													</button>
												</div>
											</div>

											{/* Hold Train */}
											<div className="border border-gray-200 rounded-lg p-4">
												<div className="flex items-center gap-2 mb-3">
													<Clock className="w-5 h-5 text-yellow-600" />
													<span className="font-semibold text-gray-900">Hold Train</span>
												</div>
												<div className="flex items-center gap-3">
													<input
														type="number"
														min="1"
														max="60"
														value={holdMinutes}
														onChange={(e) => setHoldMinutes(parseInt(e.target.value) || 5)}
														className="w-24 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
														placeholder="Minutes"
													/>
													<span className="text-sm text-gray-600">minutes</span>
													<button
														onClick={handleHoldTrain}
														className="ml-auto px-4 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 transition-colors text-sm font-semibold"
													>
														Hold Train
													</button>
												</div>
											</div>

											{/* Emergency Priority */}
											<div className="border border-red-200 rounded-lg p-4 bg-red-50">
												<div className="flex items-center gap-2 mb-3">
													<AlertTriangle className="w-5 h-5 text-red-600" />
													<span className="font-semibold text-gray-900">Emergency Priority</span>
												</div>
												<p className="text-sm text-gray-600 mb-3">
													Activate emergency priority for this train. All other trains must yield.
												</p>
												<button
													onClick={handleEmergencyPriority}
													className="w-full px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors text-sm font-semibold"
												>
													Activate Emergency Priority
												</button>
											</div>
										</div>
									</div>
								))}
						</div>
					</div>
				</div>
			)}
		</div>
	);
}

