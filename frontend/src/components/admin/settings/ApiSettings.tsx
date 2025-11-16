import { useState, useEffect } from 'react';
import { Radio, Eye, EyeOff } from 'lucide-react';
import { api } from '../../../utils/fetcher';

interface ApiSettings {
	websocketUrl: string;
	apiKey: string;
	liveMode: boolean;
}

export default function ApiSettings() {
	const [loading, setLoading] = useState(false);
	const [showApiKey, setShowApiKey] = useState(false);
	const [settings, setSettings] = useState<ApiSettings>({
		websocketUrl: 'ws://localhost:8000/ws/live',
		apiKey: '',
		liveMode: true,
	});

	useEffect(() => {
		loadSettings();
	}, []);

	const loadSettings = async () => {
		try {
			const data = await api.get<ApiSettings>('/api/settings?section=api');
			setSettings(data);
		} catch (error) {
			console.error('Failed to load API settings:', error);
		}
	};

	const handleSave = async () => {
		setLoading(true);
		try {
			await api.patch('/api/settings/api', settings);
			return { success: true, message: 'API settings saved successfully' };
		} catch (error: any) {
			return { success: false, message: error.message || 'Failed to save settings' };
		} finally {
			setLoading(false);
		}
	};

	const maskApiKey = (key: string) => {
		if (!key) return '';
		if (key.length <= 8) return '•'.repeat(key.length);
		return key.substring(0, 4) + '•'.repeat(key.length - 8) + key.substring(key.length - 4);
	};

	return (
		<div className="space-y-6">
			<div className="flex items-center gap-3 mb-6">
				<Radio className="w-6 h-6 text-blue-600" />
				<h2 className="text-2xl font-bold text-gray-900">Real-Time API Settings</h2>
			</div>

			<div className="space-y-6">
				{/* WebSocket URL */}
				<div>
					<label className="block text-sm font-medium text-gray-700 mb-2">
						WebSocket URL
					</label>
					<input
						type="url"
						value={settings.websocketUrl}
						onChange={(e) => setSettings({ ...settings, websocketUrl: e.target.value })}
						placeholder="ws://localhost:8000/ws/live"
						className="w-full border rounded-lg px-4 py-2 bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 border-gray-300 font-mono text-sm"
					/>
					<p className="mt-1 text-xs text-gray-500">WebSocket endpoint for real-time updates</p>
				</div>

				{/* API Key */}
				<div>
					<label className="block text-sm font-medium text-gray-700 mb-2">
						API Key
					</label>
					<div className="relative">
						<input
							type={showApiKey ? 'text' : 'password'}
							value={settings.apiKey}
							onChange={(e) => setSettings({ ...settings, apiKey: e.target.value })}
							placeholder="Enter API key"
							className="w-full border rounded-lg px-4 py-2 pr-10 bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 border-gray-300 font-mono text-sm"
						/>
						<button
							type="button"
							onClick={() => setShowApiKey(!showApiKey)}
							className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
						>
							{showApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
						</button>
					</div>
					{settings.apiKey && !showApiKey && (
						<p className="mt-1 text-xs text-gray-500">Masked: {maskApiKey(settings.apiKey)}</p>
					)}
					<p className="mt-1 text-xs text-gray-500">API key is encrypted and stored securely</p>
				</div>

				{/* Live Mode Toggle */}
				<div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
					<div>
						<label className="block text-sm font-medium text-gray-700 mb-1">
							Enable Live Mode
						</label>
						<p className="text-xs text-gray-500">Connect to real-time data streams</p>
					</div>
					<label className="relative inline-flex items-center cursor-pointer">
						<input
							type="checkbox"
							checked={settings.liveMode}
							onChange={(e) => setSettings({ ...settings, liveMode: e.target.checked })}
							className="sr-only peer"
						/>
						<div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
					</label>
				</div>
			</div>
		</div>
	);
}

