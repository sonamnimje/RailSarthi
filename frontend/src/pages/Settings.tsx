import { useEffect, useState, useCallback } from 'react';
import { RefreshCw } from 'lucide-react';
import { fetchMe, signup } from '../lib/api';

type User = {
	id: number;
	username: string;
	role: string;
};

type Track = {
	id: string;
	name: string;
	platforms: number;
};

export default function SettingsPage() {
	const [user, setUser] = useState<User | null>(null);
	const [users, setUsers] = useState<User[]>([]);
	const [loadingUsers, setLoadingUsers] = useState(false);
	
	const [newController, setNewController] = useState('');
	const [newPassword, setNewPassword] = useState('');
	const [captchaId, setCaptchaId] = useState('');
	const [captchaText, setCaptchaText] = useState('');
	const [captchaAnswer, setCaptchaAnswer] = useState('');
	const [captchaLoading, setCaptchaLoading] = useState(false);
	const [addLoading, setAddLoading] = useState(false);
	const [addError, setAddError] = useState<string | null>(null);
	const [addSuccess, setAddSuccess] = useState<string | null>(null);

	const [tracks, setTracks] = useState<Track[]>([
		{ id: 'SEC-001', name: 'Mainline North', platforms: 2 },
		{ id: 'SEC-002', name: 'Mainline South', platforms: 3 },
		{ id: 'SEC-003', name: 'Branch Line East', platforms: 1 },
	]);
	const [trackForm, setTrackForm] = useState<{ id: string; name: string; platforms: number }>({
		id: '',
		name: '',
		platforms: 1,
	});

	const [modelSettings, setModelSettings] = useState({
		delayThreshold: 5,
		safetyMargin: 2,
		explorationRate: 0.2,
	});
	const [savingSettings, setSavingSettings] = useState(false);
	const [settingsSaved, setSettingsSaved] = useState(false);

	const fetchCaptcha = useCallback(async () => {
		setCaptchaLoading(true);
		try {
			const API_BASE = ((import.meta as any).env?.VITE_API_URL || '').trim();
			const apiBaseUrl = API_BASE
				? API_BASE
				: (typeof location !== 'undefined'
						? ((location.hostname === 'localhost' || location.hostname === '127.0.0.1')
								? `${location.protocol}//${location.hostname}:8000`
								: 'https://railanukriti.onrender.com')
						: 'https://railanukriti.onrender.com');

			const res = await fetch(`${apiBaseUrl}/api/users/captcha`);
			if (!res.ok) {
				throw new Error('Failed to fetch CAPTCHA');
			}
			const data = await res.json() as { captcha_id: string; captcha_text: string };
			setCaptchaId(data.captcha_id);
			setCaptchaText(data.captcha_text);
			setCaptchaAnswer('');
		} catch (err: any) {
			setAddError(err.message || 'Failed to load CAPTCHA');
		} finally {
			setCaptchaLoading(false);
		}
	}, []);

	useEffect(() => {
		fetchMe()
			.then(setUser)
			.catch(() => setUser(null));
		// Note: In a real implementation, you'd fetch users from an admin endpoint
		// For now, we'll use local state
		fetchCaptcha();
	}, [fetchCaptcha]);

	async function addController() {
		const username = newController.trim();
		const password = newPassword;
		if (!username || !password) {
			setAddError('Username and password are required');
			return;
		}
		if (!captchaId || !captchaAnswer) {
			setAddError('Please complete the CAPTCHA verification');
			return;
		}
		
		try {
			setAddLoading(true);
			setAddError(null);
			setAddSuccess(null);
			
			const newUser = await signup(username, password, 'controller', captchaId, captchaAnswer);
			setUsers(prev => [...prev, newUser]);
			setNewController('');
			setNewPassword('');
			setCaptchaAnswer('');
			setAddSuccess(`Controller "${username}" added successfully`);
			// Refresh CAPTCHA for next use
			fetchCaptcha();
			
			// Clear success message after 3 seconds
			setTimeout(() => setAddSuccess(null), 3000);
		} catch (e: any) {
			setAddError(e?.message || 'Failed to add controller');
		} finally {
			setAddLoading(false);
		}
	}

	function removeController(username: string) {
		if (window.confirm(`Are you sure you want to remove controller "${username}"?`)) {
			setUsers(users.filter(u => u.username !== username));
			// Note: In a real implementation, you'd call an API endpoint to delete the user
		}
	}

	function addTrack(e: React.FormEvent) {
		e.preventDefault();
		if (!trackForm.id || !trackForm.name) {
			return;
		}
		const newTrack: Track = {
			id: trackForm.id,
			name: trackForm.name,
			platforms: Math.max(1, Math.min(12, Number(trackForm.platforms) || 1)),
		};
		setTracks(prev => [...prev, newTrack]);
		setTrackForm({ id: '', name: '', platforms: 1 });
	}

	function removeTrack(trackId: string) {
		if (window.confirm(`Are you sure you want to remove track "${trackId}"?`)) {
			setTracks(tracks.filter(t => t.id !== trackId));
		}
	}

	async function saveModelSettings() {
		setSavingSettings(true);
		setSettingsSaved(false);
		// Simulate API call
		await new Promise(resolve => setTimeout(resolve, 1000));
		setSavingSettings(false);
		setSettingsSaved(true);
		setTimeout(() => setSettingsSaved(false), 3000);
		// Note: In a real implementation, you'd call an API endpoint to save these settings
	}

	return (
		<div className="min-h-screen bg-blue-50 p-4 sm:p-6 lg:p-8">
			<div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-6 sm:mb-8 gap-4">
				<div className="flex items-center gap-3">
					<span className="text-3xl sm:text-4xl">
						<svg
							xmlns="http://www.w3.org/2000/svg"
							fill="none"
							viewBox="0 0 24 24"
							strokeWidth={1.5}
							stroke="currentColor"
							className="w-8 h-8 sm:w-10 sm:h-10 text-blue-600"
						>
							<path
								strokeLinecap="round"
								strokeLinejoin="round"
								d="M10.343 3.94c.09-.542.56-.94 1.11-.94h1.093c.55 0 1.02.398 1.11.94l.149.894c.07.424.384.764.78.93.398.164.855.142 1.205-.108l.737-.527a1.125 1.125 0 011.45.12l.773.774c.39.389.44 1.002.12 1.45l-.527.737c-.25.35-.272.806-.107 1.204.165.397.505.71.93.78l.893.15c.543.09.94.56.94 1.109v1.094c0 .55-.397 1.02-.94 1.11l-.893.149c-.425.07-.765.383-.93.78-.165.398-.143.854.107 1.204l.527.738c.32.447.269 1.06-.12 1.45l-.774.773a1.125 1.125 0 01-1.449.12l-.738-.527c-.35-.25-.807-.272-1.204-.107-.397.165-.71.505-.78.929l-.15.894c-.09.542-.56.94-1.109.94h-1.094c-.55 0-1.019-.398-1.11-.94l-.148-.894c-.071-.424-.384-.764-.781-.93-.398-.164-.854-.142-1.204.108l-.738.527c-.447.32-1.06.269-1.45-.12l-.773-.774a1.125 1.125 0 01-.12-1.45l.527-.737c.25-.35.273-.806.108-1.204-.165-.397-.505-.71-.929-.78l-.894-.15c-.542-.09-.94-.56-.94-1.109v-1.094c0-.55.398-1.02.94-1.11l.894-.149c.424-.07.764-.383.929-.78.165-.398.142-.854-.108-1.204l-.527-.738a1.125 1.125 0 01.12-1.45l.774-.773a1.125 1.125 0 011.45-.12l.737.527c.35.25.806.272 1.204.107.397-.165.71-.505.78-.929l.149-.894z"
							/>
							<path
								strokeLinecap="round"
								strokeLinejoin="round"
								d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
							/>
						</svg>
					</span>
					<h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-gray-800">
						Admin Settings
					</h1>
				</div>
				{user && (
					<span className="text-sm text-gray-600 bg-white px-3 py-1.5 rounded-lg shadow-sm border border-gray-200">
						Signed in as <span className="font-semibold">{user.username}</span> (
						<span className="text-blue-600">{user.role}</span>)
					</span>
				)}
			</div>

			<div className="max-w-7xl mx-auto grid gap-6 lg:grid-cols-2 xl:grid-cols-3">
				{/* User Management */}
				<section className="bg-white rounded-2xl shadow-lg p-6 border border-gray-200">
					<div className="flex items-center justify-between mb-4">
						<h2 className="text-xl font-semibold text-gray-900">User Management</h2>
						<span className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded">
							{users.length} {users.length === 1 ? 'user' : 'users'}
						</span>
					</div>
					
					<div className="space-y-4 mb-4">
						<div>
							<label className="block text-sm font-medium text-gray-700 mb-2">
								Controller Username
							</label>
							<input
								type="text"
								placeholder="Enter controller ID"
								className="w-full border rounded-lg px-3 py-2 bg-gray-50 text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-400 border-gray-300"
								value={newController}
								onChange={(e) => setNewController(e.target.value)}
							/>
						</div>
						
						<div>
							<label className="block text-sm font-medium text-gray-700 mb-2">
								Password
							</label>
							<input
								type="password"
								placeholder="Enter secure password"
								className="w-full border rounded-lg px-3 py-2 bg-gray-50 text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-400 border-gray-300"
								value={newPassword}
								onChange={(e) => setNewPassword(e.target.value)}
							/>
							<div className="mt-1 text-xs text-gray-500">
								Must be at least 12 characters with uppercase, lowercase, number, and special character
							</div>
						</div>

						<div>
							<label className="block text-sm font-medium text-gray-700 mb-2">
								CAPTCHA Verification
							</label>
							<div className="flex items-center gap-3">
								<div className="flex-shrink-0">
									{captchaLoading ? (
										<div className="w-24 h-10 bg-gray-200 rounded flex items-center justify-center">
											<span className="text-xs text-gray-500">Loading...</span>
										</div>
									) : captchaText ? (
										<div className="w-24 h-10 bg-gradient-to-r from-blue-100 to-purple-100 rounded border-2 border-gray-300 flex items-center justify-center">
											<span className="text-2xl font-bold text-gray-800 tracking-wider select-none">
												{captchaText}
											</span>
										</div>
									) : (
										<div className="w-24 h-10 bg-gray-200 rounded flex items-center justify-center">
											<span className="text-xs text-gray-500">Error</span>
										</div>
									)}
								</div>
								<button
									type="button"
									onClick={fetchCaptcha}
									disabled={captchaLoading}
									className="text-blue-600 hover:text-blue-800 disabled:opacity-50 transition-colors p-1 rounded hover:bg-blue-50"
									aria-label="Refresh CAPTCHA"
								>
									<RefreshCw size={18} className={captchaLoading ? 'animate-spin' : ''} />
								</button>
								<input
									type="text"
									value={captchaAnswer}
									onChange={(e) => {
										const newValue = e.target.value.toUpperCase();
										setCaptchaAnswer(newValue);
									}}
									placeholder="Enter CAPTCHA"
									className="flex-1 border rounded-lg px-3 py-2 bg-gray-50 text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-400 border-gray-300 font-mono text-sm"
									maxLength={5}
									autoComplete="off"
								/>
							</div>
							<div className="mt-1 text-xs text-gray-500">
								Enter the 5 characters shown above (case-insensitive)
							</div>
						</div>

						<button
							className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold px-4 py-2.5 rounded-lg shadow transition disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
							onClick={addController}
							disabled={addLoading || !newController.trim() || !newPassword || !captchaId || !captchaAnswer}
						>
							{addLoading ? (
								<>
									<svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
										<circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
										<path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
									</svg>
									Adding...
								</>
							) : (
								'Add Controller'
							)}
						</button>
						
						{addError && (
							<div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-3">
								{addError}
							</div>
						)}
						{addSuccess && (
							<div className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg p-3">
								{addSuccess}
							</div>
						)}
					</div>

					<div className="border-t border-gray-200 pt-4">
						<h3 className="text-sm font-medium text-gray-700 mb-3">Existing Controllers</h3>
						{users.length === 0 ? (
							<p className="text-sm text-gray-500 italic">No controllers added yet</p>
						) : (
							<ul className="space-y-2 max-h-64 overflow-y-auto">
								{users.map((u) => (
									<li
										key={u.id}
										className="flex items-center justify-between py-2 px-3 bg-gray-50 rounded-lg border border-gray-200"
									>
										<div className="flex items-center gap-2">
											<span className="text-gray-800 font-medium">{u.username}</span>
											<span className="text-xs text-gray-500 bg-gray-200 px-2 py-0.5 rounded">
												{u.role}
											</span>
										</div>
										<button
											className="text-red-600 hover:text-red-700 text-sm font-medium hover:underline"
											onClick={() => removeController(u.username)}
										>
											Remove
										</button>
									</li>
								))}
							</ul>
						)}
					</div>
				</section>

				{/* Section Configuration */}
				<section className="bg-white rounded-2xl shadow-lg p-6 border border-gray-200">
					<div className="flex items-center justify-between mb-4">
						<h2 className="text-xl font-semibold text-gray-900">Section Configuration</h2>
						<span className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded">
							{tracks.length} {tracks.length === 1 ? 'section' : 'sections'}
						</span>
					</div>
					
					<form className="space-y-3 mb-4" onSubmit={addTrack}>
						<div>
							<label className="block text-sm font-medium text-gray-700 mb-2">
								Section ID
							</label>
							<input
								placeholder="e.g., SEC-001"
								className="w-full border rounded-lg px-3 py-2 bg-gray-50 text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-400 border-gray-300"
								value={trackForm.id}
								onChange={(e) => setTrackForm({ ...trackForm, id: e.target.value.toUpperCase() })}
							/>
						</div>
						<div>
							<label className="block text-sm font-medium text-gray-700 mb-2">
								Section Name
							</label>
							<input
								placeholder="e.g., Mainline North"
								className="w-full border rounded-lg px-3 py-2 bg-gray-50 text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-400 border-gray-300"
								value={trackForm.name}
								onChange={(e) => setTrackForm({ ...trackForm, name: e.target.value })}
							/>
						</div>
						<div>
							<label className="block text-sm font-medium text-gray-700 mb-2">
								Number of Platforms
							</label>
							<div className="flex items-center gap-3">
								<input
									type="number"
									min={1}
									max={12}
									className="w-24 border rounded-lg px-3 py-2 bg-gray-50 text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-400 border-gray-300"
									value={trackForm.platforms}
									onChange={(e) =>
										setTrackForm({ ...trackForm, platforms: Number(e.target.value) || 1 })
									}
								/>
								<button
									type="submit"
									className="ml-auto bg-blue-600 hover:bg-blue-700 text-white font-semibold px-4 py-2 rounded-lg shadow transition disabled:opacity-60 disabled:cursor-not-allowed"
									disabled={!trackForm.id || !trackForm.name}
								>
									Add Section
								</button>
							</div>
						</div>
					</form>
					
					<div className="border-t border-gray-200 pt-4">
						<h3 className="text-sm font-medium text-gray-700 mb-3">Configured Sections</h3>
						{tracks.length === 0 ? (
							<p className="text-sm text-gray-500 italic">No sections configured yet</p>
						) : (
							<ul className="space-y-2 max-h-64 overflow-y-auto">
								{tracks.map((t) => (
									<li
										key={t.id}
										className="p-3 rounded-lg bg-gray-50 border border-gray-200 flex items-start justify-between"
									>
										<div className="flex-1">
											<div className="font-medium text-gray-900">
												{t.name} <span className="text-gray-500 text-sm">({t.id})</span>
											</div>
											<div className="text-sm text-gray-600 mt-1">
												{t.platforms} {t.platforms === 1 ? 'platform' : 'platforms'}
											</div>
										</div>
										<button
											className="text-red-600 hover:text-red-700 text-sm font-medium hover:underline ml-2"
											onClick={() => removeTrack(t.id)}
										>
											Remove
										</button>
									</li>
								))}
							</ul>
						)}
					</div>
				</section>

				{/* Model Settings */}
				<section className="bg-white rounded-2xl shadow-lg p-6 border border-gray-200 lg:col-span-2 xl:col-span-1">
					<div className="flex items-center justify-between mb-4">
						<h2 className="text-xl font-semibold text-gray-900">Model Settings</h2>
						{settingsSaved && (
							<span className="text-xs text-green-700 bg-green-100 px-2 py-1 rounded">
								Saved!
							</span>
						)}
					</div>
					
					<div className="space-y-5">
						<div>
							<div className="flex items-center justify-between mb-2">
								<label className="block text-sm font-medium text-gray-700">
									Delay Threshold
								</label>
								<span className="text-sm font-semibold text-blue-600">
									{modelSettings.delayThreshold} min
								</span>
							</div>
							<input
								type="range"
								min={0}
								max={30}
								step={1}
								value={modelSettings.delayThreshold}
								onChange={(e) =>
									setModelSettings({ ...modelSettings, delayThreshold: Number(e.target.value) })
								}
								className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
							/>
							<div className="flex justify-between text-xs text-gray-500 mt-1">
								<span>0 min</span>
								<span>30 min</span>
							</div>
						</div>
						
						<div>
							<div className="flex items-center justify-between mb-2">
								<label className="block text-sm font-medium text-gray-700">
									Safety Margin
								</label>
								<span className="text-sm font-semibold text-blue-600">
									{modelSettings.safetyMargin} min
								</span>
							</div>
							<input
								type="range"
								min={0}
								max={10}
								step={0.5}
								value={modelSettings.safetyMargin}
								onChange={(e) =>
									setModelSettings({ ...modelSettings, safetyMargin: Number(e.target.value) })
								}
								className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
							/>
							<div className="flex justify-between text-xs text-gray-500 mt-1">
								<span>0 min</span>
								<span>10 min</span>
							</div>
						</div>
						
						<div>
							<div className="flex items-center justify-between mb-2">
								<label className="block text-sm font-medium text-gray-700">
									Exploration Rate
								</label>
								<span className="text-sm font-semibold text-blue-600">
									{modelSettings.explorationRate.toFixed(2)}
								</span>
							</div>
							<input
								type="range"
								step={0.01}
								min={0}
								max={1}
								value={modelSettings.explorationRate}
								onChange={(e) =>
									setModelSettings({ ...modelSettings, explorationRate: Number(e.target.value) })
								}
								className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
							/>
							<div className="flex justify-between text-xs text-gray-500 mt-1">
								<span>0.00</span>
								<span>1.00</span>
							</div>
						</div>
						
						<button
							className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-semibold px-4 py-2.5 rounded-lg shadow transition disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
							onClick={saveModelSettings}
							disabled={savingSettings}
						>
							{savingSettings ? (
								<>
									<svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
										<circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
										<path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
									</svg>
									Saving...
								</>
							) : (
								'Save Settings'
							)}
						</button>
					</div>
				</section>
			</div>
		</div>
	);
}
