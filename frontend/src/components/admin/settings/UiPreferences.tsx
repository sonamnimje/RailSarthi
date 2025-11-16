import { useState, useEffect } from 'react';
import { Monitor, Layout } from 'lucide-react';
import { api } from '../../../utils/fetcher';

interface UiSettings {
	theme: 'light' | 'dark' | 'system';
	dashboardLayout: 'default' | 'compact' | 'expanded';
}

export default function UiPreferences() {
	const [settings, setSettings] = useState<UiSettings>({
		theme: 'system',
		dashboardLayout: 'default',
	});

	useEffect(() => {
		loadSettings();
	}, []);

	const loadSettings = async () => {
		try {
			const data = await api.get<UiSettings>('/api/settings?section=ui');
			setSettings(data);
		} catch (error) {
			console.error('Failed to load UI settings:', error);
		}
	};

	return (
		<div className="space-y-6">
			<div className="flex items-center gap-3 mb-6">
				<Monitor className="w-6 h-6 text-blue-600" />
				<h2 className="text-2xl font-bold text-gray-900">UI Preferences</h2>
			</div>

			<div className="space-y-6">
				{/* Theme Selection */}
				<div className="bg-white border border-gray-200 rounded-lg p-6">
					<label className="block text-sm font-medium text-gray-700 mb-2">
						Theme
					</label>
					<div className="grid grid-cols-3 gap-3">
						{(['light', 'dark', 'system'] as const).map((themeOption) => (
							<button
								key={themeOption}
								onClick={() => setSettings({ ...settings, theme: themeOption })}
								className={`p-4 border-2 rounded-lg transition-all ${
									settings.theme === themeOption
										? 'border-blue-600 bg-blue-50'
										: 'border-gray-200 hover:border-gray-300'
								}`}
							>
								<div className="text-sm font-medium text-gray-900 capitalize mb-1">{themeOption}</div>
								<div className="text-xs text-gray-500">
									{themeOption === 'system' ? 'Follow OS setting' : `${themeOption} mode`}
								</div>
							</button>
						))}
					</div>
				</div>

				{/* Dashboard Layout Presets */}
				<div className="bg-white border border-gray-200 rounded-lg p-6">
					<div className="flex items-center gap-2 mb-4">
						<Layout className="w-5 h-5 text-gray-600" />
						<label className="block text-sm font-medium text-gray-700">
							Admin Dashboard Layout Presets
						</label>
					</div>
					<div className="grid grid-cols-1 md:grid-cols-3 gap-3">
						{(['default', 'compact', 'expanded'] as const).map((layout) => (
							<button
								key={layout}
								onClick={() => setSettings({ ...settings, dashboardLayout: layout })}
								className={`p-4 border-2 rounded-lg transition-all text-left ${
									settings.dashboardLayout === layout
										? 'border-blue-600 bg-blue-50'
										: 'border-gray-200 hover:border-gray-300'
								}`}
							>
								<div className="text-sm font-medium text-gray-900 capitalize mb-1">{layout}</div>
								<div className="text-xs text-gray-500">
									{layout === 'default' && 'Standard layout with balanced spacing'}
									{layout === 'compact' && 'Dense layout for maximum information'}
									{layout === 'expanded' && 'Spacious layout for detailed views'}
								</div>
							</button>
						))}
					</div>
				</div>
			</div>
		</div>
	);
}

