import { useState, useEffect } from 'react';
import { FileText, Download } from 'lucide-react';
import { api } from '../../../utils/fetcher';

interface LoggingSettings {
	eventLogs: boolean;
	retentionDays: number;
}

export default function LoggingSettings() {
	const [exporting, setExporting] = useState(false);
	const [settings, setSettings] = useState<LoggingSettings>({
		eventLogs: true,
		retentionDays: 30,
	});

	useEffect(() => {
		loadSettings();
	}, []);

	const loadSettings = async () => {
		try {
			const data = await api.get<LoggingSettings>('/api/settings?section=logging');
			setSettings(data);
		} catch (error) {
			console.error('Failed to load logging settings:', error);
		}
	};

	const handleExportLogs = async () => {
		setExporting(true);
		try {
			const API_BASE = ((import.meta as any).env?.VITE_API_URL || '').trim();
			const apiBaseUrl = API_BASE
				? API_BASE
				: (typeof location !== 'undefined'
						? ((location.hostname === 'localhost' || location.hostname === '127.0.0.1')
								? `${location.protocol}//${location.hostname}:8000`
								: 'https://railanukriti.onrender.com')
						: 'https://railanukriti.onrender.com');

			const token = localStorage.getItem('token');
			const response = await fetch(`${apiBaseUrl}/api/logs/export`, {
				headers: {
					Authorization: `Bearer ${token || ''}`,
				},
			});

			if (!response.ok) throw new Error('Export failed');

			const blob = await response.blob();
			const url = window.URL.createObjectURL(blob);
			const a = document.createElement('a');
			a.href = url;
			a.download = `logs-${new Date().toISOString().split('T')[0]}.csv`;
			document.body.appendChild(a);
			a.click();
			document.body.removeChild(a);
			window.URL.revokeObjectURL(url);

			return { success: true, message: 'Logs exported successfully' };
		} catch (error: any) {
			return { success: false, message: error.message || 'Export failed' };
		} finally {
			setExporting(false);
		}
	};

	return (
		<div className="space-y-6">
			<div className="flex items-center gap-3 mb-6">
				<FileText className="w-6 h-6 text-blue-600" />
				<h2 className="text-2xl font-bold text-gray-900">Logging & Reports</h2>
			</div>

			<div className="space-y-6">
				{/* Event Logs Toggle */}
				<div className="bg-white border border-gray-200 rounded-lg p-6">
					<div className="flex items-center justify-between">
						<div>
							<label className="block text-sm font-medium text-gray-700 mb-1">
								Enable Event Logs
							</label>
							<p className="text-xs text-gray-500">Log all system events and user actions</p>
						</div>
						<label className="relative inline-flex items-center cursor-pointer">
							<input
								type="checkbox"
								checked={settings.eventLogs}
								onChange={(e) => setSettings({ ...settings, eventLogs: e.target.checked })}
								className="sr-only peer"
							/>
							<div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
						</label>
					</div>
				</div>

				{/* Retention Period */}
				<div className="bg-white border border-gray-200 rounded-lg p-6">
					<label className="block text-sm font-medium text-gray-700 mb-2">
						Log Retention Period
					</label>
					<select
						value={settings.retentionDays}
						onChange={(e) => setSettings({ ...settings, retentionDays: Number(e.target.value) })}
						className="w-full border rounded-lg px-4 py-2 bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 border-gray-300"
					>
						<option value={7}>7 days</option>
						<option value={30}>30 days</option>
						<option value={60}>60 days</option>
						<option value={90}>90 days</option>
						<option value={180}>180 days</option>
						<option value={365}>1 year</option>
					</select>
					<p className="mt-1 text-xs text-gray-500">Logs older than this period will be automatically deleted</p>
				</div>

				{/* Export Logs */}
				<div className="bg-white border border-gray-200 rounded-lg p-6">
					<h3 className="text-lg font-semibold text-gray-900 mb-4">Export Logs</h3>
					<button
						onClick={handleExportLogs}
						disabled={exporting}
						className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
					>
						<Download className="w-4 h-4" />
						{exporting ? 'Exporting...' : 'Export Logs as CSV'}
					</button>
					<p className="mt-2 text-xs text-gray-500">Download all event logs in CSV format</p>
				</div>
			</div>
		</div>
	);
}

