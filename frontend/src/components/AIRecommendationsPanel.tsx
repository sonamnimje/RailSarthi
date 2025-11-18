import React, { useState, useEffect } from 'react';
import { Brain, CheckCircle2, X, AlertTriangle, Info, Zap } from 'lucide-react';
import { getRecommendations, acceptRecommendation, submitOverride, type AIRecommendation } from '../lib/api';

interface AIRecommendationsPanelProps {
	division: string;
	onRecommendationAccepted?: (recommendationId: string) => void;
	onRecommendationOverridden?: (recommendationId: string, reason: string) => void;
}

export default function AIRecommendationsPanel({ 
	division, 
	onRecommendationAccepted,
	onRecommendationOverridden 
}: AIRecommendationsPanelProps) {
	const [recommendations, setRecommendations] = useState<AIRecommendation[]>([]);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [expandedId, setExpandedId] = useState<string | null>(null);
	const [overrideReason, setOverrideReason] = useState<Record<string, string>>({});

	// Fetch recommendations
	const fetchRecommendations = async () => {
		try {
			setLoading(true);
			setError(null);
			const data = await getRecommendations(division);
			setRecommendations(data);
		} catch (err) {
			console.error('Failed to fetch recommendations:', err);
			setError(err instanceof Error ? err.message : 'Failed to fetch recommendations');
		} finally {
			setLoading(false);
		}
	};

	useEffect(() => {
		fetchRecommendations();
		const interval = setInterval(fetchRecommendations, 30000); // Refresh every 30 seconds
		return () => clearInterval(interval);
	}, [division]);

	const handleAccept = async (recommendation: AIRecommendation) => {
		try {
			await acceptRecommendation(division, recommendation.conflict_id);
			if (onRecommendationAccepted) {
				onRecommendationAccepted(recommendation.conflict_id);
			}
			// Remove accepted recommendation
			setRecommendations(prev => prev.filter(r => r.conflict_id !== recommendation.conflict_id));
		} catch (err) {
			console.error('Failed to accept recommendation:', err);
			setError('Failed to accept recommendation');
		}
	};

	const handleOverride = async (recommendation: AIRecommendation) => {
		const reason = overrideReason[recommendation.conflict_id] || 'Manual override';
		try {
			await submitOverride(division, recommendation.conflict_id, {
				action: 'override',
				reason
			}, reason);
			if (onRecommendationOverridden) {
				onRecommendationOverridden(recommendation.conflict_id, reason);
			}
			// Remove overridden recommendation
			setRecommendations(prev => prev.filter(r => r.conflict_id !== recommendation.conflict_id));
		} catch (err) {
			console.error('Failed to override recommendation:', err);
			setError('Failed to override recommendation');
		}
	};

	const getConfidenceColor = (confidence: number) => {
		if (confidence >= 0.8) return 'text-green-600 bg-green-50';
		if (confidence >= 0.6) return 'text-yellow-600 bg-yellow-50';
		return 'text-red-600 bg-red-50';
	};

	if (loading && recommendations.length === 0) {
		return (
			<div className="w-full bg-white rounded-xl shadow-lg border border-gray-200 p-4">
				<div className="flex items-center justify-center h-32">
					<div className="text-gray-500">Loading AI recommendations...</div>
				</div>
			</div>
		);
	}

	if (error && recommendations.length === 0) {
		return (
			<div className="w-full bg-white rounded-xl shadow-lg border border-gray-200 p-4">
				<div className="flex items-center justify-center h-32">
					<div className="text-red-500">Error: {error}</div>
				</div>
			</div>
		);
	}

	return (
		<div className="w-full bg-white rounded-xl shadow-lg border border-gray-200 p-4">
			<div className="flex items-center justify-between mb-4">
				<h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
					<Brain className="w-5 h-5 text-purple-600" />
					AI Recommendations
				</h3>
				<button
					onClick={fetchRecommendations}
					className="text-sm text-blue-600 hover:text-blue-700"
				>
					Refresh
				</button>
			</div>

			{recommendations.length === 0 ? (
				<div className="text-center py-8 text-gray-500">
					<Brain className="w-12 h-12 mx-auto mb-2 opacity-50" />
					<p>No recommendations at this time</p>
				</div>
			) : (
				<div className="space-y-3 max-h-[600px] overflow-y-auto">
					{recommendations.map((rec) => (
						<div
							key={rec.conflict_id}
							className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow"
						>
							{/* Header */}
							<div className="flex items-start justify-between mb-2">
								<div className="flex-1">
									<div className="flex items-center gap-2 mb-1">
										<h4 className="font-semibold text-gray-900">
											{rec.conflict?.type === 'head-on' ? 'Head-on Conflict' :
											 rec.conflict?.type === 'overtake' ? 'Overtake Recommendation' :
											 rec.conflict?.type === 'platform' ? 'Platform Assignment' :
											 'Train Precedence'}
										</h4>
										<span className={`px-2 py-1 rounded text-xs font-semibold ${getConfidenceColor(rec.confidence)}`}>
											{Math.round(rec.confidence * 100)}% confidence
										</span>
									</div>
									{rec.conflict && (
										<p className="text-sm text-gray-600">
											Section: {rec.conflict.section} • Trains: {rec.conflict.trains.join(', ')}
										</p>
									)}
								</div>
							</div>

							{/* Recommendation Summary */}
							<div className="bg-blue-50 rounded p-3 mb-3 border border-blue-200">
								<div className="text-sm font-semibold text-blue-700 mb-2 flex items-center gap-2">
									<Zap className="w-4 h-4" />
									Recommendation
								</div>
								<div className="text-xs text-gray-900 space-y-1">
									{rec.solution.precedence.length > 0 && (
										<div>
											<span className="text-gray-600">Precedence: </span>
											<span className="font-semibold text-blue-700">
												{rec.solution.precedence.join(' → ')}
											</span>
										</div>
									)}
									{Object.keys(rec.solution.holds).length > 0 && (
										<div>
											{Object.entries(rec.solution.holds).map(([train, seconds]) => (
												<div key={train}>
													<span className="text-gray-600">Hold {train}: </span>
													<span className="font-semibold text-orange-700">
														{Math.round(seconds / 60)} min
													</span>
												</div>
											))}
										</div>
									)}
									{rec.solution.crossing && (
										<div>
											<span className="text-gray-600">Crossing at: </span>
											<span className="font-semibold text-blue-700">{rec.solution.crossing}</span>
										</div>
									)}
								</div>
							</div>

							{/* Why Section - Expandable */}
							<div className="mb-3">
								<button
									onClick={() => setExpandedId(expandedId === rec.conflict_id ? null : rec.conflict_id)}
									className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 w-full text-left"
								>
									<Info className="w-4 h-4" />
									<span className="font-semibold">WHY</span>
									<span className="ml-auto">{expandedId === rec.conflict_id ? '−' : '+'}</span>
								</button>
								{expandedId === rec.conflict_id && (
									<div className="mt-2 p-3 bg-gray-50 rounded text-sm text-gray-700">
										{rec.explanation || 'No explanation available'}
									</div>
								)}
							</div>

							{/* What If Section */}
							{rec.expected_delta_kpis && (
								<div className="mb-3 p-2 bg-green-50 rounded border border-green-200">
									<div className="text-xs font-semibold text-green-700 mb-1">Expected Impact:</div>
									<div className="text-xs text-gray-700">
										{rec.expected_delta_kpis.delay_reduction_minutes > 0 && (
											<div>Delay reduction: {rec.expected_delta_kpis.delay_reduction_minutes.toFixed(1)} min</div>
										)}
										{rec.expected_delta_kpis.throughput_impact !== 0 && (
											<div>Throughput: {rec.expected_delta_kpis.throughput_impact > 0 ? '+' : ''}
												{rec.expected_delta_kpis.throughput_impact.toFixed(1)} trains/hour
											</div>
										)}
									</div>
								</div>
							)}

							{/* Actions */}
							<div className="flex gap-2">
								<button
									onClick={() => handleAccept(rec)}
									className="flex-1 px-3 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm font-semibold flex items-center justify-center gap-2"
								>
									<CheckCircle2 className="w-4 h-4" />
									Accept
								</button>
								<button
									onClick={() => {
										const reason = prompt('Enter override reason:');
										if (reason) {
											setOverrideReason(prev => ({ ...prev, [rec.conflict_id]: reason }));
											handleOverride(rec);
										}
									}}
									className="flex-1 px-3 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors text-sm font-semibold flex items-center justify-center gap-2"
								>
									<X className="w-4 h-4" />
									Override
								</button>
							</div>
						</div>
					))}
				</div>
			)}
		</div>
	);
}
