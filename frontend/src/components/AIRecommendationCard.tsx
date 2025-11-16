import React, { useState } from 'react';
import { AIRecommendation, acceptRecommendation, submitOverride } from '../lib/api';

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

			{/* Recommendation */}
			<div className="bg-gray-50 rounded p-3 mb-3 border border-gray-200">
				<div className="text-sm font-semibold text-green-600 mb-2">Recommendation</div>
				<div className="text-xs text-gray-900">
					{recommendation.solution.precedence.length > 0 && (
						<div className="mb-1">
							Give precedence: <span className="font-semibold">{recommendation.solution.precedence.join(' → ')}</span>
						</div>
					)}
					{Object.keys(recommendation.solution.holds).length > 0 && (
						<div className="mb-1">
							{Object.entries(recommendation.solution.holds).map(([train, seconds]) => (
								<div key={train}>
									Hold Train <span className="font-semibold">{train}</span> at Station for <span className="font-semibold">{Math.round(seconds / 60)} minutes</span>
								</div>
							))}
						</div>
					)}
					{recommendation.solution.crossing && (
						<div>
							Crossing at: <span className="font-semibold">{recommendation.solution.crossing}</span>
						</div>
					)}
				</div>
			</div>

			{/* XAI Justification: Why & How */}
			<div className="bg-gray-50 rounded p-3 mb-3 border border-gray-200">
				<div className="text-sm font-semibold text-gray-700 mb-2">Justification</div>
				<div className="space-y-2 text-xs">
					<div>
						<div className="text-gray-600 font-medium mb-1">Why:</div>
						<div className="text-gray-700">
							{recommendation.explanation || 
								`This action resolves the ${recommendation.conflict?.section || 'conflict'}, reducing network delay by ${Math.round(recommendation.expected_delta_kpis?.delay_reduction_minutes || 0)} minutes.`}
						</div>
					</div>
					<div>
						<div className="text-gray-600 font-medium mb-1">How:</div>
						<div className="text-gray-700">
							Calculated via Hybrid AI (RL and Constraint Optimization) using safety rules and historical patterns.
						</div>
					</div>
				</div>
			</div>

			{/* Override Modal */}
			{isOverriding ? (
				<div className="space-y-2">
					<textarea
						value={overrideReason}
						onChange={(e) => setOverrideReason(e.target.value)}
						placeholder="Reason for override..."
						className="w-full bg-white text-gray-900 text-xs p-2 rounded border border-gray-300"
						rows={2}
					/>
					<div className="flex gap-2">
						<button
							onClick={handleOverride}
							disabled={isSubmitting}
							className="flex-1 px-3 py-1.5 bg-orange-600 text-white text-xs rounded hover:bg-orange-700 disabled:opacity-50"
						>
							{isSubmitting ? 'Submitting...' : 'Submit Override'}
						</button>
						<button
							onClick={() => {
								setIsOverriding(false);
								setOverrideReason('');
							}}
							className="px-3 py-1.5 bg-gray-200 text-gray-700 text-xs rounded hover:bg-gray-300"
						>
							Cancel
						</button>
					</div>
				</div>
			) : (
				/* Action Buttons */
				<div className="flex gap-2">
				<button
					onClick={handleAccept}
						disabled={isSubmitting}
						className="flex-1 px-3 py-1.5 bg-green-600 text-white text-xs rounded hover:bg-green-700 disabled:opacity-50"
				>
						{isSubmitting ? 'Processing...' : 'ACCEPT'}
				</button>
				<button
						onClick={() => setIsOverriding(true)}
						disabled={isSubmitting}
						className="flex-1 px-3 py-1.5 bg-orange-600 text-white text-xs rounded hover:bg-orange-700 disabled:opacity-50"
				>
						OVERRIDE
				</button>
			</div>
			)}
		</div>
	);
}
