import { useState, useEffect } from 'react';
import { AlertTriangle } from 'lucide-react';
import { api } from '../../../utils/fetcher';

interface DisruptionSettings {
	delayThreshold: number;
	congestionThreshold: number;
	blockFailureThreshold: number;
	autoDetectorSensitivity: number;
	escalationRules: {
		delayMinutes: number;
		action: string;
	}[];
}

export default function DisruptionSettings() {
	const [settings, setSettings] = useState<DisruptionSettings>({
		delayThreshold: 15,
		congestionThreshold: 0.7,
		blockFailureThreshold: 3,
		autoDetectorSensitivity: 0.5,
		escalationRules: [
			{ delayMinutes: 30, action: 'Notify Controller' },
			{ delayMinutes: 60, action: 'Escalate to Supervisor' },
			{ delayMinutes: 120, action: 'Emergency Protocol' },
		],
	});

	useEffect(() => {
		loadSettings();
	}, []);

	const loadSettings = async () => {
		try {
			const data = await api.get<DisruptionSettings>('/api/settings?section=disruption');
			setSettings(data);
		} catch (error) {
			console.error('Failed to load disruption settings:', error);
		}
	};

	const addEscalationRule = () => {
		setSettings({
			...settings,
			escalationRules: [...settings.escalationRules, { delayMinutes: 0, action: '' }],
		});
	};

	const updateEscalationRule = (index: number, field: 'delayMinutes' | 'action', value: number | string) => {
		const updated = [...settings.escalationRules];
		updated[index] = { ...updated[index], [field]: value };
		setSettings({ ...settings, escalationRules: updated });
	};

	const removeEscalationRule = (index: number) => {
		setSettings({
			...settings,
			escalationRules: settings.escalationRules.filter((_, i) => i !== index),
		});
	};

	return (
		<div className="space-y-6">
			<div className="flex items-center gap-3 mb-6">
				<AlertTriangle className="w-6 h-6 text-blue-600" />
				<h2 className="text-2xl font-bold text-gray-900">Disruption & Safety Rules</h2>
			</div>

			<div className="space-y-6">
				{/* Alert Thresholds */}
				<div className="bg-white border border-gray-200 rounded-lg p-6">
					<h3 className="text-lg font-semibold text-gray-900 mb-4">Alert Thresholds</h3>
					<div className="space-y-4">
						<div>
							<label className="block text-sm font-medium text-gray-700 mb-2">
								Delay Threshold (minutes)
							</label>
							<input
								type="number"
								min="0"
								value={settings.delayThreshold}
								onChange={(e) => setSettings({ ...settings, delayThreshold: Number(e.target.value) })}
								className="w-full border rounded-lg px-4 py-2 bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 border-gray-300"
							/>
						</div>

						<div>
							<label className="block text-sm font-medium text-gray-700 mb-2">
								Congestion Threshold (0-1)
							</label>
							<input
								type="number"
								min="0"
								max="1"
								step="0.1"
								value={settings.congestionThreshold}
								onChange={(e) => setSettings({ ...settings, congestionThreshold: Number(e.target.value) })}
								className="w-full border rounded-lg px-4 py-2 bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 border-gray-300"
							/>
						</div>

						<div>
							<label className="block text-sm font-medium text-gray-700 mb-2">
								Block Failure Threshold (count)
							</label>
							<input
								type="number"
								min="0"
								value={settings.blockFailureThreshold}
								onChange={(e) => setSettings({ ...settings, blockFailureThreshold: Number(e.target.value) })}
								className="w-full border rounded-lg px-4 py-2 bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 border-gray-300"
							/>
						</div>
					</div>
				</div>

				{/* Auto-Detector Sensitivity */}
				<div className="bg-white border border-gray-200 rounded-lg p-6">
					<h3 className="text-lg font-semibold text-gray-900 mb-4">Auto-Detector Sensitivity</h3>
					<div className="space-y-2">
						<div className="flex items-center gap-4">
							<input
								type="range"
								min="0"
								max="1"
								step="0.1"
								value={settings.autoDetectorSensitivity}
								onChange={(e) => setSettings({ ...settings, autoDetectorSensitivity: Number(e.target.value) })}
								className="flex-1"
							/>
							<span className="text-lg font-semibold text-blue-600 min-w-[60px] text-right">
								{(settings.autoDetectorSensitivity * 100).toFixed(0)}%
							</span>
						</div>
						<div className="flex justify-between text-xs text-gray-500">
							<span>Low</span>
							<span>Medium</span>
							<span>High</span>
						</div>
					</div>
				</div>

				{/* Incident Escalation Rules */}
				<div className="bg-white border border-gray-200 rounded-lg p-6">
					<div className="flex items-center justify-between mb-4">
						<h3 className="text-lg font-semibold text-gray-900">Incident Escalation Rules</h3>
						<button
							onClick={addEscalationRule}
							className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
						>
							Add Rule
						</button>
					</div>
					<div className="space-y-3">
						{settings.escalationRules.map((rule, index) => (
							<div key={index} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
								<input
									type="number"
									min="0"
									value={rule.delayMinutes}
									onChange={(e) => updateEscalationRule(index, 'delayMinutes', Number(e.target.value))}
									placeholder="Delay (min)"
									className="w-24 border rounded-lg px-3 py-2 bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 border-gray-300"
								/>
								<span className="text-gray-500">minutes →</span>
								<input
									type="text"
									value={rule.action}
									onChange={(e) => updateEscalationRule(index, 'action', e.target.value)}
									placeholder="Action"
									className="flex-1 border rounded-lg px-3 py-2 bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 border-gray-300"
								/>
								<button
									onClick={() => removeEscalationRule(index)}
									className="p-2 text-red-600 hover:text-red-800"
								>
									×
								</button>
							</div>
						))}
					</div>
				</div>
			</div>
		</div>
	);
}

