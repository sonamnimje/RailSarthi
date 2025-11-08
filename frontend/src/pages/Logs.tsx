import { useEffect, useMemo, useState } from 'react'
import { fetchTrainLogs, fetchTrainSchedules, fetchLogStats, type TrainLog, type TrainSchedule, type LogStats } from '../lib/api'

export default function LogsPage() {
	const [logs, setLogs] = useState<TrainLog[]>([])
	const [schedules, setSchedules] = useState<TrainSchedule[]>([])
	const [stats, setStats] = useState<LogStats | null>(null)
	const [error, setError] = useState<string | null>(null)
	const [loading, setLoading] = useState(true)
	
	// Filters
	const [trainFilter, setTrainFilter] = useState('')
	const [sectionFilter, setSectionFilter] = useState('')
	const [timeFilter, setTimeFilter] = useState(24)
	const [viewMode, setViewMode] = useState<'schedules' | 'logs'>('schedules')
	const [statusFilter, setStatusFilter] = useState('')

	useEffect(() => {
		loadData()
	}, [trainFilter, sectionFilter, timeFilter, statusFilter, viewMode])

	const loadData = async () => {
		setLoading(true)
		setError(null)
		
		try {
			const params = {
				train_id: trainFilter || undefined,
				section_id: sectionFilter || undefined,
				hours: timeFilter,
				status: statusFilter || undefined,
				limit: 100
			}

			const [logsResult, schedulesResult, statsResult] = await Promise.all([
				fetchTrainLogs(params),
				fetchTrainSchedules(params),
				fetchLogStats(timeFilter)
			])

			setLogs(logsResult.logs)
			setSchedules(schedulesResult.schedules)
			setStats(statsResult)
		} catch (e) {
			setError(e instanceof Error ? e.message : 'Failed to load data')
		} finally {
			setLoading(false)
		}
	}

	const formatTime = (timeStr?: string) => {
		if (!timeStr) return '-'
		return new Date(timeStr).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
	}

	const formatDelay = (delay?: number) => {
		if (delay === null || delay === undefined) return '-'
		if (delay === 0) return '0m'
		return `${delay > 0 ? '+' : ''}${delay}m`
	}

	const getStatusColor = (status?: string, delay?: number) => {
		if (delay && delay > 0) return 'text-red-600'
		if (status === 'delayed') return 'text-red-600'
		if (status === 'cancelled') return 'text-gray-500'
		if (status === 'arrived' || status === 'departed') return 'text-green-600'
		return 'text-blue-600'
	}

	const getReadableStatus = (status?: string, delay?: number) => {
		if (status === 'cancelled') return 'Cancelled'
		if (status === 'arrived') return delay && delay > 0 ? 'Arrived Late' : 'On Time'
		if (status === 'departed') return 'Departed'
		if (status === 'delayed' || (delay !== undefined && delay > 0)) return 'Delayed'
		return 'On Time'
	}

	// Timeline view removed from Logs page

	return (
		<div className="p-6 bg-white">
			<div className="flex items-center justify-between mb-6">
				<h2 className="text-4xl font-extrabold text-gray-800">📑 Train Logs & Schedules</h2>
				{stats && (
					<div className="flex gap-4 text-sm">
						<div className="text-blue-600">Total Logs: {stats.total_logs}</div>
						<div className="text-red-600">Delayed: {stats.delayed_trains}</div>
						<div className="text-green-600">On Time: {stats.on_time_percentage}%</div>
						<div className="text-orange-600">Avg Delay: {stats.average_delay_minutes}min</div>
					</div>
				)}
			</div>

			{error && <div className="text-red-600 mb-4 p-3 bg-red-50 rounded border border-red-200">{error}</div>}

			{/* Filters */}
			<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
				<div>
					<label className="block text-sm text-gray-600 mb-1">Train Number</label>
					<input
						className="bg-white border border-gray-300 rounded px-3 py-2 w-full text-sm text-gray-800 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
						placeholder="Filter by train ID"
						value={trainFilter}
						onChange={(e) => setTrainFilter(e.target.value)}
					/>
				</div>
				<div>
					<label className="block text-sm text-gray-600 mb-1">Section</label>
					<input
						className="bg-white border border-gray-300 rounded px-3 py-2 w-full text-sm text-gray-800 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
						placeholder="Filter by section"
						value={sectionFilter}
						onChange={(e) => setSectionFilter(e.target.value)}
					/>
				</div>
				<div>
					<label className="block text-sm text-gray-600 mb-1">Time Range</label>
					<select
						className="bg-white border border-gray-300 rounded px-3 py-2 w-full text-sm text-gray-800 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
						value={timeFilter}
						onChange={(e) => setTimeFilter(Number(e.target.value))}
					>
						<option value={1}>Last 1 hour</option>
						<option value={6}>Last 6 hours</option>
						<option value={24}>Last 24 hours</option>
						<option value={72}>Last 3 days</option>
						<option value={168}>Last week</option>
					</select>
				</div>
				<div>
					<label className="block text-sm text-gray-600 mb-1">Status</label>
					<select
						className="bg-white border border-gray-300 rounded px-3 py-2 w-full text-sm text-gray-800 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
						value={statusFilter}
						onChange={(e) => setStatusFilter(e.target.value)}
					>
						<option value="">All Status</option>
						<option value="scheduled">Scheduled</option>
						<option value="arrived">Arrived</option>
						<option value="departed">Departed</option>
						<option value="delayed">Delayed</option>
						<option value="cancelled">Cancelled</option>
					</select>
				</div>
			</div>

			{/* View Mode Toggle */}
			<div className="flex gap-2 mb-4">
				<button
					className={`px-4 py-2 rounded text-sm font-medium ${
						viewMode === 'schedules' 
							? 'bg-blue-600 text-white' 
							: 'bg-gray-200 text-gray-700 hover:bg-gray-300'
					}`}
					onClick={() => setViewMode('schedules')}
				>
					Schedules
				</button>
				<button
					className={`px-4 py-2 rounded text-sm font-medium ${
						viewMode === 'logs' 
							? 'bg-blue-600 text-white' 
							: 'bg-gray-200 text-gray-700 hover:bg-gray-300'
					}`}
					onClick={() => setViewMode('logs')}
				>
					Logs
				</button>
				{/* Timeline toggle removed */}
			</div>

			{loading ? (
				<div className="text-center py-8 text-gray-500">Loading...</div>
			) : (viewMode === 'schedules' && schedules.length === 0) || (viewMode === 'logs' && logs.length === 0) ? (
				<div className="text-center py-8 text-gray-500 rounded-lg border border-gray-300 bg-white shadow-sm">
					No data found for the selected filters
				</div>
			) : (
				<div className="rounded-lg border border-gray-300 overflow-hidden bg-white shadow-sm">
					{viewMode === 'schedules' && (
						<div className="overflow-x-auto">
							<table className="w-full text-sm">
								<thead className="bg-gray-100 border-b border-gray-300">
									<tr>
										<th className="text-left p-4 text-gray-700 font-semibold">Train ID</th>
										<th className="text-left p-4 text-gray-700 font-semibold">Station</th>
										<th className="text-left p-4 text-gray-700 font-semibold">Scheduled Arrival</th>
										<th className="text-left p-4 text-gray-700 font-semibold">Actual Arrival</th>
										<th className="text-left p-4 text-gray-700 font-semibold">Delay</th>
										<th className="text-left p-4 text-gray-700 font-semibold">Status</th>
										<th className="text-left p-4 text-gray-700 font-semibold">Platform</th>
									</tr>
								</thead>
								<tbody className="divide-y divide-gray-200">
									{schedules.map((schedule) => (
										<tr key={schedule.id} className="hover:bg-gray-50 transition-colors">
											<td className="p-4 font-medium text-blue-600">{schedule.train_id}</td>
											<td className="p-4 text-gray-800">{schedule.station_id}</td>
											<td className="p-4 text-gray-600">{formatTime(schedule.planned_arrival)}</td>
											<td className="p-4 text-gray-600">{formatTime(schedule.actual_arrival)}</td>
											<td className={`p-4 font-medium ${getStatusColor(schedule.status, schedule.delay_minutes)}`}>
												{formatDelay(schedule.delay_minutes)}
											</td>
											<td className={`p-4 font-medium ${getStatusColor(schedule.status, schedule.delay_minutes)}`}>
												{schedule.status || 'Scheduled'}
											</td>
											<td className="p-4 text-gray-500">{schedule.actual_platform || schedule.planned_platform || '-'}</td>
										</tr>
									))}
								</tbody>
							</table>
				</div>
					)}

					{viewMode === 'logs' && (
						<div className="overflow-x-auto">
							<table className="w-full text-sm">
								<thead className="bg-gray-100 border-b border-gray-300">
									<tr>
										<th className="text-left p-4 text-gray-700 font-semibold">Train ID</th>
										<th className="text-left p-4 text-gray-700 font-semibold">Station</th>
										<th className="text-left p-4 text-gray-700 font-semibold">Scheduled Arrival</th>
										<th className="text-left p-4 text-gray-700 font-semibold">Actual Arrival</th>
										<th className="text-left p-4 text-gray-700 font-semibold">Delay</th>
										<th className="text-left p-4 text-gray-700 font-semibold">Status</th>
										<th className="text-left p-4 text-gray-700 font-semibold">Platform</th>
									</tr>
								</thead>
								<tbody className="divide-y divide-gray-200">
									{logs.map((log) => (
										<tr key={log.id} className="hover:bg-gray-50 transition-colors">
											<td className="p-4 font-medium text-blue-600">{log.train_id}</td>
											<td className="p-4 text-gray-800">{log.station_id}</td>
											<td className="p-4 text-gray-600">{formatTime(log.planned_time)}</td>
											<td className="p-4 text-gray-600">{formatTime(log.actual_time)}</td>
											<td className={`p-4 font-medium ${getStatusColor(log.status, log.delay_minutes)}`}>{formatDelay(log.delay_minutes)}</td>
											<td className={`p-4 font-medium ${getStatusColor(log.status, log.delay_minutes)}`}>{getReadableStatus(log.status, log.delay_minutes)}</td>
											<td className="p-4 text-gray-500">{log.platform || '-'}</td>
										</tr>
									))}
								</tbody>
							</table>
						</div>
					)}

					{/* Timeline view removed */}
				</div>
			)}
		</div>
	)
}


