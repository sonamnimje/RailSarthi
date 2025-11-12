import { useEffect, useState } from 'react'
import { fetchOverrides } from '../lib/api'

export default function OverridesPage() {
	const [rows, setRows] = useState<Array<{ id: string; controller_id: string; train_id: string; action: string; ai_action?: string; reason?: string; timestamp: number }>>([])
	const [error, setError] = useState<string | null>(null)

	useEffect(() => {
		fetchOverrides()
			.then(setRows)
			.catch((e) => {
				if (e.message === 'Unauthorized') {
					location.href = '/login'
					return
				}
				setError(e.message)
			})
	}, [])

	const getOutcomeColor = (action: string) => {
		switch (action.toLowerCase()) {
			case 'approved':
			case 'accept':
				return 'text-green-600'
			case 'pending':
			case 'wait':
				return 'text-yellow-600'
			case 'denied':
			case 'reject':
				return 'text-red-600'
			case 'abandoned':
			case 'cancel':
				return 'text-gray-600'
			default:
				return 'text-blue-600'
		}
	}

	const formatTimestamp = (timestamp: number) => {
		const date = new Date(timestamp * 1000)
		return date.toLocaleString('en-GB', { 
			day: '2-digit', 
			month: '2-digit', 
			year: '2-digit',
			hour: '2-digit',
			minute: '2-digit'
		})
	}

	// Calculate AI learning metrics
	const getAIMetrics = () => {
		const totalOverrides = rows.length
		const overridesWithReasons = rows.filter(r => r.reason && r.reason.trim() !== '').length
		const aiAccepted = rows.filter(r => r.action === r.ai_action).length
		const aiOverridden = totalOverrides - aiAccepted
		const reasonPercentage = totalOverrides > 0 ? Math.round((overridesWithReasons / totalOverrides) * 100) : 0
		
		return {
			totalOverrides,
			overridesWithReasons,
			aiAccepted,
			aiOverridden,
			reasonPercentage
		}
	}

	const metrics = getAIMetrics()

	return (
		<div className="p-6 bg-gray-50 min-h-screen">
			<div className="mb-6">
				<h2 className="text-4xl font-extrabold mb-2 text-gray-800">📜 Overrides & Audit Logs</h2>
				<p className="text-gray-600 text-lg">
					History of all controller overrides vs. AI decisions. Used as training feedback loop for adaptive AI learning.
				</p>
			</div>
			{error && <div className="text-red-400 mb-2">{error}</div>}
			
			{/* AI Learning Metrics */}
			<div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
				<div className="bg-blue-50 rounded-lg shadow-sm border border-gray-200 p-4">
					<div className="flex items-center">
						<div className="p-2 bg-blue-100 rounded-lg">
							<svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
							</svg>
						</div>
						<div className="ml-3">
							<p className="text-sm font-medium text-gray-500">Total Overrides</p>
							<p className="text-2xl font-semibold text-gray-900">{metrics.totalOverrides}</p>
						</div>
					</div>
				</div>
				
				<div className="bg-blue-50 rounded-lg shadow-sm border border-gray-200 p-4">
					<div className="flex items-center">
						<div className="p-2 bg-green-100 rounded-lg">
							<svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
							</svg>
						</div>
						<div className="ml-3">
							<p className="text-sm font-medium text-gray-500">AI Accepted</p>
							<p className="text-2xl font-semibold text-gray-900">{metrics.aiAccepted}</p>
						</div>
					</div>
				</div>
				
				<div className="bg-blue-50 rounded-lg shadow-sm border border-gray-200 p-4">
					<div className="flex items-center">
						<div className="p-2 bg-orange-100 rounded-lg">
							<svg className="w-6 h-6 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
							</svg>
						</div>
						<div className="ml-3">
							<p className="text-sm font-medium text-gray-500">AI Overridden</p>
							<p className="text-2xl font-semibold text-gray-900">{metrics.aiOverridden}</p>
						</div>
					</div>
				</div>
				
				<div className="bg-blue-50 rounded-lg shadow-sm border border-gray-200 p-4">
					<div className="flex items-center">
						<div className="p-2 bg-purple-100 rounded-lg">
							<svg className="w-6 h-6 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
							</svg>
						</div>
						<div className="ml-3">
							<p className="text-sm font-medium text-gray-500">With Reasons</p>
							<p className="text-2xl font-semibold text-gray-900">{metrics.reasonPercentage}%</p>
						</div>
					</div>
				</div>
			</div>
			
			
			<div className="bg-blue-50 rounded-lg shadow-sm border border-gray-200 overflow-hidden">
				<div className="overflow-x-auto">
					<table className="w-full text-sm text-gray-800">
						<thead className="bg-blue-100 border-b border-gray-200">
							<tr>
								<th className="text-left p-4 font-bold text-gray-900 border-r border-gray-300">Timestamp</th>
								<th className="text-left p-4 font-bold text-gray-900 border-r border-gray-300">AI Suggestion</th>
								<th className="text-left p-4 font-bold text-gray-900 border-r border-gray-300">Controller Override</th>
								<th className="text-left p-4 font-bold text-gray-900 border-r border-gray-300">Reason</th>
								<th className="text-left p-4 font-bold text-gray-900">Outcome</th>
							</tr>
						</thead>
						<tbody>
							{rows.map((r, index) => {
								const isOverride = r.action !== r.ai_action
								const hasReason = r.reason && r.reason.trim() !== ''
								return (
									<tr key={r.id} className={`bg-blue-50 border-b border-gray-100 ${isOverride ? 'bg-orange-50' : 'bg-green-50'}`}>
										<td className="p-4 border-r border-gray-200 font-mono text-xs">{formatTimestamp(r.timestamp)}</td>
										<td className="p-4 border-r border-gray-200">
											<div className="flex items-center gap-2">
												<span className="px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded-full">AI</span>
												<span>{r.ai_action || '-'}</span>
											</div>
										</td>
										<td className="p-4 border-r border-gray-200">
											<div className="flex items-center gap-2">
												<span className="px-2 py-1 bg-purple-100 text-purple-800 text-xs rounded-full">Controller</span>
												<span>{r.action}</span>
											</div>
										</td>
										<td className="p-4 border-r border-gray-200">
											{hasReason ? (
												<div className="max-w-xs">
													<span className="inline-block bg-yellow-100 text-yellow-800 text-xs px-2 py-1 rounded-full mb-1">Training Data</span>
													<p className="text-sm text-gray-700 break-words">{r.reason}</p>
												</div>
											) : (
												<span className="text-gray-400 italic">No reason provided</span>
											)}
										</td>
										<td className="p-4">
											<div className="flex items-center gap-2">
												{isOverride ? (
													<>
														<span className="px-2 py-1 bg-orange-100 text-orange-800 text-xs rounded-full">Override</span>
														<span className={`font-medium ${getOutcomeColor(r.action)}`}>{r.action}</span>
													</>
												) : (
													<>
														<span className="px-2 py-1 bg-green-100 text-green-800 text-xs rounded-full">Accepted</span>
														<span className="font-medium text-green-600">{r.action}</span>
													</>
												)}
											</div>
										</td>
									</tr>
								)
							})}
							{rows.length === 0 && (
								<tr>
									<td colSpan={5} className="p-8 text-center text-gray-500">
										No overrides found
									</td>
								</tr>
							)}
						</tbody>
					</table>
				</div>
			</div>
		</div>
	)
}


