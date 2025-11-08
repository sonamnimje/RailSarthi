export type OptimizeRequest = {
	section_id: string
	lookahead_minutes?: number
	objectives?: string[]
	constraints?: Record<string, unknown>
}

export type Recommendation = {
	train_id: string
	action: string
	reason: string
	eta_change_seconds?: number
	platform?: string
	priority_score?: number
}

// Resolve API base URL with safe fallbacks:
// 1) Use VITE_API_URL when provided
// 2) Use localhost:8000 during local dev
// 3) Use hosted backend URL in production deployments
const API_BASE = ((import.meta as any).env?.VITE_API_URL || '').trim()
const apiBaseUrl = API_BASE
  ? API_BASE
  : (typeof location !== 'undefined'
      ? ((location.hostname === 'localhost' || location.hostname === '127.0.0.1')
          ? `${location.protocol}//${location.hostname}:8000`
          : 'https://railanukriti.onrender.com')
      : 'https://railanukriti.onrender.com')

export async function fetchRecommendations(req: OptimizeRequest) {
	const res = await fetch(`${apiBaseUrl}/api/optimizer/optimize`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token') || ''}` },
		body: JSON.stringify(req),
	})
	if (!res.ok) throw new Error('Failed to fetch recommendations')
	return (await res.json()) as { recommendations: Recommendation[]; explanations: string[]; latency_ms: number }
}

export async function applyOverride(payload: {
	controller_id: string
	train_id: string
	action: string
	ai_action?: string
	reason?: string
	timestamp: number
}) {
	const res = await fetch(`${apiBaseUrl}/api/overrides/apply`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token') || ''}` },
		body: JSON.stringify(payload),
	})
	if (!res.ok) throw new Error('Failed to apply override')
	return await res.json()
}

export async function fetchOverrides() {
	const res = await fetch(`${apiBaseUrl}/api/overrides/logs`, {
		headers: { Authorization: `Bearer ${localStorage.getItem('token') || ''}` },
	})
	if (!res.ok) {
		if (res.status === 401) throw new Error('Unauthorized')
		throw new Error(`Failed to fetch overrides (${res.status})`)
	}
	return (await res.json()) as Array<{ id: string; controller_id: string; train_id: string; action: string; ai_action?: string; reason?: string; timestamp: number }>
}

export async function fetchSchedules() {
	const res = await fetch(`${apiBaseUrl}/api/ingest/schedules`, {
		headers: { Authorization: `Bearer ${localStorage.getItem('token') || ''}` },
	})
	if (!res.ok) throw new Error('Failed to fetch schedules')
	return (await res.json()) as Array<{ id: number; train_id: string; station_id: string; planned_arrival_ts?: number; planned_departure_ts?: number; platform?: string }>
}

export async function fetchPositions() {
	const res = await fetch(`${apiBaseUrl}/api/ingest/positions`, {
		headers: { Authorization: `Bearer ${localStorage.getItem('token') || ''}` },
	})
	if (!res.ok) throw new Error('Failed to fetch positions')
	return (await res.json()) as Array<{ train_id: string; section_id: string; planned_block_id?: string; actual_block_id?: string; location_km: number; speed_kmph: number; timestamp: number }>
}

export async function fetchKpis() {
	const res = await fetch(`${apiBaseUrl}/api/reports/kpis`, {
		headers: { Authorization: `Bearer ${localStorage.getItem('token') || ''}` },
	})
	if (!res.ok) throw new Error('Failed to fetch KPIs')
	return (await res.json()) as { throughput_per_hour: number; avg_delay_minutes: number; congestion_index: number; on_time_percentage: number }
}

export async function fetchDelayTrends(hours = 24) {
	const res = await fetch(`${apiBaseUrl}/api/reports/delay_trends?hours=${hours}`, {
		headers: { Authorization: `Bearer ${localStorage.getItem('token') || ''}` },
	})
	if (!res.ok) throw new Error('Failed to fetch delay trends')
	return (await res.json()) as { labels: string[]; series: number[] }
}

export async function fetchThroughput(hours = 24) {
	const res = await fetch(`${apiBaseUrl}/api/reports/throughput?hours=${hours}`, {
		headers: { Authorization: `Bearer ${localStorage.getItem('token') || ''}` },
	})
	if (!res.ok) throw new Error('Failed to fetch throughput')
	return (await res.json()) as { data: Array<{ label: string; value: number }> }
}

export async function fetchHotspots(hours = 24, top_sections = 4, buckets = 5) {
	const res = await fetch(`${apiBaseUrl}/api/reports/hotspots?hours=${hours}&top_sections=${top_sections}&buckets=${buckets}`, {
		headers: { Authorization: `Bearer ${localStorage.getItem('token') || ''}` },
	})
	if (!res.ok) throw new Error('Failed to fetch hotspots')
	return (await res.json()) as { xLabels: string[]; yLabels: string[]; data: number[][] }
}

export async function login(username: string, password: string) {
	const form = new URLSearchParams()
	form.append('username', username)
	form.append('password', password)
	
	let res: Response
	try {
		res = await fetch(`${apiBaseUrl}/api/users/login`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
			body: form.toString(),
		})
	} catch (error: any) {
		// Network error (connection refused, timeout, etc.)
		if (error.name === 'TypeError' && error.message.includes('fetch')) {
			throw new Error('Cannot connect to server. Please check if the backend is running.')
		}
		throw new Error(`Network error: ${error.message}`)
	}
	
	if (!res.ok) {
		let errorMessage = 'Login failed'
		try {
			const errorData = await res.json()
			if (errorData.detail) {
				errorMessage = errorData.detail
			}
		} catch {
			// If response is not JSON, use status text
			if (res.status === 502) {
				errorMessage = 'Server is temporarily unavailable (502 Bad Gateway). Please try again later.'
			} else if (res.status === 503) {
				errorMessage = 'Service unavailable. Database connection error.'
			} else if (res.status === 500) {
				errorMessage = 'Internal server error. Please try again later.'
			} else {
				errorMessage = `Login failed: ${res.statusText} (${res.status})`
			}
		}
		throw new Error(errorMessage)
	}
	
	const data = (await res.json()) as { access_token: string; token_type: string }
	localStorage.setItem('token', data.access_token)
	return data
}

export async function fetchMe() {
	const res = await fetch(`${apiBaseUrl}/api/users/me`, {
		headers: { Authorization: `Bearer ${localStorage.getItem('token') || ''}` },
	})
	if (!res.ok) throw new Error('Unauthorized')
	return (await res.json()) as { id: number; username: string; role: string }
}


export async function signup(username: string, password: string, role: 'controller' | 'admin' = 'controller') {
	const res = await fetch(`${apiBaseUrl}/api/users/signup`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ username, password, role }),
	})
	if (!res.ok) {
		const msg = await res.text()
		throw new Error(msg || 'Signup failed')
	}
	return (await res.json()) as { id: number; username: string; role: string }
}

// Simulation & Digital Twin API functions
export type DisruptionType = 'delay' | 'track_block' | 'platform_issue' | 'rolling_stock' | 'signal_failure'

export type Disruption = {
	type: DisruptionType
	description?: string
	start_ts: number
	duration_seconds: number
	section_id?: string
	station_id?: string
	severity: 'low' | 'medium' | 'high'
}

export type SimulationScenario = {
	name: string
	disruptions: Disruption[]
}

export type SimulationResult = {
	id: string
	impacted_trains: string[]
	metrics: {
		total_delay_minutes: number
		missed_connections: number
		platform_conflicts: number
		throughput_impact_percent: number
		passenger_delay_hours: number
	}
	predictions: {
		timeline: Array<{
			timestamp: number
			event: string
			impact: string
		}>
		train_impacts: Array<{
			train_id: string
			delay_minutes: number
			status: 'on_time' | 'delayed' | 'cancelled'
		}>
	}
}

export async function runSimulation(scenario: SimulationScenario): Promise<SimulationResult> {
	console.log('API call to runSimulation with:', scenario);
	const res = await fetch(`${apiBaseUrl}/api/simulator/run`, {
		method: 'POST',
		headers: { 
			'Content-Type': 'application/json', 
			Authorization: `Bearer ${localStorage.getItem('token') || ''}` 
		},
		body: JSON.stringify(scenario),
	})
	console.log('API response status:', res.status);
	if (!res.ok) {
		const errorText = await res.text();
		console.error('API error response:', errorText);
		throw new Error(`Failed to run simulation: ${res.status} - ${errorText}`)
	}
	const result = await res.json();
	console.log('API response data:', result);
	return result as SimulationResult
}

export async function applySimulationToReal(simulationId: string): Promise<{ 
	success: boolean; 
	message: string;
	details?: {
		actions_applied: string[];
		schedule_updates: {
			trains_updated: number;
			platform_changes: number;
			schedule_adjustments: number;
			passenger_notifications: boolean;
		};
		notifications_sent: string[];
	}
}> {
	const res = await fetch(`${apiBaseUrl}/api/simulator/apply`, {
		method: 'POST',
		headers: { 
			'Content-Type': 'application/json', 
			Authorization: `Bearer ${localStorage.getItem('token') || ''}` 
		},
		body: JSON.stringify({ simulation_id: simulationId }),
	})
	if (!res.ok) throw new Error('Failed to apply simulation')
	return (await res.json()) as { 
		success: boolean; 
		message: string;
		details?: {
			actions_applied: string[];
			schedule_updates: {
				trains_updated: number;
				platform_changes: number;
				schedule_adjustments: number;
				passenger_notifications: boolean;
			};
			notifications_sent: string[];
		}
	}
}

// Train Logs & Schedules API functions
export type TrainLog = {
	id: number
	train_id: string
	station_id: string
	section_id: string
	event_type: string
	planned_time?: string
	actual_time?: string
	delay_minutes?: number
	status?: string
	platform?: string
	notes?: string
	timestamp: string
}

export type TrainSchedule = {
	id: number
	train_id: string
	station_id: string
	planned_arrival?: string
	actual_arrival?: string
	planned_departure?: string
	actual_departure?: string
	planned_platform?: string
	actual_platform?: string
	status?: string
	delay_minutes?: number
}

export type TimelineData = {
	timeline: Record<string, Array<{
		station_id: string
		section_id: string
		event_type: string
		planned_time?: string
		actual_time?: string
		delay_minutes?: number
		status?: string
		platform?: string
	}>>
	time_range: {
		start: string
		end: string
	}
}

export type LogStats = {
	total_logs: number
	delayed_trains: number
	average_delay_minutes: number
	on_time_percentage: number
	total_schedules: number
}

export async function fetchTrainLogs(params: {
	train_id?: string
	section_id?: string
	station_id?: string
	event_type?: string
	hours?: number
	limit?: number
} = {}) {
	const searchParams = new URLSearchParams()
	Object.entries(params).forEach(([key, value]) => {
		if (value !== undefined) searchParams.append(key, value.toString())
	})
	
	const res = await fetch(`${apiBaseUrl}/api/train-logs/logs?${searchParams}`)
	if (!res.ok) throw new Error('Failed to fetch train logs')
	return (await res.json()) as { logs: TrainLog[]; total: number }
}

export async function fetchTrainSchedules(params: {
	train_id?: string
	station_id?: string
	status?: string
	hours?: number
	limit?: number
} = {}) {
	const searchParams = new URLSearchParams()
	Object.entries(params).forEach(([key, value]) => {
		if (value !== undefined) searchParams.append(key, value.toString())
	})
	
	const res = await fetch(`${apiBaseUrl}/api/train-logs/schedules?${searchParams}`)
	if (!res.ok) throw new Error('Failed to fetch train schedules')
	return (await res.json()) as { schedules: TrainSchedule[]; total: number }
}

export async function fetchTimelineData(params: {
	train_id?: string
	section_id?: string
	hours?: number
} = {}) {
	const searchParams = new URLSearchParams()
	Object.entries(params).forEach(([key, value]) => {
		if (value !== undefined) searchParams.append(key, value.toString())
	})
	
	const res = await fetch(`${apiBaseUrl}/api/train-logs/timeline?${searchParams}`)
	if (!res.ok) throw new Error('Failed to fetch timeline data')
	return (await res.json()) as TimelineData
}

export async function fetchLogStats(hours = 24) {
	const res = await fetch(`${apiBaseUrl}/api/train-logs/stats?hours=${hours}`)
	if (!res.ok) throw new Error('Failed to fetch log stats')
	return (await res.json()) as LogStats
}


