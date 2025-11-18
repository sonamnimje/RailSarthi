import React, { useState } from 'react';
import { AIRecommendation, acceptRecommendation, submitOverride } from '../lib/api';
import { Info, CheckCircle2, XCircle, ChevronDown, ChevronUp, AlertTriangle, Zap } from 'lucide-react';

type AIRecommendationCardProps = {
	recommendation: AIRecommendation;
	division: string;
	onAccept?: (recommendationId: string) => void;
	onOverride?: (recommendationId: string) => void;
};

export default function AIRecommendationCard({ 
	recommendation, 
	division,
	onAccept, 
	onOverride,
}: AIRecommendationCardProps) {
	const [isOverriding, setIsOverriding] = useState(false);
	const [overrideReason, setOverrideReason] = useState('');
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [showWhyDetails, setShowWhyDetails] = useState(false);
	const [showApplyDetails, setShowApplyDetails] = useState(false);
	const [showOverrideDetails, setShowOverrideDetails] = useState(false);

	const handleAccept = async () => {
		try {
			setIsSubmitting(true);
			await acceptRecommendation(division, recommendation.conflict_id);
			onAccept?.(recommendation.conflict_id);
		} catch (error) {
			console.error('Failed to accept recommendation:', error);
			alert('Failed to accept recommendation. Please try again.');
		} finally {
			setIsSubmitting(false);
		}
	};

	const handleOverride = async () => {
		if (!overrideReason.trim()) {
			alert('Please provide a reason for overriding');
			return;
		}

		try {
			setIsSubmitting(true);
			// For now, use the same solution as override (user would edit in real UI)
			await submitOverride(
				division,
				recommendation.conflict_id,
				recommendation.solution,
				overrideReason
			);
			onOverride?.(recommendation.conflict_id);
			setIsOverriding(false);
						setOverrideReason('');
		} catch (error) {
			console.error('Failed to submit override:', error);
			alert('Failed to submit override. Please try again.');
		} finally {
			setIsSubmitting(false);
		}
	};

	const confidenceColor = recommendation.confidence >= 0.7 ? 'bg-green-500' : 
		recommendation.confidence >= 0.4 ? 'bg-yellow-500' : 'bg-red-500';

	const urgencyColor = recommendation.confidence < 0.4 ? 'border-red-500' :
		recommendation.confidence < 0.7 ? 'border-yellow-500' : 'border-green-500';

	return (
		<div className={`bg-white rounded-lg p-4 border-2 ${urgencyColor} mb-3`}>
			{/* Header */}
			<div className="flex justify-between items-start mb-2">
				<div>
					<h4 className="text-gray-900 font-semibold text-sm">
						Conflict: {recommendation.conflict_id}
					</h4>
					<p className="text-gray-600 text-xs mt-1">
						{recommendation.solution.precedence.length > 0 && (
							<span>Trains: {recommendation.solution.precedence.join(', ')}</span>
						)}
					</p>
				</div>
				<div className="flex items-center gap-2">
					<span className="text-xs text-gray-600">
						{Math.round(recommendation.confidence * 100)}%
					</span>
					<div className="w-16 h-2 bg-gray-200 rounded-full overflow-hidden">
						<div
							className={`h-full ${confidenceColor} transition-all`}
							style={{ width: `${recommendation.confidence * 100}%` }}
						/>
					</div>
				</div>
			</div>

			{/* Recommendation Summary */}
			<div className="bg-gradient-to-r from-green-50 to-emerald-50 rounded p-3 mb-3 border border-green-200">
				<div className="text-sm font-semibold text-green-700 mb-2 flex items-center gap-2">
					<Zap className="w-4 h-4" />
					AI Recommendation
				</div>
				<div className="text-xs text-gray-900 space-y-1">
					{recommendation.solution.precedence.length > 0 && (
						<div className="flex items-center gap-2">
							<span className="text-gray-600">Precedence:</span>
							<span className="font-semibold text-green-700">{recommendation.solution.precedence.join(' → ')}</span>
						</div>
					)}
					{Object.keys(recommendation.solution.holds).length > 0 && (
						<div>
							{Object.entries(recommendation.solution.holds).map(([train, seconds]) => (
								<div key={train} className="flex items-center gap-2">
									<span className="text-gray-600">Hold Train:</span>
									<span className="font-semibold text-orange-700">{train}</span>
									<span className="text-gray-600">for</span>
									<span className="font-semibold text-orange-700">{Math.round(seconds / 60)} min</span>
								</div>
							))}
						</div>
					)}
					{recommendation.solution.crossing && (
						<div className="flex items-center gap-2">
							<span className="text-gray-600">Crossing:</span>
							<span className="font-semibold text-blue-700">{recommendation.solution.crossing}</span>
						</div>
					)}
					{Object.keys(recommendation.solution.speed_adjust || {}).length > 0 && (
						<div>
							{Object.entries(recommendation.solution.speed_adjust).map(([train, speed]) => (
								<div key={train} className="flex items-center gap-2">
									<span className="text-gray-600">Speed Adjust:</span>
									<span className="font-semibold text-purple-700">{train}</span>
									<span className="text-gray-600">to</span>
									<span className="font-semibold text-purple-700">{speed} km/h</span>
								</div>
							))}
						</div>
					)}
				</div>
			</div>

			{/* Why Section - Expandable */}
			<div className="bg-blue-50 rounded-lg p-3 mb-3 border border-blue-200">
				<button
					onClick={() => setShowWhyDetails(!showWhyDetails)}
					className="w-full flex items-center justify-between text-left"
				>
					<div className="flex items-center gap-2">
						<Info className="w-4 h-4 text-blue-600" />
						<span className="text-sm font-semibold text-blue-700">Why This Recommendation?</span>
					</div>
					{showWhyDetails ? (
						<ChevronUp className="w-4 h-4 text-blue-600" />
					) : (
						<ChevronDown className="w-4 h-4 text-blue-600" />
					)}
				</button>
				{showWhyDetails && (
					<div className="mt-3 space-y-3 text-xs border-t border-blue-200 pt-3">
						{/* Explanation */}
						<div>
							<div className="text-gray-700 font-medium mb-1">Explanation:</div>
							<div className="text-gray-600 bg-white rounded p-2 border border-blue-100">
								{recommendation.explanation || 
									`This action resolves the conflict in section ${recommendation.conflict?.section || 'N/A'}, involving trains ${recommendation.conflict?.trains?.join(', ') || 'multiple'}. The AI engine analyzed current network state, historical patterns, and safety constraints to generate this optimal solution.`}
							</div>
						</div>

						{/* Conflict Details */}
						{recommendation.conflict && (
							<div>
								<div className="text-gray-700 font-medium mb-1">Conflict Details:</div>
								<div className="bg-white rounded p-2 border border-blue-100 space-y-1">
									<div className="flex justify-between">
										<span className="text-gray-600">Type:</span>
										<span className="font-semibold text-gray-900">{recommendation.conflict.type}</span>
									</div>
									<div className="flex justify-between">
										<span className="text-gray-600">Section:</span>
										<span className="font-semibold text-gray-900">{recommendation.conflict.section}</span>
									</div>
									{recommendation.conflict.severity && (
										<div className="flex justify-between">
											<span className="text-gray-600">Severity:</span>
											<span className={`font-semibold ${
												recommendation.conflict.severity === 'high' ? 'text-red-600' :
												recommendation.conflict.severity === 'medium' ? 'text-yellow-600' : 'text-green-600'
											}`}>
												{recommendation.conflict.severity.toUpperCase()}
											</span>
										</div>
									)}
									{recommendation.conflict.distance_km && (
										<div className="flex justify-between">
											<span className="text-gray-600">Distance:</span>
											<span className="font-semibold text-gray-900">{recommendation.conflict.distance_km} km</span>
										</div>
									)}
								</div>
							</div>
						)}

						{/* Expected Impact */}
						{recommendation.expected_delta_kpis && (
							<div>
								<div className="text-gray-700 font-medium mb-1">Expected Impact:</div>
								<div className="bg-white rounded p-2 border border-blue-100 space-y-1">
									<div className="flex justify-between">
										<span className="text-gray-600">Delay Reduction:</span>
										<span className="font-semibold text-green-600">
											-{Math.round(recommendation.expected_delta_kpis.delay_reduction_minutes || 0)} minutes
										</span>
									</div>
									{recommendation.expected_delta_kpis.throughput_impact !== undefined && (
										<div className="flex justify-between">
											<span className="text-gray-600">Throughput Impact:</span>
											<span className={`font-semibold ${
												recommendation.expected_delta_kpis.throughput_impact > 0 ? 'text-green-600' : 'text-red-600'
											}`}>
												{recommendation.expected_delta_kpis.throughput_impact > 0 ? '+' : ''}
												{(recommendation.expected_delta_kpis.throughput_impact * 100).toFixed(1)}%
											</span>
										</div>
									)}
								</div>
							</div>
						)}

						{/* AI Model Info */}
						<div>
							<div className="text-gray-700 font-medium mb-1">AI Model Analysis:</div>
							<div className="bg-white rounded p-2 border border-blue-100 text-gray-600">
								Calculated using Hybrid AI approach combining:
								<ul className="list-disc list-inside mt-1 space-y-0.5">
									<li>Reinforcement Learning (RL) for pattern recognition</li>
									<li>Graph Neural Networks (GNN) for network topology analysis</li>
									<li>Constraint Optimization (OR-Tools) for safety compliance</li>
									<li>Historical data patterns and real-time network state</li>
								</ul>
								{recommendation.feature_importances && Object.keys(recommendation.feature_importances).length > 0 && (
									<div className="mt-2 pt-2 border-t border-gray-200">
										<div className="font-medium mb-1">Key Factors:</div>
										{Object.entries(recommendation.feature_importances)
											.sort(([, a], [, b]) => (b as number) - (a as number))
											.slice(0, 3)
											.map(([feature, importance]) => (
												<div key={feature} className="flex justify-between text-xs">
													<span className="text-gray-600">{feature}:</span>
													<span className="font-semibold">{((importance as number) * 100).toFixed(0)}%</span>
												</div>
											))}
									</div>
								)}
							</div>
						</div>
					</div>
				)}
			</div>

			{/* Apply Details - Expandable */}
			<div className="bg-green-50 rounded-lg p-3 mb-3 border border-green-200">
				<button
					onClick={() => setShowApplyDetails(!showApplyDetails)}
					className="w-full flex items-center justify-between text-left"
				>
					<div className="flex items-center gap-2">
						<CheckCircle2 className="w-4 h-4 text-green-600" />
						<span className="text-sm font-semibold text-green-700">What Happens When You Apply?</span>
					</div>
					{showApplyDetails ? (
						<ChevronUp className="w-4 h-4 text-green-600" />
					) : (
						<ChevronDown className="w-4 h-4 text-green-600" />
					)}
				</button>
				{showApplyDetails && (
					<div className="mt-3 space-y-2 text-xs border-t border-green-200 pt-3">
						<div className="bg-white rounded p-2 border border-green-100 space-y-2">
							<div className="font-medium text-gray-700">Immediate Actions:</div>
							<ul className="list-disc list-inside space-y-1 text-gray-600 ml-2">
								{recommendation.solution.precedence.length > 0 && (
									<li>Precedence order will be applied: {recommendation.solution.precedence.join(' → ')}</li>
								)}
								{Object.keys(recommendation.solution.holds).length > 0 && (
									<li>Trains will be held at stations as specified</li>
								)}
								{recommendation.solution.crossing && (
									<li>Crossing will be scheduled at {recommendation.solution.crossing}</li>
								)}
								{Object.keys(recommendation.solution.speed_adjust || {}).length > 0 && (
									<li>Speed adjustments will be applied to affected trains</li>
								)}
							</ul>
							<div className="pt-2 border-t border-gray-200">
								<div className="font-medium text-gray-700 mb-1">Expected Results:</div>
								<ul className="list-disc list-inside space-y-1 text-gray-600 ml-2">
									<li>Delay reduction: {Math.round(recommendation.expected_delta_kpis?.delay_reduction_minutes || 0)} minutes</li>
									<li>Network efficiency improvement</li>
									<li>Safety constraints maintained</li>
									<li>Feedback sent to AI for learning</li>
								</ul>
							</div>
							<div className="pt-2 border-t border-gray-200">
								<div className="font-medium text-gray-700 mb-1">System Impact:</div>
								<div className="text-gray-600">
									This action will be logged, applied to the digital twin simulation, and sent to the constraint optimization engine for validation. The AI will learn from this successful application.
								</div>
							</div>
						</div>
					</div>
				)}
			</div>

			{/* Override Details - Expandable */}
			<div className="bg-orange-50 rounded-lg p-3 mb-3 border border-orange-200">
				<button
					onClick={() => setShowOverrideDetails(!showOverrideDetails)}
					className="w-full flex items-center justify-between text-left"
				>
					<div className="flex items-center gap-2">
						<AlertTriangle className="w-4 h-4 text-orange-600" />
						<span className="text-sm font-semibold text-orange-700">What Happens When You Override?</span>
					</div>
					{showOverrideDetails ? (
						<ChevronUp className="w-4 h-4 text-orange-600" />
					) : (
						<ChevronDown className="w-4 h-4 text-orange-600" />
					)}
				</button>
				{showOverrideDetails && (
					<div className="mt-3 space-y-2 text-xs border-t border-orange-200 pt-3">
						<div className="bg-white rounded p-2 border border-orange-100 space-y-2">
							<div className="font-medium text-gray-700">Override Process:</div>
							<ul className="list-disc list-inside space-y-1 text-gray-600 ml-2">
								<li>You will provide your alternative solution</li>
								<li>Your reason for override will be recorded</li>
								<li>Human solution will be applied instead of AI recommendation</li>
								<li>Both AI and human solutions will be compared</li>
							</ul>
							<div className="pt-2 border-t border-gray-200">
								<div className="font-medium text-gray-700 mb-1">Feedback Loop:</div>
								<ul className="list-disc list-inside space-y-1 text-gray-600 ml-2">
									<li>Your override will be sent to the AI engine</li>
									<li>AI will analyze why you chose differently</li>
									<li>System will learn from human expertise</li>
									<li>Future recommendations will improve based on this feedback</li>
								</ul>
							</div>
							<div className="pt-2 border-t border-gray-200">
								<div className="font-medium text-gray-700 mb-1">Important Notes:</div>
								<div className="text-gray-600 space-y-1">
									<div>• Overrides help the AI learn from human domain expertise</div>
									<div>• Your solution will be validated against safety constraints</div>
									<div>• Both solutions will be tracked for performance comparison</div>
									<div>• This feedback improves future AI recommendations</div>
								</div>
							</div>
						</div>
					</div>
				)}
			</div>

			{/* Action Buttons */}
			{isOverriding ? (
				<div className="space-y-3">
					<div className="bg-orange-50 rounded-lg p-3 border border-orange-200">
						<div className="text-xs font-semibold text-orange-700 mb-2">Override Form</div>
						<textarea
							value={overrideReason}
							onChange={(e) => setOverrideReason(e.target.value)}
							placeholder="Please provide a detailed reason for overriding this recommendation. This helps the AI learn from your expertise..."
							className="w-full bg-white text-gray-900 text-xs p-2 rounded border border-orange-300 focus:border-orange-500 focus:ring-1 focus:ring-orange-500"
							rows={3}
						/>
						<div className="mt-2 text-xs text-gray-600">
							<strong>Note:</strong> Your override reason will be used to improve future AI recommendations.
						</div>
					</div>
					<div className="flex gap-2">
						<button
							onClick={handleOverride}
							disabled={isSubmitting || !overrideReason.trim()}
							className="flex-1 px-4 py-2 bg-orange-600 text-white text-xs font-semibold rounded hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
						>
							{isSubmitting ? (
								<>
									<div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
									Submitting Override...
								</>
							) : (
								<>
									<XCircle className="w-4 h-4" />
									Submit Override
								</>
							)}
						</button>
						<button
							onClick={() => {
								setIsOverriding(false);
								setOverrideReason('');
							}}
							disabled={isSubmitting}
							className="px-4 py-2 bg-gray-200 text-gray-700 text-xs font-semibold rounded hover:bg-gray-300 disabled:opacity-50"
						>
							Cancel
						</button>
					</div>
				</div>
			) : (
				<div className="flex gap-2">
					<button
						onClick={handleAccept}
						disabled={isSubmitting}
						className="flex-1 px-4 py-2.5 bg-gradient-to-r from-green-600 to-green-700 text-white text-xs font-semibold rounded-lg hover:from-green-700 hover:to-green-800 disabled:opacity-50 disabled:cursor-not-allowed shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2"
					>
						{isSubmitting ? (
							<>
								<div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
								Processing...
							</>
						) : (
							<>
								<CheckCircle2 className="w-4 h-4" />
								APPLY RECOMMENDATION
							</>
						)}
					</button>
					<button
						onClick={() => setIsOverriding(true)}
						disabled={isSubmitting}
						className="flex-1 px-4 py-2.5 bg-gradient-to-r from-orange-600 to-orange-700 text-white text-xs font-semibold rounded-lg hover:from-orange-700 hover:to-orange-800 disabled:opacity-50 disabled:cursor-not-allowed shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2"
					>
						<XCircle className="w-4 h-4" />
						OVERRIDE
					</button>
				</div>
			)}
		</div>
	);
}
