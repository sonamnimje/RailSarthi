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

export type KPIResponse = {
	throughput_per_hour: number
	avg_delay_minutes: number
	congestion_index: number
	on_time_percentage: number
	max_delay_today?: {
		train_id?: string | null
		delay_minutes?: number | null
		station_id?: string | null
		recorded_at?: string | null
	} | null
	delay_propagation_index?: number
	recommended_refresh_seconds?: number
	updated_at?: string
}

export type DelayTrendsResponse = {
	labels: string[]
	series: number[]
	hourly?: { labels: string[]; series: number[] }
	last7days?: { labels: string[]; series: number[] }
	by_type?: Array<{ type: string; direction: string; avg_delay: number; section_id?: string | null; sample_size: number }>
	division_comparison?: Array<{ section_id?: string | null; zone: string; division: string; avg_delay: number; samples: number }>
}

export type ThroughputAnalyticsResponse = {
	data: Array<{ type: string; throughput: number }>
	actual_vs_ai?: Array<{ bucket: string; label: string; actual: number; optimized: number }>
	real_vs_simulated?: Array<{ label: string; value: number }>
	division_throughput?: Array<{ section_id?: string | null; zone: string; division: string; value: number }>
	hourly_heatmap?: { xLabels: string[]; yLabels: string[]; data: number[][] }
}

export type BottleneckResponse = {
	bottlenecks: Array<{
		section_id?: string | null
		zone: string
		division: string
		stations: string[]
		no_of_delays: number
		total_events: number
		avg_delay: number
		max_delay: number
		max_congestion: number
		most_delayed_train?: string | null
		time_slot?: string | null
		bottleneck_score: number
	}>
	heatmap?: { xLabels: string[]; yLabels: string[]; data: number[][] }
}

export type ZoneSummaryResponse = {
	zones: Array<{ zone: string; avg_delay: number; running_trains: number; congestion_level: number }>
	divisions: Array<{ zone: string; division: string; running_trains: number; avg_delay: number; congestion_level: number }>
	updated_at?: string
}

export type AIRecommendationsResponse = {
	recommendations: Array<{ time: string; train: string; section_id?: string | null; station_id?: string | null; action: string; reason: string; delay: number; delay_saved: number }>
	summary: { total_recommendations: number; total_delay_saved: number; generated_at: string }
}

export type CorrelationResponse = {
	points: Array<{ section_id?: string | null; zone: string; division: string; throughput: number; avg_delay: number }>
	trendline: { slope: number; intercept: number; r_squared: number }
	updated_at?: string
}

export type DisruptionImpactResponse = {
	scenarios: Array<{
		id: string
		name?: string
		generated_at?: string
		table: Array<{ disruption: string; impact: string; delay_caused: number; trains_affected: number }>
		before_after: Array<{ metric: string; before: number; after: number }>
	}>
	count: number
}

export type AlertsResponse = {
	alerts: Array<{ id: string; message: string; details?: string; section_id?: string | null; zone?: string; division?: string; severity: string; timestamp: string }>
}

export type TrainReportResponse = {
	train_id: string
	timeline: Array<{ station_id?: string | null; section_id?: string | null; event_type?: string | null; planned_time?: string | null; actual_time?: string | null; delay_minutes?: number; status?: string | null }>
	delay_profile: Array<{ station_id?: string | null; delay: number }>
	speed_profile: Array<{ section_id?: string | null; location_km: number; speed_kmph: number; timestamp?: string | null }>
	conflicts: Array<{ section_id?: string | null; station_id?: string | null; type: string; description: string }>
	ai_actions: Array<{ station_id?: string | null; action: string; reason: string; applied: boolean }>
	generated_at?: string
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

export async function fetchKpis(hours = 24): Promise<KPIResponse> {
	const res = await fetch(`${apiBaseUrl}/api/reports/kpi?hours=${hours}`, {
		headers: { Authorization: `Bearer ${localStorage.getItem('token') || ''}` },
	})
	if (!res.ok) throw new Error('Failed to fetch KPIs')
	return (await res.json()) as KPIResponse
}

export async function fetchDelayTrends(hours = 24): Promise<DelayTrendsResponse> {
	const res = await fetch(`${apiBaseUrl}/api/reports/delay_trends?hours=${hours}`, {
		headers: { Authorization: `Bearer ${localStorage.getItem('token') || ''}` },
	})
	if (res.status === 401) throw new Error('Unauthorized')
	if (!res.ok) throw new Error('Failed to fetch delay trends')
	return (await res.json()) as DelayTrendsResponse
}

export async function fetchThroughput(hours = 24): Promise<ThroughputAnalyticsResponse> {
	const res = await fetch(`${apiBaseUrl}/api/reports/throughput?hours=${hours}`, {
		headers: { Authorization: `Bearer ${localStorage.getItem('token') || ''}` },
	})
	if (!res.ok) throw new Error('Failed to fetch throughput')
	return (await res.json()) as ThroughputAnalyticsResponse
}

export async function fetchHotspots(hours = 24, top_sections = 4, buckets = 5): Promise<BottleneckResponse> {
	const res = await fetch(`${apiBaseUrl}/api/reports/bottlenecks?hours=${hours}&top_n=${top_sections}&buckets=${buckets}`, {
		headers: { Authorization: `Bearer ${localStorage.getItem('token') || ''}` },
	})
	if (!res.ok) throw new Error('Failed to fetch bottlenecks')
	return (await res.json()) as BottleneckResponse
}

export async function fetchZoneSummary(hours = 24): Promise<ZoneSummaryResponse> {
	const res = await fetch(`${apiBaseUrl}/api/reports/zone-summary?hours=${hours}`, {
		headers: { Authorization: `Bearer ${localStorage.getItem('token') || ''}` },
	})
	if (res.status === 401) throw new Error('Unauthorized')
	if (!res.ok) throw new Error('Failed to fetch zone summary')
	return (await res.json()) as ZoneSummaryResponse
}

export async function fetchAIRecommendations(limit = 8): Promise<AIRecommendationsResponse> {
	const res = await fetch(`${apiBaseUrl}/api/reports/ai-recommendations?limit=${limit}`, {
		headers: { Authorization: `Bearer ${localStorage.getItem('token') || ''}` },
	})
	if (!res.ok) throw new Error('Failed to fetch AI recommendations')
	return (await res.json()) as AIRecommendationsResponse
}

export async function fetchThroughputDelayCorrelation(hours = 24): Promise<CorrelationResponse> {
	const res = await fetch(`${apiBaseUrl}/api/reports/throughput-delay-correlation?hours=${hours}`, {
		headers: { Authorization: `Bearer ${localStorage.getItem('token') || ''}` },
	})
	if (!res.ok) throw new Error('Failed to fetch correlation data')
	return (await res.json()) as CorrelationResponse
}

export async function fetchDisruptionImpact(): Promise<DisruptionImpactResponse> {
	const res = await fetch(`${apiBaseUrl}/api/reports/disruption-impact`, {
		headers: { Authorization: `Bearer ${localStorage.getItem('token') || ''}` },
	})
	if (!res.ok) throw new Error('Failed to fetch disruption impact')
	return (await res.json()) as DisruptionImpactResponse
}

export async function fetchAlerts(): Promise<AlertsResponse> {
	const res = await fetch(`${apiBaseUrl}/api/reports/alerts`, {
		headers: { Authorization: `Bearer ${localStorage.getItem('token') || ''}` },
	})
	if (!res.ok) throw new Error('Failed to fetch alerts')
	return (await res.json()) as AlertsResponse
}

export async function fetchTrainReport(trainId: string, hours = 24): Promise<TrainReportResponse> {
	const res = await fetch(`${apiBaseUrl}/api/reports/train-report/${encodeURIComponent(trainId)}?hours=${hours}`, {
		headers: { Authorization: `Bearer ${localStorage.getItem('token') || ''}` },
	})
	if (!res.ok) throw new Error('Failed to fetch train report')
	return (await res.json()) as TrainReportResponse
}

export type LiveTrain = {
	trainNumber: string
	trainName: string
	trainType?: string
	arrivalTime: string
	departureTime: string
	status: string
	platform_number?: string | number | null
	train_src?: string | null
	stop: boolean
	station_name?: string | null
	halt?: string | number | null
	on_time_rating?: string | number | null
	delay?: string | number | null
}

export type LiveTrainsResponse = {
	station: string
	total_trains: number
	trains: LiveTrain[]
}

export async function fetchLiveTrains(params: {
	fromStationCode: string
	hours?: number
	trainNo?: string
}): Promise<LiveTrainsResponse> {
	const search = new URLSearchParams()
	search.set('fromStationCode', params.fromStationCode)
	if (typeof params.hours === 'number') {
		search.set('hours', params.hours.toString())
	}
	if (params.trainNo) {
		search.set('trainNo', params.trainNo)
	}

	const res = await fetch(`${apiBaseUrl}/api/live/live-trains?${search.toString()}`, {
		headers: { Authorization: `Bearer ${localStorage.getItem('token') || ''}` },
	})

	const rawBody = await res.text()

	if (!res.ok) {
		let message = `Failed to fetch live trains (${res.status})`
		if (rawBody) {
			try {
				const maybeJson = JSON.parse(rawBody)
				if (maybeJson && typeof maybeJson === 'object' && 'detail' in maybeJson) {
					message = String((maybeJson as { detail: unknown }).detail)
				} else if (typeof maybeJson === 'string') {
					message = maybeJson
				}
			} catch {
				message = rawBody
			}
		}
		throw new Error(message)
	}

	try {
		return JSON.parse(rawBody) as LiveTrainsResponse
	} catch {
		throw new Error('Invalid live trains response payload')
	}
}

// Master chart types removed
/*export type MasterChartItem = {
	zone: string
	division: string
	chart_url: string
	csv_url: string
}

export async function fetchMasterCharts(): Promise<{ charts: MasterChartItem[] }> {
	throw new Error('Master chart functionality has been removed')
}
*/

export async function login(
	username: string, 
	password: string,
	captchaId?: string,
	captchaAnswer?: string
) {
	const form = new URLSearchParams()
	form.append('username', username)
	form.append('password', password)
	if (captchaId) {
		form.append('captcha_id', captchaId)
	}
	if (captchaAnswer) {
		form.append('captcha_answer', captchaAnswer)
	}
	
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


export async function signup(
	username: string, 
	password: string, 
	role: 'controller' | 'admin' = 'controller',
	captchaId?: string,
	captchaAnswer?: string
) {
	let res: Response
	try {
		res = await fetch(`${apiBaseUrl}/api/users/signup`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ 
				username, 
				password, 
				role,
				captcha_id: captchaId,
				captcha_answer: captchaAnswer
			}),
		})
	} catch (error: any) {
		// Common browser message when CORS or server is unreachable
		if (error.name === 'TypeError' && typeof error.message === 'string' && error.message.includes('fetch')) {
			throw new Error('Cannot connect to server. Please check if the backend is running and CORS is configured.')
		}
		throw new Error(`Network error: ${error?.message || 'Unknown error'}`)
	}

	if (!res.ok) {
		// Try to extract a helpful message
		try {
			const maybeJson = await res.json()
			// Handle structured validation errors (e.g., password validation)
			if (maybeJson && typeof maybeJson === 'object') {
				// FastAPI 422 validation errors come as { detail: [{ loc: [...], msg: "...", type: "..." }] }
				if (maybeJson.detail && Array.isArray(maybeJson.detail)) {
					const passwordErrors = maybeJson.detail
						.filter((err: any) => err.loc && err.loc.includes('password'))
						.map((err: any) => err.msg || 'Password validation failed')
					if (passwordErrors.length > 0) {
						throw new Error(passwordErrors.join(' '))
					}
					// If no password-specific errors, use first error message
					if (maybeJson.detail.length > 0 && maybeJson.detail[0].msg) {
						throw new Error(maybeJson.detail[0].msg)
					}
				}
				// Handle object-style detail (e.g., { detail: { password: ["error1", "error2"] } })
				if (maybeJson.detail && typeof maybeJson.detail === 'object' && !Array.isArray(maybeJson.detail)) {
					if (maybeJson.detail.password && Array.isArray(maybeJson.detail.password)) {
						throw new Error(maybeJson.detail.password.join(' '))
					}
					// Or as a single detail string
					if (typeof maybeJson.detail === 'string') {
						throw new Error(maybeJson.detail)
					}
				}
				// Fallback to detail or message
				const detail = (maybeJson.detail || maybeJson.message) as string | undefined
				if (detail && typeof detail === 'string') {
					throw new Error(detail)
				}
			}
		} catch (error: any) {
			// If we already threw an error with a message, re-throw it
			if (error instanceof Error && error.message) {
				throw error
			}
			// Fallbacks for common statuses
			if (res.status === 422) {
				// Pydantic validation errors (422 Unprocessable Entity)
				throw new Error('Password validation failed. Please check the password requirements.')
			} else if (res.status === 502) {
				throw new Error('Server is temporarily unavailable (502 Bad Gateway). Please try again later.')
			} else if (res.status === 503) {
				throw new Error('Service unavailable. Database connection error.')
			} else if (res.status === 500) {
				throw new Error('Internal server error. Please try again later.')
			}
		}
		throw new Error(`Signup failed: ${res.statusText} (${res.status})`)
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
	
	const res = await fetch(`${apiBaseUrl}/api/train-logs/logs?${searchParams}`, {
		headers: { Authorization: `Bearer ${localStorage.getItem('token') || ''}` },
	})
	if (res.status === 401) throw new Error('Unauthorized')
	if (!res.ok) throw new Error('Failed to fetch train logs')
	return (await res.json()) as { logs: TrainLog[]; total: number }
}

export async function fetchTrainSchedules(params: {
	train_id?: string
	station_id?: string
	section_id?: string
	status?: string
	hours?: number
	limit?: number
} = {}) {
	const searchParams = new URLSearchParams()
	Object.entries(params).forEach(([key, value]) => {
		if (value !== undefined) searchParams.append(key, value.toString())
	})
	
	const res = await fetch(`${apiBaseUrl}/api/train-logs/schedules?${searchParams}`, {
		headers: { Authorization: `Bearer ${localStorage.getItem('token') || ''}` },
	})
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
	
	const res = await fetch(`${apiBaseUrl}/api/train-logs/timeline?${searchParams}`, {
		headers: { Authorization: `Bearer ${localStorage.getItem('token') || ''}` },
	})
	if (!res.ok) throw new Error('Failed to fetch timeline data')
	return (await res.json()) as TimelineData
}

export async function fetchLogStats(hours = 24) {
	const res = await fetch(`${apiBaseUrl}/api/train-logs/stats?hours=${hours}`, {
		headers: { Authorization: `Bearer ${localStorage.getItem('token') || ''}` },
	})
	if (!res.ok) throw new Error('Failed to fetch log stats')
	return (await res.json()) as LogStats
}

// AI Recommendation API functions
export type AIRecommendation = {
	conflict_id: string
	conflict?: {
		type: string
		section: string
		trains: string[]
		severity?: string
		distance_km?: number
	}
	solution: {
		precedence: string[]
		holds: Record<string, number>
		crossing?: string
		speed_adjust: Record<string, number>
	}
	confidence: number
	explanation: string
	feature_importances?: Record<string, number>
	timestamp: string
	expected_delta_kpis?: {
		delay_reduction_minutes: number
		throughput_impact: number
	}
}

export async function getRecommendations(division: string): Promise<AIRecommendation[]> {
	const res = await fetch(`${apiBaseUrl}/api/ai/recommendation?division=${encodeURIComponent(division)}`, {
		method: 'GET',
		headers: { 
			'Content-Type': 'application/json',
			Authorization: `Bearer ${localStorage.getItem('token') || ''}` 
		}
	})
	if (!res.ok) throw new Error('Failed to fetch recommendations')
	return (await res.json()) as AIRecommendation[]
}

export async function getLatestRecommendations(division: string): Promise<AIRecommendation[]> {
	const res = await fetch(`${apiBaseUrl}/api/ai/recommendation/latest?division=${encodeURIComponent(division)}`, {
		headers: { Authorization: `Bearer ${localStorage.getItem('token') || ''}` },
	})
	if (!res.ok) throw new Error('Failed to fetch latest recommendations')
	return (await res.json()) as AIRecommendation[]
}

export async function acceptRecommendation(division: string, recommendationId: string, userId?: string): Promise<{ status: string; message: string }> {
	const res = await fetch(`${apiBaseUrl}/api/ai/accept`, {
		method: 'POST',
		headers: { 
			'Content-Type': 'application/json',
			Authorization: `Bearer ${localStorage.getItem('token') || ''}` 
		},
		body: JSON.stringify({
			division,
			recommendation_id: recommendationId,
			user_id: userId
		})
	})
	if (!res.ok) throw new Error('Failed to accept recommendation')
	return (await res.json()) as { status: string; message: string }
}

export async function submitOverride(
	division: string,
	recommendationId: string,
	humanSolution: Record<string, any>,
	reason?: string,
	userId?: string
): Promise<{ status: string; override_id: string }> {
	const res = await fetch(`${apiBaseUrl}/api/ai/override`, {
		method: 'POST',
		headers: { 
			'Content-Type': 'application/json',
			Authorization: `Bearer ${localStorage.getItem('token') || ''}` 
		},
		body: JSON.stringify({
			division,
			recommendation_id: recommendationId,
			human_solution: humanSolution,
			reason,
			user_id: userId
		})
	})
	if (!res.ok) throw new Error('Failed to submit override')
	return (await res.json()) as { status: string; override_id: string }
}

// Digital Twin API functions
export type DigitalTwinMapData = {
	division: string;
	stations: Array<{
		stationCode: string;
		stationName: string;
		lat: number;
		lon: number;
	}>;
	sections: Array<{
		section_id: string;
		from: string;
		to: string;
	}>;
};

export type DigitalTwinPosition = {
	trainNo: string;
	trainName?: string;
	trainType?: string;
	position: {
		sectionId: string;
		progress: number; // 0.0 to 1.0, how far along the section
	};
	speed?: number;
	status?: 'RUNNING' | 'STOPPED' | 'DELAYED';
	delay?: number;
};

export type DigitalTwinPositionsResponse = {
	timestamp: string;
	trains: DigitalTwinPosition[];
};

export async function fetchDigitalTwinMap(division: string): Promise<DigitalTwinMapData> {
	const res = await fetch(`${apiBaseUrl}/api/digital-twin/${encodeURIComponent(division)}/map`, {
		headers: { Authorization: `Bearer ${localStorage.getItem('token') || ''}` },
	});
	if (!res.ok) throw new Error('Failed to fetch digital twin map data');
	return (await res.json()) as DigitalTwinMapData;
}

export async function fetchDigitalTwinPositions(division: string): Promise<DigitalTwinPositionsResponse> {
	const res = await fetch(`${apiBaseUrl}/api/digital-twin/${encodeURIComponent(division)}/positions`, {
		headers: { Authorization: `Bearer ${localStorage.getItem('token') || ''}` },
	});
	if (!res.ok) throw new Error('Failed to fetch digital twin positions');
	return (await res.json()) as DigitalTwinPositionsResponse;
}

// India Railway Map API functions
export type IndiaRailwayMapData = {
	stations: Array<{
		stationCode: string;
		stationName: string;
		lat: number;
		lon: number;
		division: string;
		isJunction: boolean;
	}>;
	sections: Array<{
		section_id: string;
		from: string;
		to: string;
		division: string;
		isTrunk: boolean;
		distanceKm: number;
	}>;
};

export type IndiaRailwayPosition = {
	trainNo: string;
	trainName?: string;
	trainType?: string;
	position: {
		sectionId: string;
		progress: number;
	};
	speed?: number;
	status?: 'RUNNING' | 'STOPPED' | 'DELAYED';
	delay?: number;
	division: string;
};

export type IndiaRailwayPositionsResponse = {
	timestamp: string;
	trains: IndiaRailwayPosition[];
};

export async function fetchIndiaRailwayMap(): Promise<IndiaRailwayMapData> {
	try {
		const res = await fetch(`${apiBaseUrl}/api/digital-twin/india/map`, {
			headers: { Authorization: `Bearer ${localStorage.getItem('token') || ''}` },
		});
		
		if (!res.ok) {
			const errorText = await res.text();
			let errorMessage = `Failed to fetch India railway map data (${res.status})`;
			try {
				const errorJson = JSON.parse(errorText);
				errorMessage = errorJson.detail || errorMessage;
			} catch {
				errorMessage = errorText || errorMessage;
			}
			throw new Error(errorMessage);
		}
		
		const data = await res.json() as IndiaRailwayMapData;
		console.log('India map API response:', { stations: data.stations?.length || 0, sections: data.sections?.length || 0 });
		return data;
	} catch (error) {
		console.error('fetchIndiaRailwayMap error:', error);
		throw error;
	}
}

export async function fetchIndiaRailwayPositions(): Promise<IndiaRailwayPositionsResponse> {
	const res = await fetch(`${apiBaseUrl}/api/digital-twin/india/positions`, {
		headers: { Authorization: `Bearer ${localStorage.getItem('token') || ''}` },
	});
	if (!res.ok) throw new Error('Failed to fetch India railway positions');
	return (await res.json()) as IndiaRailwayPositionsResponse;
}

// Simulation Run API
export type DelayInput = {
	train_id: string;
	delay_minutes: number;
};

export type SimulationRunRequest = {
	division: string;
	delays: DelayInput[];
	weather_enabled: boolean;
	auto_resolve_conflicts: boolean;
};

export type TrainTimeline = {
	station: string;
	scheduled_arrival: string;
	actual_arrival: string;
	scheduled_departure: string;
	actual_departure: string;
	delay_minutes: number;
	distance: number;
};

export type SimulationRunResult = {
	division: string;
	trains: Array<{
		train_id: string;
		train_name: string;
		train_type: string;
		priority: number;
		timeline: TrainTimeline[];
	}>;
	stations: string[];
	station_distances: Record<string, number>;
	conflicts: Array<{
		type: string;
		section_id: string;
		section_name: string;
		train1: string;
		train2: string;
		overlap_minutes: number;
		severity: string;
		start_time: string;
		end_time: string;
		recommendations?: string[];
		resolution?: string;
	}>;
	congested_sections: Array<{
		section_id: string;
		section_name: string;
		severity: string;
	}>;
	recommendations: Array<{
		type: string;
		section: string;
		trains: string[];
		reason: string;
	}>;
};

export async function runSimulationWithDelays(
	request: SimulationRunRequest
): Promise<SimulationRunResult> {
	const res = await fetch(`${apiBaseUrl}/api/simulation/run`, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			Authorization: `Bearer ${localStorage.getItem('token') || ''}`,
		},
		body: JSON.stringify(request),
	});
	if (!res.ok) throw new Error('Failed to run simulation');
	return (await res.json()) as SimulationRunResult;
}

// Capacity Utilization API
export type CapacityData = {
	time_window: string;
	sections: Array<{
		section_id: string;
		section_name: string;
		from_station: string;
		to_station: string;
		distance_km: number;
		tracks: number;
		max_speed_kmph: number;
		train_count: number;
		utilization_percent: number;
		total_time_occupied_minutes: number;
	}>;
	average_utilization: number;
};

export async function fetchCapacityUtilization(
	division: string,
	timeWindow: 'hour' | 'day' | 'week' = 'hour'
): Promise<CapacityData> {
	const res = await fetch(
		`${apiBaseUrl}/api/simulation/capacity?division=${division}&time_window=${timeWindow}`,
		{
			headers: { Authorization: `Bearer ${localStorage.getItem('token') || ''}` },
		}
	);
	if (!res.ok) throw new Error('Failed to fetch capacity data');
	return (await res.json()) as CapacityData;
}

// Conflicts API
export type ConflictsData = {
	division: string;
	conflicts: Array<{
		type: string;
		section_id: string;
		section_name: string;
		train1: string;
		train2: string;
		overlap_minutes: number;
		severity: string;
		start_time: string;
		end_time: string;
		recommendations: string[];
	}>;
	total_conflicts: number;
	high_severity: number;
	medium_severity: number;
};

export async function fetchConflicts(division: string): Promise<ConflictsData> {
	const res = await fetch(`${apiBaseUrl}/api/simulation/conflicts?division=${division}`, {
		headers: { Authorization: `Bearer ${localStorage.getItem('token') || ''}` },
	});
	if (!res.ok) throw new Error('Failed to fetch conflicts');
	return (await res.json()) as ConflictsData;
}

