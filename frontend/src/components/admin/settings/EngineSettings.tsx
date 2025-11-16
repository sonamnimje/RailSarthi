import { useState, useEffect } from 'react';
import { Zap } from 'lucide-react';
import { api } from '../../../utils/fetcher';

interface EngineSettings {
	simulationSpeed: number;
	maxTrainsPerSecond: number;
	failureInjectionMode: boolean;
	predictiveModelling: boolean;
}

export default function EngineSettings() {
	const [settings, setSettings] = useState<EngineSettings>({
		simulationSpeed: 1.0,
		maxTrainsPerSecond: 10,
		failureInjectionMode: false,
		predictiveModelling: true,
	});

	useEffect(() => {
		loadSettings();
	}, []);

	const loadSettings = async () => {
		try {
			const data = await api.get<EngineSettings>('/api/settings?section=engine');
			setSettings(data);
		} catch (error) {
			console.error('Failed to load engine settings:', error);
		}
	};

	return (
		<div className="space-y-6">
			<div className="flex items-center gap-3 mb-6">
				<Zap className="w-6 h-6 text-blue-600" />
				<h2 className="text-2xl font-bold text-gray-900">Simulation Engine Settings</h2>
			</div>

			<div className="space-y-6">
				{/* Global Simulation Speed */}
				<div className="bg-gray-50 rounded-lg p-4">
					<label className="block text-sm font-medium text-gray-700 mb-2">
						Global Simulation Speed
					</label>
					<div className="flex items-center gap-4">
						<input
							type="range"
							min="0.5"
							max="5"
							step="0.5"
							value={settings.simulationSpeed}
							onChange={(e) => setSettings({ ...settings, simulationSpeed: Number(e.target.value) })}
							className="flex-1"
						/>
						<span className="text-lg font-semibold text-blue-600 min-w-[60px] text-right">
							{settings.simulationSpeed}x
						</span>
					</div>
					<div className="flex justify-between text-xs text-gray-500 mt-1">
						<span>0.5x</span>
						<span>1x</span>
						<span>2x</span>
						<span>5x</span>
					</div>
				</div>

				{/* Max Trains Per Second */}
				<div>
					<label className="block text-sm font-medium text-gray-700 mb-2">
						Max Trains Per Second Processed
					</label>
					<input
						type="number"
						min="1"
						max="100"
						value={settings.maxTrainsPerSecond}
						onChange={(e) => setSettings({ ...settings, maxTrainsPerSecond: Number(e.target.value) })}
						className="w-full border rounded-lg px-4 py-2 bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 border-gray-300"
					/>
					<p className="mt-1 text-xs text-gray-500">Maximum number of trains processed per simulation tick</p>
				</div>

				{/* Failure Injection Mode */}
				<div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
					<div>
						<label className="block text-sm font-medium text-gray-700 mb-1">
							Failure Injection Mode
						</label>
						<p className="text-xs text-gray-500">Enable automatic failure injection for testing</p>
					</div>
					<label className="relative inline-flex items-center cursor-pointer">
						<input
							type="checkbox"
							checked={settings.failureInjectionMode}
							onChange={(e) => setSettings({ ...settings, failureInjectionMode: e.target.checked })}
							className="sr-only peer"
						/>
						<div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
					</label>
				</div>

				{/* Predictive Modelling */}
				<div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
					<div>
						<label className="block text-sm font-medium text-gray-700 mb-1">
							Predictive Modelling
						</label>
						<p className="text-xs text-gray-500">Enable AI-powered predictive delay modeling</p>
					</div>
					<label className="relative inline-flex items-center cursor-pointer">
						<input
							type="checkbox"
							checked={settings.predictiveModelling}
							onChange={(e) => setSettings({ ...settings, predictiveModelling: e.target.checked })}
							className="sr-only peer"
						/>
						<div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
					</label>
				</div>
			</div>
		</div>
	);
}

