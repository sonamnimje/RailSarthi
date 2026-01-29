import { useEffect, useState } from 'react'
import { fetchRecommendations, applyOverride, type Recommendation, login, fetchMe } from '../lib/api'

function useWebSocket(url: string) {
	const [status, setStatus] = useState<'connecting' | 'open' | 'closed'>('connecting')
	const [lastMessage, setLastMessage] = useState<string>('')

	useEffect(() => {
		let ws: WebSocket | null = new WebSocket(url)
		ws.onopen = () => setStatus('open')
		ws.onmessage = (ev) => setLastMessage(ev.data)
		ws.onclose = () => setStatus('closed')
		return () => {
			ws?.close()
			ws = null
		}
	}, [url])

	return { status, lastMessage }
}

export default function App() {
	const WS_BASE = (import.meta as any).env?.VITE_WS_URL || ''
	const defaultWsProto = typeof location !== 'undefined' && location.protocol === 'https:' ? 'wss' : 'ws'
	const wsUrl = WS_BASE || (typeof location !== 'undefined' ? `${defaultWsProto}://${location.hostname}:8000/ws/live` : '')
	const { status, lastMessage } = useWebSocket(wsUrl)
	const [recs, setRecs] = useState<Recommendation[]>([])
	const [loading, setLoading] = useState(false)
	const [error, setError] = useState<string | null>(null)
	const [user, setUser] = useState<{ id: number; username: string; role: string } | null>(null)
	const [auth, setAuth] = useState({ username: '', password: '' })
	const [overridePayload, setOverridePayload] = useState({ controller_id: 'ctrl-1', train_id: '', action: '', reason: '' })

	async function getRecs() {
		setLoading(true)
		setError(null)
		try {
			const data = await fetchRecommendations({ section_id: 'SEC-001', lookahead_minutes: 30 })
			setRecs(data.recommendations)
		} catch (e: any) {
			setError(e.message)
		} finally {
			setLoading(false)
		}
	}

	async function submitOverride() {
		if (!overridePayload.train_id || !overridePayload.action) return
		await applyOverride({ ...overridePayload, timestamp: Date.now() / 1000 })
		setOverridePayload({ ...overridePayload, train_id: '', action: '', reason: '' })
	}

	useEffect(() => {
		fetchMe().then(setUser).catch(() => setUser(null))
		getRecs().catch(() => {})
	}, [])

	async function handleLogin(e: React.FormEvent) {
		e.preventDefault()
		try {
			await login(auth.username, auth.password)
			const me = await fetchMe()
			setUser(me)
			setError(null)
		} catch (e: any) {
			setError(e.message)
		}
	}

	return (
		<div className="min-h-full p-6">
			<header className="flex items-center justify-between">
				<h1 className="text-2xl font-bold">RailSarthi</h1>
				<div className="text-sm text-gray-400 flex items-center gap-3">
					<span>WS: {status}</span>
					{user ? <span>Signed in as {user.username} ({user.role})</span> : null}
				</div>
			</header>
			{!user ? (
				<main className="mt-6 max-w-sm">
					<form className="grid gap-3" onSubmit={handleLogin}>
						<input className="bg-gray-900 rounded px-2 py-1" placeholder="Username" value={auth.username} onChange={(e) => setAuth({ ...auth, username: e.target.value })} />
						<input type="password" className="bg-gray-900 rounded px-2 py-1" placeholder="Password" value={auth.password} onChange={(e) => setAuth({ ...auth, password: e.target.value })} />
						<button className="px-3 py-1 rounded bg-blue-600 hover:bg-blue-500" type="submit">Login</button>
						{error && <span className="text-red-400 text-sm">{error}</span>}
					</form>
				</main>
			) : (
				<main className="mt-6 grid gap-4 md:grid-cols-2">
					<section className="md:col-span-2 rounded-lg border border-gray-800 p-4">
						<h2 className="font-semibold mb-2">Section Map (placeholder)</h2>
						<div className="h-64 bg-gray-900 rounded" />
					</section>
					<section className="rounded-lg border border-gray-800 p-4">
						<h2 className="font-semibold mb-2">Recommendations</h2>
						<div className="mb-2 flex items-center gap-2">
							<button className="rounded bg-blue-600 px-3 py-1 hover:bg-blue-500" onClick={getRecs} disabled={loading}>
								{loading ? 'Loading...' : 'Refresh'}
							</button>
							{error && <span className="text-sm text-red-400">{error}</span>}
						</div>
						<ul className="space-y-2">
							{recs.map((r, idx) => (
								<li key={idx} className="rounded bg-black/30 p-2">
									<div className="text-sm">
										<span className="font-semibold">{r.train_id}</span>: {r.action}
									</div>
									<div className="text-xs text-gray-400">{r.reason}</div>
								</li>
							))}
						</ul>
					</section>
					<section className="rounded-lg border border-gray-800 p-4">
						<h2 className="font-semibold mb-2">Override</h2>
						<div className="grid gap-2">
							<input className="rounded bg-gray-900 px-2 py-1" placeholder="Train ID" value={overridePayload.train_id} onChange={(e) => setOverridePayload({ ...overridePayload, train_id: e.target.value })} />
							<input className="rounded bg-gray-900 px-2 py-1" placeholder="Action" value={overridePayload.action} onChange={(e) => setOverridePayload({ ...overridePayload, action: e.target.value })} />
							<input className="rounded bg-gray-900 px-2 py-1" placeholder="Reason (optional)" value={overridePayload.reason} onChange={(e) => setOverridePayload({ ...overridePayload, reason: e.target.value })} />
							<button className="rounded bg-emerald-600 px-3 py-1 hover:bg-emerald-500" onClick={submitOverride}>Apply Override</button>
						</div>
					</section>
				</main>
			)}
		</div>
	)
}


