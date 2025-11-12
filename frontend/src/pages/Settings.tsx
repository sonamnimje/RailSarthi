import { useEffect, useState } from 'react';
import { fetchMe, signup } from '../lib/api';

export default function SettingsPage() {
	const [user, setUser] = useState<{ id: number; username: string; role: string } | null>(null)
	const [controllers, setControllers] = useState<string[]>(['ctrl-1', 'ctrl-2'])
	const [newController, setNewController] = useState('')
 	const [newPassword, setNewPassword] = useState('')
 	const [addLoading, setAddLoading] = useState(false)
 	const [addError, setAddError] = useState<string | null>(null)

	const [tracks, setTracks] = useState<Array<{ id: string; name: string; platforms: number }>>([
		{ id: 'SEC-001', name: 'Mainline North', platforms: 2 },
	])
	const [trackForm, setTrackForm] = useState<{ id: string; name: string; platforms: number }>({ id: '', name: '', platforms: 1 })

	const [modelSettings, setModelSettings] = useState({
		delayThreshold: 5,
		safetyMargin: 2,
		explorationRate: 0.2,
	})

	useEffect(() => {
		fetchMe().then(setUser).catch(() => setUser(null))
	}, [])

	async function addController() {
		const username = newController.trim()
		const password = newPassword
		if (!username || !password) {
			setAddError('Username and password are required')
			return
		}
		if (controllers.includes(username)) return
		try {
			setAddLoading(true)
			setAddError(null)
			await signup(username, password, 'controller')
			setControllers([...controllers, username])
			setNewController('')
			setNewPassword('')
		} catch (e: any) {
			setAddError(e?.message || 'Failed to add controller')
		} finally {
			setAddLoading(false)
		}
	}

	function removeController(id: string) {
		setControllers(controllers.filter(c => c !== id))
	}

	function addTrack(e: React.FormEvent) {
		e.preventDefault()
		if (!trackForm.id || !trackForm.name) return
		setTracks(prev => [...prev, { ...trackForm, platforms: Math.max(1, Math.min(12, Number(trackForm.platforms) || 1)) }])
		setTrackForm({ id: '', name: '', platforms: 1 })
	}

	return (
		<div className="min-h-screen bg-blue-50 p-8">
			<div className="flex items-center justify-between mb-8">
				<div className="flex items-center">
					<span className="text-4xl mr-3">
						<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-10 h-10 text-blue-600">
							<path strokeLinecap="round" strokeLinejoin="round" d="M10.343 3.94c.09-.542.56-.94 1.11-.94h1.093c.55 0 1.02.398 1.11.94l.149.894c.07.424.384.764.78.93.398.164.855.142 1.205-.108l.737-.527a1.125 1.125 0 011.45.12l.773.774c.39.389.44 1.002.12 1.45l-.527.737c-.25.35-.272.806-.107 1.204.165.397.505.71.93.78l.893.15c.543.09.94.56.94 1.109v1.094c0 .55-.397 1.02-.94 1.11l-.893.149c-.425.07-.765.383-.93.78-.165.398-.143.854.107 1.204l.527.738c.32.447.269 1.06-.12 1.45l-.774.773a1.125 1.125 0 01-1.449.12l-.738-.527c-.35-.25-.807-.272-1.204-.107-.397.165-.71.505-.78.929l-.15.894c-.09.542-.56.94-1.109.94h-1.094c-.55 0-1.019-.398-1.11-.94l-.148-.894c-.071-.424-.384-.764-.781-.93-.398-.164-.854-.142-1.204.108l-.738.527c-.447.32-1.06.269-1.45-.12l-.773-.774a1.125 1.125 0 01-.12-1.45l.527-.737c.25-.35.273-.806.108-1.204-.165-.397-.505-.71-.929-.78l-.894-.15c-.542-.09-.94-.56-.94-1.109v-1.094c0-.55.398-1.02.94-1.11l.894-.149c.424-.07.764-.383.929-.78.165-.398.142-.854-.108-1.204l-.527-.738a1.125 1.125 0 01.12-1.45l.774-.773a1.125 1.125 0 011.45-.12l.737.527c.35.25.806.272 1.204.107.397-.165.71-.505.78-.929l.149-.894z" />
							<path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
						</svg>
					</span>
					<h1 className="text-4xl font-bold text-gray-800">⚙️ Admin Settings</h1>
				</div>
				{user ? <span className="text-sm text-gray-500">Signed in as {user.username} ({user.role})</span> : null}
			</div>

			<div className="max-w-6xl mx-auto grid gap-6 md:grid-cols-3">
				{/* User Management */}
				<section className="bg-blue-50 rounded-2xl shadow-lg p-6 border border-gray-100">
					<h2 className="text-xl font-semibold text-gray-900 mb-4">User Management</h2>
					<div className="grid gap-2 mb-4">
						<input
							type="text"
							placeholder="Controller ID"
							className="border rounded-lg px-3 py-2 bg-gray-50 text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-400 w-full"
							value={newController}
							onChange={(e) => setNewController(e.target.value)}
						/>
						<input
							type="password"
							placeholder="Password"
							className="border rounded-lg px-3 py-2 bg-gray-50 text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-400 w-full"
							value={newPassword}
							onChange={(e) => setNewPassword(e.target.value)}
						/>
						<button className="bg-blue-600 hover:bg-blue-700 text-white font-semibold px-4 py-2 rounded-lg shadow transition disabled:opacity-60" onClick={addController} disabled={addLoading}>{addLoading ? 'Adding...' : 'Add'}</button>
						{addError ? <div className="text-sm text-red-600">{addError}</div> : null}
					</div>
					<ul className="divide-y divide-gray-200">
						{controllers.map((c) => (
							<li key={c} className="flex items-center justify-between py-2">
								<span className="text-gray-800">{c}</span>
								<button className="text-red-600 hover:text-red-700 text-sm" onClick={() => removeController(c)}>Remove</button>
							</li>
						))}
					</ul>
				</section>

				{/* Section Configuration */}
				<section className="bg-blue-50 rounded-2xl shadow-lg p-6 border border-gray-100">
					<h2 className="text-xl font-semibold text-gray-900 mb-4">Section Configuration</h2>
					<form className="grid gap-3 mb-4" onSubmit={addTrack}>
						<input
							placeholder="Section ID"
							className="border rounded-lg px-3 py-2 bg-gray-50 text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-400"
							value={trackForm.id}
							onChange={(e) => setTrackForm({ ...trackForm, id: e.target.value })}
						/>
						<input
							placeholder="Track/Section name"
							className="border rounded-lg px-3 py-2 bg-gray-50 text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-400"
							value={trackForm.name}
							onChange={(e) => setTrackForm({ ...trackForm, name: e.target.value })}
						/>
						<div className="flex items-center gap-3">
							<label className="text-sm text-gray-700">Platforms</label>
							<input
								type="number"
								min={1}
								max={12}
								className="border rounded-lg px-3 py-2 bg-gray-50 text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-400 w-24"
								value={trackForm.platforms}
								onChange={(e) => setTrackForm({ ...trackForm, platforms: Number(e.target.value) })}
							/>
							<button className="ml-auto bg-blue-600 hover:bg-blue-700 text-white font-semibold px-4 py-2 rounded-lg shadow transition" type="submit">Add</button>
						</div>
					</form>
					<ul className="space-y-2">
						{tracks.map(t => (
							<li key={t.id} className="p-3 rounded-lg bg-gray-50 border border-gray-200">
								<div className="font-medium text-gray-900">{t.name} <span className="text-gray-400">({t.id})</span></div>
								<div className="text-sm text-gray-600">Platforms: {t.platforms}</div>
							</li>
						))}
					</ul>
				</section>

				{/* Model Settings */}
				<section className="bg-blue-50 rounded-2xl shadow-lg p-6 border border-gray-100">
					<h2 className="text-xl font-semibold text-gray-900 mb-4">Model Settings</h2>
					<div className="space-y-5">
						<div>
							<label className="block text-sm font-medium text-gray-700">Delay threshold (min): {modelSettings.delayThreshold}</label>
							<input type="range" min={0} max={30} value={modelSettings.delayThreshold} onChange={(e) => setModelSettings({ ...modelSettings, delayThreshold: Number(e.target.value) })} className="w-full" />
						</div>
						<div>
							<label className="block text-sm font-medium text-gray-700">Safety margin (min): {modelSettings.safetyMargin}</label>
							<input type="range" min={0} max={10} value={modelSettings.safetyMargin} onChange={(e) => setModelSettings({ ...modelSettings, safetyMargin: Number(e.target.value) })} className="w-full" />
						</div>
						<div>
							<label className="block text-sm font-medium text-gray-700">Exploration rate: {modelSettings.explorationRate.toFixed(2)}</label>
							<input type="range" step={0.01} min={0} max={1} value={modelSettings.explorationRate} onChange={(e) => setModelSettings({ ...modelSettings, explorationRate: Number(e.target.value) })} className="w-full" />
						</div>
						<button className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold px-4 py-2 rounded-lg shadow transition w-full">Save Settings</button>
					</div>
				</section>
			</div>
		</div>
	);
}



