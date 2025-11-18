import { createContext, useContext, useEffect, useState, useCallback, useRef, ReactNode } from 'react';
import { useWebSocket } from './useWebSocket';
import { fetchKpis, fetchLiveTrains, fetchAlerts, type LiveTrain } from './api';

// Real-time data types
interface RealTimeData {
	trains: LiveTrain[];
	kpis: any;
	alerts: any[];
	lastUpdate: Date;
	isConnected: boolean;
}

interface RealTimeDataContextValue extends RealTimeData {
	refreshData: () => Promise<void>;
	sendMessage: (message: any) => void;
	subscribe: (callback: (data: RealTimeData) => void) => () => void;
}

const RealTimeDataContext = createContext<RealTimeDataContextValue | undefined>(undefined);

// Get WebSocket URL
const getWebSocketUrl = () => {
	if (typeof window === 'undefined') return null;
	
	const API_BASE = ((import.meta as any).env?.VITE_API_URL || '').trim();
	const apiBaseUrl = API_BASE
		? API_BASE
		: (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
			? `${window.location.protocol}//${window.location.hostname}:8000`
			: 'https://railanukriti.onrender.com';
	
	return apiBaseUrl.replace('http://', 'ws://').replace('https://', 'wss://') + '/ws/live';
};

export function RealTimeDataProvider({ children }: { children: ReactNode }) {
	const [trains, setTrains] = useState<LiveTrain[]>([]);
	const [kpis, setKpis] = useState<any>(null);
	const [alerts, setAlerts] = useState<any[]>([]);
	const [lastUpdate, setLastUpdate] = useState<Date>(new Date());
	const [isConnected, setIsConnected] = useState(false);
	const subscribersRef = useRef<Set<(data: RealTimeData) => void>>(new Set());
	const wsUrl = getWebSocketUrl();

	// Notify all subscribers of data changes
	const notifySubscribers = useCallback((data: RealTimeData) => {
		subscribersRef.current.forEach(callback => {
			try {
				callback(data);
			} catch (error) {
				console.error('Error in subscriber callback:', error);
			}
		});
	}, []);

	// Fetch initial data and refresh function
	const refreshData = useCallback(async () => {
		try {
			// Fetch KPIs
			const kpisData = await fetchKpis(24).catch(() => null);
			if (kpisData) {
				setKpis(kpisData);
			}

			// Fetch live trains
			const liveTrainsData = await fetchLiveTrains({
				fromStationCode: 'NDLS',
				hours: 2,
			}).catch(() => null);

			if (liveTrainsData && liveTrainsData.trains) {
				setTrains(liveTrainsData.trains);
			}

			// Fetch alerts
			const alertsData = await fetchAlerts().catch(() => null);
			if (alertsData && alertsData.alerts) {
				setAlerts(alertsData.alerts);
			}

			setLastUpdate(new Date());
		} catch (error) {
			console.error('Error refreshing data:', error);
		}
	}, []);

	// WebSocket connection
	const { isConnected: wsConnected, lastMessage, sendMessage: wsSendMessage } = useWebSocket(wsUrl, {
		onMessage: (data) => {
			if (data && typeof data === 'object') {
				// Update trains if received
				if (data.trains && Array.isArray(data.trains)) {
					setTrains(data.trains);
				}

				// Update KPIs if received
				if (data.kpis) {
					setKpis(data.kpis);
				}

				// Update alerts if received
				if (data.alerts && Array.isArray(data.alerts)) {
					setAlerts(data.alerts);
				}

				// Handle event messages
				if (data.type === 'event') {
					setAlerts(prev => [{
						id: Date.now().toString(),
						timestamp: new Date().toISOString(),
						severity: data.severity || 'info',
						message: data.message || 'System update',
					}, ...prev.slice(0, 49)]);
				}

				setLastUpdate(new Date());
			}
		},
		onOpen: () => {
			setIsConnected(true);
		},
		onError: (error) => {
			console.error('WebSocket error:', error);
			setIsConnected(false);
		},
		onClose: () => {
			setIsConnected(false);
		},
	});

	// Update connection status
	useEffect(() => {
		setIsConnected(wsConnected);
	}, [wsConnected]);

	// Notify subscribers when data changes
	useEffect(() => {
		const currentData: RealTimeData = {
			trains,
			kpis,
			alerts,
			lastUpdate,
			isConnected,
		};
		notifySubscribers(currentData);
	}, [trains, kpis, alerts, lastUpdate, isConnected, notifySubscribers]);

	// Initial data fetch
	useEffect(() => {
		refreshData();
		// Refresh data every 30 seconds
		const interval = setInterval(refreshData, 30000);
		return () => clearInterval(interval);
	}, [refreshData]);

	// Subscribe function for components
	const subscribe = useCallback((callback: (data: RealTimeData) => void) => {
		subscribersRef.current.add(callback);
		// Immediately call with current data
		const currentData: RealTimeData = {
			trains,
			kpis,
			alerts,
			lastUpdate,
			isConnected,
		};
		callback(currentData);

		// Return unsubscribe function
		return () => {
			subscribersRef.current.delete(callback);
		};
	}, [trains, kpis, alerts, lastUpdate, isConnected]);

	const value: RealTimeDataContextValue = {
		trains,
		kpis,
		alerts,
		lastUpdate,
		isConnected,
		refreshData,
		sendMessage: wsSendMessage,
		subscribe,
	};

	return (
		<RealTimeDataContext.Provider value={value}>
			{children}
		</RealTimeDataContext.Provider>
	);
}

export function useRealTimeData() {
	const context = useContext(RealTimeDataContext);
	if (!context) {
		throw new Error('useRealTimeData must be used within RealTimeDataProvider');
	}
	return context;
}

