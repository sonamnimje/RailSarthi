import React, { useState, useEffect } from 'react';
import { 
	runSimulation, 
	applySimulationToReal, 
	type SimulationScenario, 
	type Disruption, 
	type SimulationResult,
	type DisruptionType 
} from '../lib/api';
import DigitalTwinMap from '../components/DigitalTwinMap';

// Predefined disruption scenarios
const PREDEFINED_SCENARIOS: SimulationScenario[] = [
	{
		name: "Track Block - High Impact",
		disruptions: [{
			type: "track_block",
			description: "Maintenance work on track section",
			start_ts: Date.now() / 1000 + 300, // 5 minutes from now
			duration_seconds: 3600, // 1 hour
			section_id: "SEC-001",
			severity: "high"
		}]
	},
	{
		name: "Signal Failure - Medium Impact",
		disruptions: [{
			type: "signal_failure",
			description: "Signal system malfunction",
			start_ts: Date.now() / 1000 + 600, // 10 minutes from now
			duration_seconds: 1800, // 30 minutes
			section_id: "SEC-001",
			severity: "medium"
		}]
	},
	{
		name: "Platform Issue - Low Impact",
		disruptions: [{
			type: "platform_issue",
			description: "Platform 2 unavailable",
			start_ts: Date.now() / 1000 + 900, // 15 minutes from now
			duration_seconds: 1200, // 20 minutes
			station_id: "STN-001",
			severity: "low"
		}]
	},
	{
		name: "Multiple Disruptions",
		disruptions: [
			{
				type: "delay",
				description: "Weather-related delay",
				start_ts: Date.now() / 1000 + 300,
				duration_seconds: 1800,
				section_id: "SEC-001",
				severity: "medium"
			},
			{
				type: "rolling_stock",
				description: "Train mechanical issue",
				start_ts: Date.now() / 1000 + 600,
				duration_seconds: 2400,
				section_id: "SEC-001",
				severity: "high"
			}
		]
	}
];

// Disruption scenario selection panel
function ScenarioSelectionPanel({ 
	selectedScenario, 
	onScenarioSelect, 
	onCustomScenario 
}: {
	selectedScenario: SimulationScenario | null;
	onScenarioSelect: (scenario: SimulationScenario) => void;
	onCustomScenario: (scenario: SimulationScenario) => void;
}) {
	const [customName, setCustomName] = useState('');
	const [customDisruptions, setCustomDisruptions] = useState<Disruption[]>([]);
	const [newDisruption, setNewDisruption] = useState<Partial<Disruption>>({
		type: 'delay',
		severity: 'medium',
		duration_seconds: 1800
	});

	const addDisruption = () => {
		if (newDisruption.type && newDisruption.duration_seconds) {
			const disruption: Disruption = {
				type: newDisruption.type as DisruptionType,
				description: newDisruption.description || '',
				start_ts: Date.now() / 1000 + 300,
				duration_seconds: newDisruption.duration_seconds,
				section_id: 'SEC-001',
				severity: newDisruption.severity || 'medium'
			};
			setCustomDisruptions([...customDisruptions, disruption]);
			setNewDisruption({ type: 'delay', severity: 'medium', duration_seconds: 1800 });
		}
	};

	const createCustomScenario = () => {
		if (customName && customDisruptions.length > 0) {
			onCustomScenario({
				name: customName,
				disruptions: customDisruptions
			});
			setCustomName('');
			setCustomDisruptions([]);
		}
	};

	return (
		<div className="bg-blue-50 rounded-2xl p-6 shadow">
			<h3 className="text-lg font-semibold text-violet-700 mb-4">🎯 Select Disruption Scenario</h3>
			
			{/* Predefined scenarios */}
			<div className="mb-6">
				<h4 className="text-sm font-medium text-gray-700 mb-3">Predefined Scenarios</h4>
				<div className="space-y-2">
					{PREDEFINED_SCENARIOS.map((scenario, index) => (
						<button
							key={index}
							onClick={() => onScenarioSelect(scenario)}
							className={`w-full text-left p-3 rounded-lg border-2 transition-colors ${
								selectedScenario?.name === scenario.name
									? 'border-violet-500 bg-violet-50'
									: 'border-gray-200 hover:border-gray-300'
							}`}
						>
							<div className="font-medium text-gray-900">{scenario.name}</div>
							<div className="text-sm text-gray-600">
								{scenario.disruptions.length} disruption{scenario.disruptions.length !== 1 ? 's' : ''}
							</div>
						</button>
					))}
				</div>
			</div>

			{/* Custom scenario builder */}
			<div className="border-t pt-4">
				<h4 className="text-sm font-medium text-gray-700 mb-3">Create Custom Scenario</h4>
				
				<div className="space-y-3">
					<input
						type="text"
						placeholder="Scenario name"
						value={customName}
						onChange={(e) => setCustomName(e.target.value)}
						className="w-full p-2 border border-gray-300 rounded-lg"
					/>
					
					<div className="grid grid-cols-2 gap-2">
						<select
							value={newDisruption.type || 'delay'}
							onChange={(e) => setNewDisruption({...newDisruption, type: e.target.value as DisruptionType})}
							className="p-2 border border-gray-300 rounded-lg"
						>
							<option value="delay">Delay</option>
							<option value="track_block">Track Block</option>
							<option value="platform_issue">Platform Issue</option>
							<option value="rolling_stock">Rolling Stock</option>
							<option value="signal_failure">Signal Failure</option>
						</select>
						
						<select
							value={newDisruption.severity || 'medium'}
							onChange={(e) => setNewDisruption({...newDisruption, severity: e.target.value as 'low' | 'medium' | 'high'})}
							className="p-2 border border-gray-300 rounded-lg"
						>
							<option value="low">Low Severity</option>
							<option value="medium">Medium Severity</option>
							<option value="high">High Severity</option>
						</select>
					</div>
					
					<div className="grid grid-cols-2 gap-2">
						<input
							type="number"
							placeholder="Duration (minutes)"
							value={newDisruption.duration_seconds ? newDisruption.duration_seconds / 60 : ''}
							onChange={(e) => setNewDisruption({...newDisruption, duration_seconds: parseInt(e.target.value) * 60})}
							className="p-2 border border-gray-300 rounded-lg"
						/>
						
						<button
							onClick={addDisruption}
							className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
						>
							Add Disruption
						</button>
					</div>
					
					{customDisruptions.length > 0 && (
						<div className="space-y-1">
							<div className="text-sm font-medium text-gray-700">Added Disruptions:</div>
							{customDisruptions.map((disruption, index) => (
								<div key={index} className="text-xs bg-gray-100 p-2 rounded">
									{disruption.type} - {disruption.severity} - {disruption.duration_seconds / 60}min
								</div>
							))}
						</div>
					)}
					
					<button
						onClick={createCustomScenario}
						disabled={!customName || customDisruptions.length === 0}
						className="w-full px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-gray-400"
					>
						Create Custom Scenario
					</button>
				</div>
			</div>
		</div>
	);
}

// Digital twin map is rendered via DigitalTwinMap component

// Predicted outcomes panel
function PredictedOutcomesPanel({ 
	simulationResult 
}: { 
	simulationResult: SimulationResult | null;
}) {
	if (!simulationResult) {
		return (
			<div className="bg-indigo-100 rounded-2xl p-6 shadow min-w-[350px]">
				<div className="text-lg font-semibold text-indigo-700 mb-4">📊 Predicted Outcomes</div>
				<div className="text-gray-600 text-center py-8">
					Run a simulation to see predicted outcomes
				</div>
			</div>
		);
	}

	const { metrics, predictions } = simulationResult;

	return (
		<div className="bg-indigo-100 rounded-2xl p-6 shadow min-w-[350px]">
			<div className="text-lg font-semibold text-indigo-700 mb-4">📊 Predicted Outcomes</div>
			
			{/* Key Metrics */}
			<div className="space-y-3 mb-6">
				<div className="flex justify-between items-center">
					<span className="text-gray-700">⏱️ Total Delay:</span>
					<span className="font-bold text-red-600">{metrics.total_delay_minutes} min</span>
				</div>
				<div className="flex justify-between items-center">
					<span className="text-gray-700">🚫 Missed Connections:</span>
					<span className="font-bold text-orange-600">{metrics.missed_connections}</span>
				</div>
				<div className="flex justify-between items-center">
					<span className="text-gray-700">⚠️ Platform Conflicts:</span>
					<span className="font-bold text-yellow-600">{metrics.platform_conflicts}</span>
				</div>
				<div className="flex justify-between items-center">
					<span className="text-gray-700">📉 Throughput Impact:</span>
					<span className="font-bold text-purple-600">{metrics.throughput_impact_percent}%</span>
				</div>
				<div className="flex justify-between items-center">
					<span className="text-gray-700">👥 Passenger Delay:</span>
					<span className="font-bold text-blue-600">{metrics.passenger_delay_hours}h</span>
				</div>
			</div>

			{/* Train Impacts */}
			<div className="mb-4">
				<div className="text-sm font-medium text-gray-700 mb-2">Train Impacts:</div>
				<div className="space-y-1 max-h-32 overflow-y-auto">
					{predictions.train_impacts.map((impact, index) => (
						<div key={index} className="flex justify-between items-center text-xs bg-blue-50 p-2 rounded">
							<span>{impact.train_id}</span>
							<div className="flex items-center gap-2">
								<span className={`px-2 py-1 rounded text-xs ${
									impact.status === 'on_time' ? 'bg-green-100 text-green-800' :
									impact.status === 'delayed' ? 'bg-yellow-100 text-yellow-800' :
									'bg-red-100 text-red-800'
								}`}>
									{impact.status}
								</span>
								<span className="font-medium">{impact.delay_minutes}min</span>
							</div>
						</div>
					))}
				</div>
			</div>

			{/* Timeline Preview */}
			<div>
				<div className="text-sm font-medium text-gray-700 mb-2">Timeline Preview:</div>
				<div className="space-y-1 max-h-24 overflow-y-auto">
					{predictions.timeline.slice(0, 3).map((event, index) => (
						<div key={index} className="text-xs bg-blue-50 p-2 rounded">
							<div className="font-medium">{event.event}</div>
							<div className="text-gray-600">{event.impact}</div>
						</div>
					))}
					{predictions.timeline.length > 3 && (
						<div className="text-xs text-gray-500 text-center">
							+{predictions.timeline.length - 3} more events
						</div>
					)}
				</div>
			</div>
		</div>
	);
}

// Apply Results Modal
function ApplyResultsModal({ 
	applyResult, 
	onClose 
}: { 
	applyResult: {
		success: boolean;
		message: string;
		details?: any;
	} | null;
	onClose: () => void;
}) {
	if (!applyResult) return null;

	return (
		<div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
			<div className="bg-blue-50 rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
				{/* Header */}
				<div className={`p-6 border-b ${applyResult.success ? 'bg-green-50' : 'bg-red-50'}`}>
					<div className="flex items-center justify-between">
						<div className="flex items-center gap-3">
							<div className={`w-12 h-12 rounded-full flex items-center justify-center text-2xl ${
								applyResult.success ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-600'
							}`}>
								{applyResult.success ? '✅' : '❌'}
							</div>
							<div>
								<h3 className="text-xl font-bold text-gray-900">
									{applyResult.success ? 'Simulation Applied Successfully!' : 'Application Failed'}
								</h3>
								<p className="text-gray-600">{applyResult.message}</p>
							</div>
						</div>
						<button
							onClick={onClose}
							className="text-gray-400 hover:text-gray-600 text-2xl"
						>
							×
						</button>
					</div>
				</div>

				{/* Content */}
				<div className="p-6 space-y-6">
					{applyResult.success && applyResult.details && (
						<>
							{/* Actions Applied */}
							<div className="bg-blue-50 rounded-xl p-4">
								<h4 className="font-semibold text-blue-900 mb-3 flex items-center gap-2">
									🚀 Actions Applied
								</h4>
								<div className="space-y-2">
									{applyResult.details.actions_applied?.length > 0 ? (
										applyResult.details.actions_applied.map((action: string, index: number) => (
											<div key={index} className="flex items-start gap-2 text-sm">
												<span className="text-blue-600 mt-1">•</span>
												<span className="text-gray-700">{action}</span>
											</div>
										))
									) : (
										<p className="text-gray-600 text-sm">No specific actions required</p>
									)}
								</div>
							</div>

							{/* Schedule Updates */}
							<div className="bg-purple-50 rounded-xl p-4">
								<h4 className="font-semibold text-purple-900 mb-3 flex items-center gap-2">
									📅 Schedule Updates
								</h4>
								<div className="grid grid-cols-2 gap-4">
									<div className="text-center">
										<div className="text-2xl font-bold text-purple-600">
											{applyResult.details.schedule_updates?.trains_updated || 0}
										</div>
										<div className="text-sm text-gray-600">Trains Updated</div>
									</div>
									<div className="text-center">
										<div className="text-2xl font-bold text-purple-600">
											{applyResult.details.schedule_updates?.platform_changes || 0}
										</div>
										<div className="text-sm text-gray-600">Platform Changes</div>
									</div>
									<div className="text-center">
										<div className="text-2xl font-bold text-purple-600">
											{applyResult.details.schedule_updates?.schedule_adjustments || 0}
										</div>
										<div className="text-sm text-gray-600">Schedule Adjustments</div>
									</div>
									<div className="text-center">
										<div className={`text-2xl font-bold ${
											applyResult.details.schedule_updates?.passenger_notifications ? 'text-green-600' : 'text-gray-400'
										}`}>
											{applyResult.details.schedule_updates?.passenger_notifications ? '✓' : '✗'}
										</div>
										<div className="text-sm text-gray-600">Passenger Notifications</div>
									</div>
								</div>
							</div>

							{/* Notifications Sent */}
							<div className="bg-orange-50 rounded-xl p-4">
								<h4 className="font-semibold text-orange-900 mb-3 flex items-center gap-2">
									🔔 Notifications Sent
								</h4>
								<div className="space-y-2">
									{applyResult.details.notifications_sent?.length > 0 ? (
										applyResult.details.notifications_sent.map((notif: string, index: number) => (
											<div key={index} className="flex items-start gap-2 text-sm">
												<span className="text-orange-600 mt-1">•</span>
												<span className="text-gray-700">{notif}</span>
											</div>
										))
									) : (
										<p className="text-gray-600 text-sm">No notifications sent</p>
									)}
								</div>
							</div>
						</>
					)}
				</div>

				{/* Footer */}
				<div className="p-6 border-t bg-gray-50 rounded-b-2xl">
					<button
						onClick={onClose}
						className={`w-full px-6 py-3 rounded-lg font-medium ${
							applyResult.success 
								? 'bg-green-600 text-white hover:bg-green-700' 
								: 'bg-red-600 text-white hover:bg-red-700'
						}`}
					>
						{applyResult.success ? 'Continue' : 'Close'}
					</button>
				</div>
			</div>
		</div>
	);
}

// Simulation controls
function SimulationControls({ 
	selectedScenario, 
	simulationResult, 
	onRunSimulation, 
	onApplyToReal, 
	isRunning 
}: {
	selectedScenario: SimulationScenario | null;
	simulationResult: SimulationResult | null;
	onRunSimulation: () => void;
	onApplyToReal: () => void;
	isRunning: boolean;
}) {
	return (
		<div className="bg-blue-50 rounded-2xl p-6 shadow">
			<div className="text-lg font-semibold text-violet-700 mb-4">🎮 Simulation Controls</div>
			
			<div className="space-y-4">
				<div className="text-sm text-gray-600">
					<strong>Selected Scenario:</strong> {selectedScenario?.name || 'None'}
				</div>
				
				<div className="flex gap-4">
					<button
						onClick={onRunSimulation}
						disabled={!selectedScenario || isRunning}
						className="flex-1 px-6 py-3 bg-violet-600 text-white rounded-lg hover:bg-violet-700 disabled:bg-gray-400 font-medium"
					>
						{isRunning ? 'Running Simulation...' : 'Run Simulation'}
					</button>
					
					<button
						onClick={onApplyToReal}
						disabled={!simulationResult}
						className="flex-1 px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-gray-400 font-medium"
					>
						Apply to Real Section
					</button>
				</div>
				
				{simulationResult && (
					<div className="text-sm text-green-600 bg-green-50 p-3 rounded-lg">
						✅ Simulation completed successfully! ID: {simulationResult.id}
					</div>
				)}
			</div>
		</div>
	);
}

export default function SimulationPage() {
	const [selectedScenario, setSelectedScenario] = useState<SimulationScenario | null>(null);
	const [simulationResult, setSimulationResult] = useState<SimulationResult | null>(null);
	const [isRunning, setIsRunning] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [isAuthenticated, setIsAuthenticated] = useState(false);
	const [applyResult, setApplyResult] = useState<{
		success: boolean;
		message: string;
		details?: any;
	} | null>(null);

	// Check authentication status
	useEffect(() => {
		const token = localStorage.getItem('token');
		setIsAuthenticated(!!token);
	}, []);

	const handleRunSimulation = async () => {
		if (!selectedScenario) return;
		
		setIsRunning(true);
		setError(null);
		
		try {
			console.log('Running simulation with scenario:', selectedScenario);
			console.log('Auth token:', localStorage.getItem('token'));
			const result = await runSimulation(selectedScenario);
			console.log('Simulation result:', result);
			setSimulationResult(result);
		} catch (err: any) {
			console.error('Simulation error:', err);
			setError(err.message);
		} finally {
			setIsRunning(false);
		}
	};

	const handleApplyToReal = async () => {
		if (!simulationResult) return;
		
		try {
			console.log('Applying simulation to real system:', simulationResult.id);
			const response = await applySimulationToReal(simulationResult.id);
			console.log('Apply response:', response);
			setApplyResult(response);
		} catch (err: any) {
			console.error('Error applying simulation:', err);
			setApplyResult({
				success: false,
				message: 'Error applying simulation: ' + err.message
			});
		}
	};

	return (
		<div className="min-h-screen bg-gray-50 p-4 sm:p-6">
			{/* Header */}
			<div className="flex items-center gap-2 sm:gap-3 mb-4 sm:mb-6">
				<h1 className="text-2xl sm:text-3xl md:text-4xl font-extrabold text-gray-800">🧪 Simulation & Digital Twin</h1>
			</div>

			{/* Authentication check */}
			{!isAuthenticated && (
				<div className="mb-6 p-4 bg-yellow-100 border border-yellow-400 text-yellow-700 rounded-lg">
					⚠️ Please log in to use the simulation features. <a href="/login" className="underline">Go to Login</a>
				</div>
			)}

			{/* Error display */}
			{error && (
				<div className="mb-6 p-4 bg-red-100 border border-red-400 text-red-700 rounded-lg">
					Error: {error}
				</div>
			)}

			{/* Main layout */}
			<div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
				{/* Left panel: Scenario selection */}
				<div className="lg:col-span-1">
					<ScenarioSelectionPanel
						selectedScenario={selectedScenario}
						onScenarioSelect={setSelectedScenario}
						onCustomScenario={setSelectedScenario}
					/>
				</div>

				{/* Center panel: Simulation map */}
				<div className="lg:col-span-1">
					<DigitalTwinMap />
				</div>

				{/* Right panel: Predicted outcomes */}
				<div className="lg:col-span-1">
					<PredictedOutcomesPanel
						simulationResult={simulationResult}
					/>
				</div>
			</div>

			{/* Bottom panel: Simulation controls */}
			{isAuthenticated && (
				<SimulationControls
					selectedScenario={selectedScenario}
					simulationResult={simulationResult}
					onRunSimulation={handleRunSimulation}
					onApplyToReal={handleApplyToReal}
					isRunning={isRunning}
				/>
			)}

			{/* Apply Results Modal */}
			<ApplyResultsModal
				applyResult={applyResult}
				onClose={() => setApplyResult(null)}
			/>
		</div>
	);
}


