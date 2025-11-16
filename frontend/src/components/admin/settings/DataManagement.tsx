import { useState } from 'react';
import { Database, Upload, RefreshCw, Trash2, CheckCircle } from 'lucide-react';
import { api } from '../../../utils/fetcher';

export default function DataManagement() {
	const [uploading, setUploading] = useState(false);
	const [reindexing, setReindexing] = useState(false);
	const [clearing, setClearing] = useState(false);
	const [validating, setValidating] = useState(false);
	const [status, setStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

	const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
		const file = event.target.files?.[0];
		if (!file) return;

		setUploading(true);
		setStatus(null);

		try {
			const formData = new FormData();
			formData.append('file', file);

			const API_BASE = ((import.meta as any).env?.VITE_API_URL || '').trim();
			const apiBaseUrl = API_BASE
				? API_BASE
				: (typeof location !== 'undefined'
						? ((location.hostname === 'localhost' || location.hostname === '127.0.0.1')
								? `${location.protocol}//${location.hostname}:8000`
								: 'https://railanukriti.onrender.com')
						: 'https://railanukriti.onrender.com');

			const token = localStorage.getItem('token');
			const response = await fetch(`${apiBaseUrl}/api/data/upload`, {
				method: 'POST',
				headers: {
					Authorization: `Bearer ${token || ''}`,
				},
				body: formData,
			});

			if (!response.ok) throw new Error('Upload failed');
			
			setStatus({ type: 'success', message: 'Dataset uploaded successfully' });
		} catch (error: any) {
			setStatus({ type: 'error', message: error.message || 'Upload failed' });
		} finally {
			setUploading(false);
			event.target.value = '';
		}
	};

	const handleReindex = async () => {
		setReindexing(true);
		setStatus(null);
		try {
			await api.post('/api/data/reindex');
			setStatus({ type: 'success', message: 'Datasets reindexed successfully' });
		} catch (error: any) {
			setStatus({ type: 'error', message: error.message || 'Reindexing failed' });
		} finally {
			setReindexing(false);
		}
	};

	const handleClearCache = async () => {
		setClearing(true);
		setStatus(null);
		try {
			await api.post('/api/data/clear-cache');
			setStatus({ type: 'success', message: 'Cache cleared successfully' });
		} catch (error: any) {
			setStatus({ type: 'error', message: error.message || 'Failed to clear cache' });
		} finally {
			setClearing(false);
		}
	};

	const handleRefreshTopology = async () => {
		setClearing(true);
		setStatus(null);
		try {
			await api.post('/api/data/refresh-topology');
			setStatus({ type: 'success', message: 'Topology refreshed successfully' });
		} catch (error: any) {
			setStatus({ type: 'error', message: error.message || 'Failed to refresh topology' });
		} finally {
			setClearing(false);
		}
	};

	const handleValidation = async () => {
		setValidating(true);
		setStatus(null);
		try {
			const result = await api.post('/api/data/validate');
			setStatus({ 
				type: 'success', 
				message: result.message || 'Validation checks completed successfully' 
			});
		} catch (error: any) {
			setStatus({ type: 'error', message: error.message || 'Validation failed' });
		} finally {
			setValidating(false);
		}
	};

	return (
		<div className="space-y-6">
			<div className="flex items-center gap-3 mb-6">
				<Database className="w-6 h-6 text-blue-600" />
				<h2 className="text-2xl font-bold text-gray-900">Data Management</h2>
			</div>

			{status && (
				<div className={`p-4 rounded-lg border ${
					status.type === 'success' 
						? 'bg-green-50 border-green-200 text-green-800' 
						: 'bg-red-50 border-red-200 text-red-800'
				}`}>
					{status.message}
				</div>
			)}

			{/* Upload CSV Dataset */}
			<div className="bg-white border border-gray-200 rounded-lg p-6">
				<h3 className="text-lg font-semibold text-gray-900 mb-4">Upload New CSV Dataset</h3>
				<label className="flex items-center gap-3 p-4 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:border-blue-500 transition-colors">
					<Upload className="w-5 h-5 text-gray-400" />
					<span className="text-sm font-medium text-gray-700">
						{uploading ? 'Uploading...' : 'Choose CSV file to upload'}
					</span>
					<input
						type="file"
						accept=".csv"
						onChange={handleFileUpload}
						disabled={uploading}
						className="hidden"
					/>
				</label>
				<p className="mt-2 text-xs text-gray-500">Upload stations, sections, positions, or assets CSV files</p>
			</div>

			{/* Data Operations */}
			<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
				<button
					onClick={handleReindex}
					disabled={reindexing}
					className="flex items-center gap-3 p-4 bg-white border border-gray-200 rounded-lg hover:bg-blue-50 hover:border-blue-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
				>
					<RefreshCw className={`w-5 h-5 text-blue-600 ${reindexing ? 'animate-spin' : ''}`} />
					<div className="text-left">
						<div className="font-semibold text-gray-900">Re-index Datasets</div>
						<div className="text-xs text-gray-500">Rebuild search indexes</div>
					</div>
				</button>

				<button
					onClick={handleClearCache}
					disabled={clearing}
					className="flex items-center gap-3 p-4 bg-white border border-gray-200 rounded-lg hover:bg-red-50 hover:border-red-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
				>
					<Trash2 className="w-5 h-5 text-red-600" />
					<div className="text-left">
						<div className="font-semibold text-gray-900">Clear Cached Graph Models</div>
						<div className="text-xs text-gray-500">Remove cached topology data</div>
					</div>
				</button>

				<button
					onClick={handleRefreshTopology}
					disabled={clearing}
					className="flex items-center gap-3 p-4 bg-white border border-gray-200 rounded-lg hover:bg-green-50 hover:border-green-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
				>
					<RefreshCw className={`w-5 h-5 text-green-600 ${clearing ? 'animate-spin' : ''}`} />
					<div className="text-left">
						<div className="font-semibold text-gray-900">Refresh Topology</div>
						<div className="text-xs text-gray-500">Reload network topology</div>
					</div>
				</button>

				<button
					onClick={handleValidation}
					disabled={validating}
					className="flex items-center gap-3 p-4 bg-white border border-gray-200 rounded-lg hover:bg-purple-50 hover:border-purple-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
				>
					<CheckCircle className={`w-5 h-5 text-purple-600 ${validating ? 'animate-pulse' : ''}`} />
					<div className="text-left">
						<div className="font-semibold text-gray-900">Run Validation Checks</div>
						<div className="text-xs text-gray-500">Validate data integrity</div>
					</div>
				</button>
			</div>
		</div>
	);
}

