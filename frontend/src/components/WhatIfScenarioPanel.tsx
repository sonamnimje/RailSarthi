import React, { useState, useEffect } from 'react';
import { fetchDigitalTwinScenarios, applyScenario, fetchDisruptionCatalog, type WhatIfScenario, type ScenariosResponse, type DisruptionCatalogResponse } from '../lib/api';

interface WhatIfScenarioPanelProps {
	division: string;
	onScenarioApplied?: (scenario: WhatIfScenario) => void;
	className?: string;
}

const severityColors = {
	low: 'bg-green-100 text-green-800 border-green-200',
	medium: 'bg-yellow-100 text-yellow-800 border-yellow-200',
	high: 'bg-orange-100 text-orange-800 border-orange-200',
	critical: 'bg-red-100 text-red-800 border-red-200'
};

const typeIcons: Record<string, string> = {
	signal_failure: '🔴',
	track_block: '🚧',
	weather_slowdown: '🌫️',
	multiple: '⚠️',
	emergency: '🚨',
	platform_congestion: '🚉',
	high_traffic: '📈',
	peak_capacity: '👥'
};

export default function WhatIfScenarioPanel({ division, onScenarioApplied, className = '' }: WhatIfScenarioPanelProps) {
	const [scenarios, setScenarios] = useState<WhatIfScenario[]>([]);
	const [loading, setLoading] = useState(true);
	const [selectedScenario, setSelectedScenario] = useState<WhatIfScenario | null>(null);
	const [applying, setApplying] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [expandedWhyId, setExpandedWhyId] = useState<string | null>(null);
	const [expandedDisruptionsId, setExpandedDisruptionsId] = useState<string | null>(null);
	const [showCatalog, setShowCatalog] = useState(false);
	const [catalog, setCatalog] = useState<DisruptionCatalogResponse | null>(null);

	useEffect(() => {
		const loadScenarios = async () => {
			try {
				setLoading(true);
				const response = await fetchDigitalTwinScenarios(division);
				setScenarios(response.scenarios || []);
			} catch (err) {
				console.error('Failed to load scenarios:', err);
				setError('Failed to load scenarios');
			} finally {
				setLoading(false);
			}
		};

		loadScenarios();
		
		// Load disruption catalog
		const loadCatalog = async () => {
			try {
				const catalogData = await fetchDisruptionCatalog();
				setCatalog(catalogData);
			} catch (err) {
				console.error('Failed to load disruption catalog:', err);
			}
		};
		
		loadCatalog();
	}, [division]);

	const handleApplyScenario = async (scenario: WhatIfScenario) => {
		try {
			setApplying(true);
			setError(null);
			const response = await applyScenario(division, scenario.id);
			
			if (response.success) {
				setSelectedScenario(scenario);
				if (onScenarioApplied) {
					onScenarioApplied(scenario);
				}
				// Show success message
				alert(`Scenario "${scenario.name}" applied successfully!`);
			}
		} catch (err: any) {
			console.error('Failed to apply scenario:', err);
			setError(err.message || 'Failed to apply scenario');
		} finally {
			setApplying(false);
		}
	};

	if (loading) {
		return (
			<div className={`bg-white rounded-lg shadow-lg border border-gray-200 p-4 ${className}`}>
				<div className="text-center text-gray-600">Loading scenarios...</div>
			</div>
		);
	}

	if (error && scenarios.length === 0) {
		return (
			<div className={`bg-white rounded-lg shadow-lg border border-red-200 p-4 ${className}`}>
				<div className="text-red-600">{error}</div>
			</div>
		);
	}

	return (
		<div className={`bg-white rounded-lg shadow-lg border border-gray-200 p-4 overflow-y-auto max-h-[700px] ${className}`}>
			<div className="flex items-center justify-between mb-4 border-b pb-2">
				<div className="font-bold text-lg text-gray-800">
					🎯 What-If Scenarios - Smart Train Prioritization
				</div>
				<button
					onClick={() => setShowCatalog(!showCatalog)}
					className="text-xs px-3 py-1 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold"
				>
					{showCatalog ? 'Hide' : 'Show'} Disruption Catalog
				</button>
			</div>
			
			{/* Disruption Catalog */}
			{showCatalog && catalog && (
				<div className="mb-4 p-3 bg-blue-50 rounded-lg border border-blue-200">
					<div className="font-semibold text-sm text-blue-900 mb-2">
						📚 Disruption Catalog ({catalog.total_types} types, {catalog.total_categories} categories)
					</div>
					<div className="max-h-48 overflow-y-auto space-y-2 text-xs">
						{catalog.categories.map((category, idx) => (
							<div key={idx} className="bg-white p-2 rounded border border-blue-100">
								<div className="font-semibold text-gray-800 mb-1">{category.category}</div>
								<div className="text-gray-600 space-y-1">
									{category.disruptions.slice(0, 3).map((d, i) => (
										<div key={i} className="flex items-start gap-2">
											<span className="w-2 h-2 rounded-full mt-1.5" style={{
												backgroundColor: d.severity === 'high' ? '#ef4444' : d.severity === 'medium' ? '#f59e0b' : '#10b981'
											}}></span>
											<div className="flex-1">
												<div className="text-xs">{d.name}</div>
												{d.impact && (
													<div className="text-xs text-gray-500 mt-0.5">
														P: {d.impact.passenger_delay_minutes}min | F: {d.impact.freight_delay_minutes}min | 
														TP: -{d.impact.throughput_drop_percent}%
													</div>
												)}
											</div>
										</div>
									))}
									{category.count > 3 && (
										<div className="text-gray-500 italic text-xs">+ {category.count - 3} more...</div>
									)}
								</div>
							</div>
						))}
					</div>
				</div>
			)}

			{error && (
				<div className="mb-4 p-3 bg-red-50 border border-red-200 rounded text-red-700 text-sm">
					{error}
				</div>
			)}

			<div className="space-y-4">
				{scenarios.map((scenario) => (
					<div
						key={scenario.id}
						className={`border rounded-lg p-4 transition-all ${
							selectedScenario?.id === scenario.id
								? 'border-blue-500 bg-blue-50'
								: 'border-gray-200 hover:border-gray-300'
						}`}
					>
						{/* Scenario Header */}
						<div className="flex items-start justify-between mb-2">
							<div className="flex-1">
								<div className="flex items-center gap-2 mb-1">
									<span className="text-2xl">{typeIcons[scenario.type] || '📋'}</span>
									<h3 className="font-bold text-base text-gray-800">{scenario.name}</h3>
									<span className={`px-2 py-1 rounded text-xs font-semibold border ${severityColors[scenario.severity]}`}>
										{scenario.severity.toUpperCase()}
									</span>
								</div>
								<p className="text-sm text-gray-600 mb-2">{scenario.description}</p>
							</div>
						</div>

						{/* Scenario Details */}
						<div className="grid grid-cols-2 gap-3 mb-3 text-xs">
							<div className="bg-gray-50 p-2 rounded">
								<div className="text-gray-600">Time Window</div>
								<div className="font-semibold">{scenario.timeWindow}</div>
							</div>
							<div className="bg-gray-50 p-2 rounded">
								<div className="text-gray-600">Trains</div>
								<div className="font-semibold">
									P: {scenario.trains.passenger} | F: {scenario.trains.freight}
									{scenario.trains.emergency && ` | E: ${scenario.trains.emergency}`}
								</div>
							</div>
						</div>

						{/* Expected Impact */}
						<div className="mb-3">
							<div className="text-xs font-semibold text-gray-700 mb-1">Expected Impact:</div>
							<div className="grid grid-cols-2 gap-2 text-xs">
								<div className="bg-red-50 p-2 rounded">
									<div className="text-gray-600">Passenger Delay</div>
									<div className="font-bold text-red-700">{scenario.expectedImpact.passengerDelay} min</div>
								</div>
								<div className="bg-orange-50 p-2 rounded">
									<div className="text-gray-600">Freight Delay</div>
									<div className="font-bold text-orange-700">{scenario.expectedImpact.freightDelay} min</div>
								</div>
								<div className="bg-yellow-50 p-2 rounded">
									<div className="text-gray-600">Throughput Drop</div>
									<div className="font-bold text-yellow-700">{scenario.expectedImpact.throughputDrop}%</div>
								</div>
								<div className="bg-blue-50 p-2 rounded">
									<div className="text-gray-600">Affected Trains</div>
									<div className="font-bold text-blue-700">{scenario.expectedImpact.affectedTrains}</div>
								</div>
							</div>
						</div>

						{/* Prioritization Rules */}
						<div className="mb-3">
							<div className="text-xs font-semibold text-gray-700 mb-1">Prioritization Rules:</div>
							<ul className="list-disc list-inside text-xs text-gray-600 space-y-1">
								{scenario.prioritizationRules.map((rule, idx) => (
									<li key={idx}>{rule}</li>
								))}
							</ul>
						</div>

						{/* Disruptions with Toggle */}
						{scenario.disruptions.length > 0 && (
							<div className="mb-3">
								<button
									onClick={() => setExpandedDisruptionsId(expandedDisruptionsId === scenario.id ? null : scenario.id)}
									className="w-full py-2 px-3 rounded-lg font-semibold text-xs transition-colors bg-amber-100 hover:bg-amber-200 text-amber-900 flex items-center justify-between border border-amber-300"
								>
									<span className="flex items-center gap-2">
										<span>⚠️</span>
										<span>Disruptions ({scenario.disruptions.length})</span>
									</span>
									<span>{expandedDisruptionsId === scenario.id ? '−' : '+'}</span>
								</button>
								
								{expandedDisruptionsId === scenario.id && (
									<div className="mt-2 space-y-2">
										{scenario.disruptions.map((disruption, idx) => (
											<div key={idx} className="bg-amber-50 p-3 rounded-lg border border-amber-200 text-xs">
												<div className="flex items-center gap-2 mb-2">
													<span className="text-lg">{typeIcons[disruption.type] || '⚠️'}</span>
													<div className="font-semibold text-amber-900">
														{disruption.type.replace('_', ' ').toUpperCase()}
													</div>
												</div>
												{disruption.sectionId && (
													<div className="text-gray-700 mb-1">
														<span className="font-semibold">Section:</span> {disruption.startStation} → {disruption.endStation}
													</div>
												)}
												<div className="grid grid-cols-2 gap-2 mt-2">
													<div className="bg-white p-2 rounded">
														<div className="text-gray-600 text-xs">Duration</div>
														<div className="font-bold text-amber-700">{disruption.durationMinutes} min</div>
													</div>
													{disruption.severity && (
														<div className="bg-white p-2 rounded">
															<div className="text-gray-600 text-xs">Severity</div>
															<div className={`font-bold text-xs px-2 py-1 rounded inline-block ${
																disruption.severity === 'high' ? 'bg-red-100 text-red-700' :
																disruption.severity === 'medium' ? 'bg-yellow-100 text-yellow-700' :
																'bg-green-100 text-green-700'
															}`}>
																{disruption.severity.toUpperCase()}
															</div>
														</div>
													)}
												</div>
												{disruption.description && (
													<div className="mt-2 text-gray-600 text-xs italic">
														{disruption.description}
													</div>
												)}
											</div>
										))}
									</div>
								)}
							</div>
						)}

						{/* Special Train Info */}
						{scenario.specialTrain && (
							<div className="mb-3 bg-purple-50 p-2 rounded text-xs">
								<div className="font-semibold text-purple-800">Special Train:</div>
								<div className="text-purple-700">
									{scenario.specialTrain.trainNo} - {scenario.specialTrain.trainName}
								</div>
								<div className="text-purple-600">Priority: {scenario.specialTrain.priority}</div>
							</div>
						)}

						{/* Why Button - Detailed Decision Explanation */}
						{scenario.decisionExplanation && (
							<div className="mb-3">
								<button
									onClick={() => setExpandedWhyId(expandedWhyId === scenario.id ? null : scenario.id)}
									className="w-full py-2 px-4 rounded-lg font-semibold text-sm transition-colors bg-indigo-600 hover:bg-indigo-700 text-white flex items-center justify-between"
								>
									<span className="flex items-center gap-2">
										<span>🤔</span>
										<span>Why This Decision?</span>
									</span>
									<span>{expandedWhyId === scenario.id ? '−' : '+'}</span>
								</button>
								
								{expandedWhyId === scenario.id && scenario.decisionExplanation && (
									<div className="mt-3 p-4 bg-gradient-to-br from-blue-50 to-indigo-50 rounded-lg border border-blue-200 space-y-4">
										{/* Algorithm */}
										<div>
											<div className="text-xs font-bold text-indigo-900 mb-2 flex items-center gap-2">
												<span>⚙️</span>
												<span>Algorithm Used:</span>
											</div>
											<div className="text-sm text-gray-800 bg-white p-2 rounded border border-indigo-100">
												{scenario.decisionExplanation.algorithm}
											</div>
										</div>

										{/* Reasoning */}
										<div>
											<div className="text-xs font-bold text-indigo-900 mb-2 flex items-center gap-2">
												<span>💭</span>
												<span>Decision Reasoning:</span>
											</div>
											<ul className="space-y-2">
												{scenario.decisionExplanation.reasoning.map((reason, idx) => (
													<li key={idx} className="text-sm text-gray-700 bg-white p-2 rounded border border-indigo-100 flex items-start gap-2">
														<span className="text-indigo-600 font-bold mt-0.5">•</span>
														<span>{reason}</span>
													</li>
												))}
											</ul>
										</div>

										{/* Priority Calculation */}
										<div>
											<div className="text-xs font-bold text-indigo-900 mb-2 flex items-center gap-2">
												<span>📊</span>
												<span>Priority Score Calculation:</span>
											</div>
											<div className="bg-white p-3 rounded border border-indigo-100">
												<div className="grid grid-cols-2 gap-3 mb-3">
													{scenario.decisionExplanation.priorityCalculation.passengerScore !== undefined && (
														<div className="bg-green-50 p-2 rounded">
															<div className="text-xs text-gray-600">Passenger Score</div>
															<div className="text-lg font-bold text-green-700">
																{scenario.decisionExplanation.priorityCalculation.passengerScore}/10
															</div>
														</div>
													)}
													{scenario.decisionExplanation.priorityCalculation.freightScore !== undefined && (
														<div className="bg-amber-50 p-2 rounded">
															<div className="text-xs text-gray-600">Freight Score</div>
															<div className="text-lg font-bold text-amber-700">
																{scenario.decisionExplanation.priorityCalculation.freightScore}/10
															</div>
														</div>
													)}
													{scenario.decisionExplanation.priorityCalculation.emergencyScore !== undefined && (
														<div className="bg-red-50 p-2 rounded">
															<div className="text-xs text-gray-600">Emergency Score</div>
															<div className="text-lg font-bold text-red-700">
																{scenario.decisionExplanation.priorityCalculation.emergencyScore}/10
															</div>
														</div>
													)}
												</div>
												<div className="text-xs font-semibold text-gray-700 mb-1">Scoring Factors:</div>
												<ul className="space-y-1">
													{scenario.decisionExplanation.priorityCalculation.factors.map((factor, idx) => (
														<li key={idx} className="text-xs text-gray-600 flex items-start gap-2">
															<span className="text-indigo-500">▸</span>
															<span>{factor}</span>
														</li>
													))}
												</ul>
											</div>
										</div>

										{/* Trade-offs */}
										<div>
											<div className="text-xs font-bold text-indigo-900 mb-2 flex items-center gap-2">
												<span>⚖️</span>
												<span>Trade-offs Considered:</span>
											</div>
											<ul className="space-y-2">
												{scenario.decisionExplanation.tradeoffs.map((tradeoff, idx) => (
													<li key={idx} className="text-sm text-gray-700 bg-white p-2 rounded border border-indigo-100">
														{tradeoff}
													</li>
												))}
											</ul>
										</div>

										{/* Alternatives Considered */}
										<div>
											<div className="text-xs font-bold text-indigo-900 mb-2 flex items-center gap-2">
												<span>🔄</span>
												<span>Alternatives Considered & Rejected:</span>
											</div>
											<div className="space-y-2">
												{scenario.decisionExplanation.alternativesConsidered.map((alt, idx) => (
													<div key={idx} className="bg-white p-3 rounded border border-red-200">
														<div className="flex items-start justify-between mb-1">
															<div className="text-sm font-semibold text-gray-800">{alt.option}</div>
															<span className="text-xs bg-red-100 text-red-700 px-2 py-1 rounded">REJECTED</span>
														</div>
														<div className="text-xs text-gray-600 mb-1">
															<span className="font-semibold">Impact:</span> {alt.impact}
														</div>
														<div className="text-xs text-red-700">
															<span className="font-semibold">Reason:</span> {alt.rejected}
														</div>
													</div>
												))}
											</div>
										</div>

										{/* Expected Outcome */}
										<div>
											<div className="text-xs font-bold text-indigo-900 mb-2 flex items-center gap-2">
												<span>✅</span>
												<span>Expected Outcome:</span>
											</div>
											<div className="text-sm text-gray-800 bg-green-50 p-3 rounded border border-green-200">
												{scenario.decisionExplanation.expectedOutcome}
											</div>
										</div>
									</div>
								)}
							</div>
						)}

						{/* Apply Button */}
						<button
							onClick={() => handleApplyScenario(scenario)}
							disabled={applying}
							className={`w-full py-2 px-4 rounded-lg font-semibold text-sm transition-colors ${
								applying
									? 'bg-gray-400 text-white cursor-not-allowed'
									: selectedScenario?.id === scenario.id
									? 'bg-green-600 hover:bg-green-700 text-white'
									: 'bg-blue-600 hover:bg-blue-700 text-white'
							}`}
						>
							{applying
								? 'Applying...'
								: selectedScenario?.id === scenario.id
								? '✓ Applied'
								: 'Apply Scenario'}
						</button>
					</div>
				))}
			</div>

			{scenarios.length === 0 && (
				<div className="text-center text-gray-500 py-8">
					No scenarios available for this division
				</div>
			)}
		</div>
	);
}

