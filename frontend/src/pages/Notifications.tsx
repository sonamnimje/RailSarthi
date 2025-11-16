import { AlertCircle, Bell } from 'lucide-react'

export default function NotificationsPage() {
	// Alerts data (replace with API calls later)
	const alerts = [
		{ type: 'congestion', message: 'Section SEC-001 experiencing high congestion', severity: 'high', time: '2 min ago' },
		{ type: 'delay', message: 'Train 12345 delayed by 15 minutes at Station A', severity: 'medium', time: '5 min ago' },
		{ type: 'block', message: 'Maintenance block scheduled for Section SEC-002', severity: 'low', time: '10 min ago' },
		{ type: 'weather', message: 'Heavy rain expected in Northern Railway zone', severity: 'medium', time: '15 min ago' },
		{ type: 'stalled', message: 'Train 18478 stalled at Station B - assistance dispatched', severity: 'high', time: '20 min ago' },
	]

	return (
		<div className="min-h-screen bg-gray-50 p-4 sm:p-6 lg:p-8">
			

			{/* Alerts & Notifications */}
			<div className="bg-white rounded-2xl shadow-lg p-6 border border-gray-200">
				<div className="flex items-center justify-between mb-4">
					<h2 className="text-xl font-semibold text-gray-900">Active Alerts</h2>
					<Bell className="h-5 w-5 text-gray-400" />
				</div>
				<div className="space-y-3">
					{alerts.length > 0 ? (
						alerts.map((alert, idx) => (
							<div
								key={idx}
								className={`p-4 rounded-lg border ${
									alert.severity === 'high'
										? 'bg-red-50 border-red-200'
										: alert.severity === 'medium'
										? 'bg-yellow-50 border-yellow-200'
										: 'bg-blue-50 border-blue-200'
								}`}
							>
								<div className="flex items-start justify-between">
									<div className="flex-1">
										<div className="flex items-center gap-2 mb-1">
											<AlertCircle
												className={`h-4 w-4 ${
													alert.severity === 'high'
														? 'text-red-600'
														: alert.severity === 'medium'
														? 'text-yellow-600'
														: 'text-blue-600'
												}`}
											/>
											<span
												className={`text-sm font-semibold ${
													alert.severity === 'high'
														? 'text-red-700'
														: alert.severity === 'medium'
														? 'text-yellow-700'
														: 'text-blue-700'
												}`}
											>
												{alert.type.toUpperCase()}
											</span>
										</div>
										<p className="text-sm text-gray-700">{alert.message}</p>
										<p className="text-xs text-gray-500 mt-1">{alert.time}</p>
									</div>
								</div>
							</div>
						))
					) : (
						<div className="text-center py-8">
							<p className="text-gray-600">No notifications at this time.</p>
						</div>
					)}
				</div>
			</div>
		</div>
	)
}

