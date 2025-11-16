import React, { useEffect, useState } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import AIRecommendationCard from './AIRecommendationCard';
import { AIRecommendation } from '../lib/api';

type AIRecommendationsPanelProps = {
	recommendations: AIRecommendation[];
	division: string;
	onAccept?: (recommendationId: string) => void;
	onOverride?: (recommendationId: string) => void;
};

export default function AIRecommendationsPanel({
	recommendations,
	division,
	onAccept,
	onOverride,
}: AIRecommendationsPanelProps) {
	const [kpiHistory, setKpiHistory] = useState<Array<{ time: string; punctuality: number; avgDelay: number; throughput: number }>>([]);

	useEffect(() => {
		// Update KPI history when recommendations change
		if (recommendations.length > 0) {
			const avgConfidence = recommendations.reduce((sum, r) => sum + r.confidence, 0) / recommendations.length;
			const estimatedPunctuality = avgConfidence * 95; // Estimate based on confidence
			const estimatedDelay = recommendations.reduce((sum, r) => 
				sum + (r.expected_delta_kpis?.delay_reduction_minutes || 0), 0) / recommendations.length;
			const estimatedThroughput = 100 - (recommendations.length * 2); // Simplified

			setKpiHistory(prev => {
				const newEntry = {
					time: new Date().toLocaleTimeString(),
					punctuality: estimatedPunctuality,
					avgDelay: estimatedDelay,
					throughput: estimatedThroughput,
				};
				const updated = [...prev, newEntry].slice(-10); // Keep last 10 entries
				return updated;
			});
		}
	}, [recommendations]);

	const urgencyCounts = {
		high: recommendations.filter(r => r.confidence < 0.4).length,
		medium: recommendations.filter(r => r.confidence >= 0.4 && r.confidence < 0.7).length,
		low: recommendations.filter(r => r.confidence >= 0.7).length,
	};

	const avgConfidence = recommendations.length > 0
		? recommendations.reduce((sum, r) => sum + r.confidence, 0) / recommendations.length
		: 0;

	return (
		<div className="h-full flex flex-col bg-white text-gray-900">
			{/* Header */}
			<div className="p-4 border-b border-gray-200">
				<h2 className="text-lg font-bold mb-2 text-green-600">AI-Powered Decision Support</h2>
				<div className="flex gap-2 text-xs">
					<span className={`px-2 py-1 rounded text-white ${urgencyCounts.high > 0 ? 'bg-red-600' : 'bg-gray-400'}`}>
						High: {urgencyCounts.high}
					</span>
					<span className={`px-2 py-1 rounded text-white ${urgencyCounts.medium > 0 ? 'bg-yellow-600' : 'bg-gray-400'}`}>
						Medium: {urgencyCounts.medium}
					</span>
					<span className={`px-2 py-1 rounded text-white ${urgencyCounts.low > 0 ? 'bg-green-600' : 'bg-gray-400'}`}>
						Low: {urgencyCounts.low}
					</span>
				</div>
			</div>

			{/* Impact Metrics - Simulated */}
			{recommendations.length > 0 && (
				<div className="p-4 border-b border-gray-200 bg-gray-50">
					<div className="text-sm font-semibold text-gray-700 mb-3">Impact Metrics (Simulated)</div>
					<div className="space-y-3">
						<div>
							<div className="flex justify-between items-center mb-1">
								<span className="text-xs text-gray-600">Estimated Delay Saved</span>
								<span className="text-sm font-bold text-green-600">
									+{Math.round(recommendations.reduce((sum, r) => 
										sum + (r.expected_delta_kpis?.delay_reduction_minutes || 0), 0))} min
								</span>
							</div>
							<div className="w-full bg-gray-200 rounded-full h-2">
								<div 
									className="bg-green-500 h-2 rounded-full transition-all"
									style={{ width: `${Math.min(100, Math.round(recommendations.reduce((sum, r) => 
										sum + (r.expected_delta_kpis?.delay_reduction_minutes || 0), 0)) / 2)}%` }}
								/>
							</div>
						</div>
						<div>
							<div className="flex justify-between items-center mb-1">
								<span className="text-xs text-gray-600">Section Throughput Change</span>
								<span className="text-sm font-bold text-green-600">
									+{Math.round(Math.abs(recommendations.reduce((sum, r) => 
										sum + (r.expected_delta_kpis?.throughput_impact || 0), 0) / recommendations.length) * 100)}%
								</span>
							</div>
							<div className="w-full bg-gray-200 rounded-full h-2">
								<div 
									className="bg-gray-400 h-2 rounded-full transition-all"
									style={{ width: `${Math.min(100, Math.abs(recommendations.reduce((sum, r) => 
										sum + (r.expected_delta_kpis?.throughput_impact || 0), 0) / recommendations.length) * 100)}%` }}
								/>
							</div>
						</div>
						<div>
							<div className="flex justify-between items-center mb-1">
								<span className="text-xs text-gray-600">Fuel/Energy Saved</span>
								<span className="text-sm font-bold text-green-600">
									{Math.round(recommendations.reduce((sum, r) => 
										sum + (r.expected_delta_kpis?.delay_reduction_minutes || 0), 0) * 0.5)} Liters
								</span>
							</div>
						</div>
					</div>
				</div>
			)}

			{/* KPI Chart */}
			{kpiHistory.length > 0 && (
				<div className="h-32 p-4 border-b border-gray-200">
					<ResponsiveContainer width="100%" height="100%">
						<LineChart data={kpiHistory}>
							<CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
							<XAxis dataKey="time" stroke="#6B7280" fontSize={10} />
							<YAxis stroke="#6B7280" fontSize={10} />
							<Tooltip
								contentStyle={{ backgroundColor: '#FFFFFF', border: '1px solid #E5E7EB', borderRadius: '4px' }}
								labelStyle={{ color: '#374151' }}
							/>
							<Line type="monotone" dataKey="punctuality" stroke="#10B981" strokeWidth={2} dot={false} />
						</LineChart>
					</ResponsiveContainer>
				</div>
			)}

			{/* Recommendations List */}
			<div className="flex-1 overflow-y-auto p-4">
				{recommendations.length === 0 ? (
					<div className="text-center text-gray-500 text-sm py-8">
						<div className="mb-2">🤖 AI monitoring the network...</div>
						<span className="text-xs text-gray-400">No active conflicts detected</span>
					</div>
				) : (
					recommendations.map((rec) => (
						<AIRecommendationCard
							key={rec.conflict_id}
							recommendation={rec}
							division={division}
							onAccept={onAccept}
							onOverride={onOverride}
						/>
					))
				)}
			</div>
		</div>
	);
}

