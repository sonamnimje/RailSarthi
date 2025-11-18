import { createContext, useContext, useState, useCallback, useEffect, ReactNode } from 'react';
import { applyOverride, fetchOverrides } from './api';

export interface OverrideRecord {
	id: string;
	controller_id: string;
	train_id: string;
	action: string;
	ai_action?: string;
	reason?: string;
	timestamp: number;
	source?: 'simulation' | 'api';
}

interface OverrideContextValue {
	overrides: OverrideRecord[];
	addOverride: (override: Omit<OverrideRecord, 'id' | 'timestamp'>) => Promise<void>;
	refreshOverrides: () => Promise<void>;
	isLoading: boolean;
}

const OverrideContext = createContext<OverrideContextValue | undefined>(undefined);

export function OverrideProvider({ children }: { children: ReactNode }) {
	const [overrides, setOverrides] = useState<OverrideRecord[]>([]);
	const [isLoading, setIsLoading] = useState(false);

	// Fetch overrides from API
	const refreshOverrides = useCallback(async () => {
		try {
			setIsLoading(true);
			const apiOverrides = await fetchOverrides().catch(() => []);
			
			// Merge with local overrides (from simulation)
			const localOverrides = JSON.parse(localStorage.getItem('simulation_overrides') || '[]') as OverrideRecord[];
			
			// Combine and sort by timestamp (newest first)
			const allOverrides = [...apiOverrides, ...localOverrides]
				.sort((a, b) => b.timestamp - a.timestamp);
			
			setOverrides(allOverrides);
		} catch (error) {
			console.error('Error fetching overrides:', error);
		} finally {
			setIsLoading(false);
		}
	}, []);

	// Add a new override (from simulation or API)
	const addOverride = useCallback(async (overrideData: Omit<OverrideRecord, 'id' | 'timestamp'>) => {
		const newOverride: OverrideRecord = {
			...overrideData,
			id: `override_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
			timestamp: Math.floor(Date.now() / 1000),
			source: overrideData.source || 'simulation',
		};

		// Add to local state immediately
		setOverrides(prev => [newOverride, ...prev]);

		// Save to localStorage for persistence
		const localOverrides = JSON.parse(localStorage.getItem('simulation_overrides') || '[]') as OverrideRecord[];
		localOverrides.push(newOverride);
		// Keep only last 1000 overrides
		const trimmed = localOverrides.slice(-1000);
		localStorage.setItem('simulation_overrides', JSON.stringify(trimmed));

		// Try to send to API (don't block if it fails)
		try {
			await applyOverride({
				controller_id: newOverride.controller_id,
				train_id: newOverride.train_id,
				action: newOverride.action,
				ai_action: newOverride.ai_action,
				reason: newOverride.reason,
				timestamp: newOverride.timestamp,
			});
		} catch (error) {
			console.warn('Failed to send override to API:', error);
			// Continue anyway - it's saved locally
		}
	}, []);

	// Initial load
	useEffect(() => {
		refreshOverrides();
		// Refresh every 30 seconds
		const interval = setInterval(refreshOverrides, 30000);
		return () => clearInterval(interval);
	}, [refreshOverrides]);

	const value: OverrideContextValue = {
		overrides,
		addOverride,
		refreshOverrides,
		isLoading,
	};

	return (
		<OverrideContext.Provider value={value}>
			{children}
		</OverrideContext.Provider>
	);
}

export function useOverrides() {
	const context = useContext(OverrideContext);
	if (!context) {
		throw new Error('useOverrides must be used within OverrideProvider');
	}
	return context;
}

