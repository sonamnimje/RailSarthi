import React from 'react';
import { ComprehensiveKPIs } from '../lib/api';

interface KPIPanelProps {
	kpis: ComprehensiveKPIs;
	className?: string;
}

export default function KPIPanel({ kpis, className = '' }: KPIPanelProps) {
	const { train_performance, speed_travel, disruption_impact, operational_efficiency, simulation_predictive } = kpis;

	return (
		<div className={`bg-white rounded-lg shadow-lg border border-gray-200 p-4 overflow-y-auto max-h-[600px] ${className}`}>
			<div className="font-bold text-lg text-gray-800 mb-4 border-b pb-2">📊 Comprehensive KPIs - Itarsi-Bhopal Section</div>
			
			{/* 1. Train Performance KPIs */}
			<div className="mb-4">
				<div className="font-semibold text-sm text-blue-700 mb-2">1️⃣ Train Performance</div>
				<div className="grid grid-cols-2 gap-2 text-xs">
					<div className="bg-blue-50 p-2 rounded">
						<div className="text-gray-600">On-Time Performance</div>
						<div className="font-bold text-blue-900">{train_performance.on_time_performance_percent}%</div>
					</div>
					<div className="bg-blue-50 p-2 rounded">
						<div className="text-gray-600">Schedule Adherence</div>
						<div className="font-bold text-blue-900">{train_performance.schedule_adherence_percent}%</div>
					</div>
					<div className="bg-green-50 p-2 rounded">
						<div className="text-gray-600">Avg Delay (Passenger)</div>
						<div className="font-bold text-green-900">{train_performance.avg_delay_passenger_minutes} min</div>
					</div>
					<div className="bg-amber-50 p-2 rounded">
						<div className="text-gray-600">Avg Delay (Freight)</div>
						<div className="font-bold text-amber-900">{train_performance.avg_delay_freight_minutes} min</div>
					</div>
					<div className="bg-red-50 p-2 rounded col-span-2">
						<div className="text-gray-600">Max Delay</div>
						<div className="font-bold text-red-900">{train_performance.max_delay_minutes} min</div>
					</div>
				</div>
			</div>

			{/* 2. Speed & Travel KPIs */}
			<div className="mb-4">
				<div className="font-semibold text-sm text-purple-700 mb-2">2️⃣ Speed & Travel</div>
				<div className="grid grid-cols-2 gap-2 text-xs">
					<div className="bg-purple-50 p-2 rounded">
						<div className="text-gray-600">Avg Speed (Passenger)</div>
						<div className="font-bold text-purple-900">{speed_travel.avg_speed_passenger_kmph} km/h</div>
					</div>
					<div className="bg-purple-50 p-2 rounded">
						<div className="text-gray-600">Avg Speed (Freight)</div>
						<div className="font-bold text-purple-900">{speed_travel.avg_speed_freight_kmph} km/h</div>
					</div>
					<div className="bg-purple-50 p-2 rounded">
						<div className="text-gray-600">Speed Variance (P)</div>
						<div className="font-bold text-purple-900">{speed_travel.speed_variance_passenger}</div>
					</div>
					<div className="bg-purple-50 p-2 rounded">
						<div className="text-gray-600">Speed Variance (F)</div>
						<div className="font-bold text-purple-900">{speed_travel.speed_variance_freight}</div>
					</div>
				</div>
			</div>

			{/* 3. Disruption Impact KPIs */}
			<div className="mb-4">
				<div className="font-semibold text-sm text-red-700 mb-2">3️⃣ Disruption Impact</div>
				<div className="grid grid-cols-2 gap-2 text-xs">
					<div className="bg-red-50 p-2 rounded">
						<div className="text-gray-600">Trains Affected</div>
						<div className="font-bold text-red-900">{disruption_impact.trains_affected_count}</div>
					</div>
					<div className="bg-red-50 p-2 rounded">
						<div className="text-gray-600">Affected Distance</div>
						<div className="font-bold text-red-900">{disruption_impact.affected_distance_km} km</div>
					</div>
					<div className="bg-red-50 p-2 rounded">
						<div className="text-gray-600">Affected Time</div>
						<div className="font-bold text-red-900">{disruption_impact.affected_time_minutes} min</div>
					</div>
					<div className="bg-red-50 p-2 rounded">
						<div className="text-gray-600">Recovery Time</div>
						<div className="font-bold text-red-900">{disruption_impact.recovery_time_minutes} min</div>
					</div>
					<div className="bg-red-50 p-2 rounded col-span-2">
						<div className="text-gray-600">Severity Score</div>
						<div className="font-bold text-red-900">{disruption_impact.disruption_severity_score}</div>
					</div>
				</div>
				{Object.keys(disruption_impact.delay_per_disruption_type).length > 0 && (
					<div className="mt-2 text-xs">
						<div className="font-semibold text-gray-700 mb-1">Delay by Type:</div>
						{Object.entries(disruption_impact.delay_per_disruption_type).map(([type, delay]) => (
							<div key={type} className="flex justify-between px-2 py-1 bg-gray-50 rounded">
								<span className="text-gray-600">{type.replace('_', ' ')}</span>
								<span className="font-semibold">{delay} min</span>
							</div>
						))}
					</div>
				)}
			</div>

			{/* 4. Operational Efficiency KPIs */}
			<div className="mb-4">
				<div className="font-semibold text-sm text-emerald-700 mb-2">4️⃣ Operational Efficiency</div>
				<div className="grid grid-cols-2 gap-2 text-xs">
					<div className="bg-emerald-50 p-2 rounded">
						<div className="text-gray-600">P/F Delay Ratio</div>
						<div className="font-bold text-emerald-900">{operational_efficiency.passenger_freight_delay_ratio}</div>
					</div>
					<div className="bg-emerald-50 p-2 rounded">
						<div className="text-gray-600">Train Density</div>
						<div className="font-bold text-emerald-900">{operational_efficiency.train_density_per_hour}/hr</div>
					</div>
					<div className="bg-emerald-50 p-2 rounded col-span-2">
						<div className="text-gray-600">Capacity Utilization</div>
						<div className="font-bold text-emerald-900">{operational_efficiency.section_capacity_utilization_percent}%</div>
					</div>
				</div>
			</div>

			{/* 5. Simulation/Predictive KPIs */}
			<div className="mb-4">
				<div className="font-semibold text-sm text-indigo-700 mb-2">5️⃣ Simulation/Predictive</div>
				<div className="grid grid-cols-2 gap-2 text-xs">
					<div className="bg-indigo-50 p-2 rounded">
						<div className="text-gray-600">Prediction Accuracy</div>
						<div className="font-bold text-indigo-900">{simulation_predictive.prediction_accuracy_percent}%</div>
					</div>
					<div className="bg-indigo-50 p-2 rounded">
						<div className="text-gray-600">Scenario Impact</div>
						<div className="font-bold text-indigo-900">{simulation_predictive.scenario_impact_score}</div>
					</div>
					<div className="bg-indigo-50 p-2 rounded col-span-2">
						<div className="text-gray-600">Line Congestion Index</div>
						<div className="font-bold text-indigo-900">{simulation_predictive.line_congestion_index}</div>
					</div>
				</div>
			</div>
		</div>
	);
}

