import React, { useState } from 'react';
import type { DelayInput } from '../lib/api';

interface ControlsPanelProps {
	division: string;
	availableDivisions: string[];
	onDivisionChange: (division: string) => void;
	delays: DelayInput[];
	onDelaysChange: (delays: DelayInput[]) => void;
	weatherEnabled: boolean;
	onWeatherToggle: (enabled: boolean) => void;
	autoResolveConflicts: boolean;
	onAutoResolveToggle: (enabled: boolean) => void;
	timeSpeed: number;
	onTimeSpeedChange: (speed: number) => void;
	onRunSimulation: () => void;
	isRunning: boolean;
	trainTypeFilter?: string;
	onTrainTypeFilterChange?: (type: string) => void;
	priorityFilter?: number;
	onPriorityFilterChange?: (priority: number | undefined) => void;
}

export default function ControlsPanel({
	division,
	availableDivisions,
	onDivisionChange,
	delays,
	onDelaysChange,
	weatherEnabled,
	onWeatherToggle,
	autoResolveConflicts,
	onAutoResolveToggle,
	timeSpeed,
	onTimeSpeedChange,
	onRunSimulation,
	isRunning,
	trainTypeFilter,
	onTrainTypeFilterChange,
	priorityFilter,
	onPriorityFilterChange,
}: ControlsPanelProps) {
	const [newDelayTrainId, setNewDelayTrainId] = useState('');
	const [newDelayMinutes, setNewDelayMinutes] = useState(0);

	const addDelay = () => {
		if (newDelayTrainId && newDelayMinutes > 0) {
			onDelaysChange([
				...delays,
				{ train_id: newDelayTrainId, delay_minutes: newDelayMinutes },
			]);
			setNewDelayTrainId('');
			setNewDelayMinutes(0);
		}
	};

	const removeDelay = (index: number) => {
		onDelaysChange(delays.filter((_, i) => i !== index));
	};

	return (
		<div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6 space-y-6 h-full overflow-y-auto">
			<h2 className="text-xl font-bold text-gray-800 mb-4">Simulation Controls</h2>

			{/* Division Selection */}
			<div>
				<label className="block text-sm font-medium text-gray-700 mb-2">
					Select Division
				</label>
				<select
					value={division}
					onChange={(e) => onDivisionChange(e.target.value)}
					className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-white text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
					disabled={isRunning}
				>
					{availableDivisions.map((div) => (
						<option key={div} value={div}>
							{div}
						</option>
					))}
				</select>
			</div>

			{/* Filters */}
			<div className="border-t border-gray-200 pt-4">
				<h3 className="text-sm font-semibold text-gray-700 mb-3">Filters</h3>

				{/* Train Type Filter */}
				{onTrainTypeFilterChange && (
					<div className="mb-4">
						<label className="block text-sm font-medium text-gray-700 mb-2">
							Train Type
						</label>
						<select
							value={trainTypeFilter || ''}
							onChange={(e) => onTrainTypeFilterChange(e.target.value ? e.target.value : undefined)}
							className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-white text-gray-900"
						>
							<option value="">All Types</option>
							<option value="passenger">Passenger</option>
							<option value="express">Express</option>
							<option value="freight">Freight</option>
							<option value="superfast">Superfast</option>
							<option value="rajdhani">Rajdhani</option>
							<option value="shatabdi">Shatabdi</option>
						</select>
					</div>
				)}

				{/* Priority Filter */}
				{onPriorityFilterChange && (
					<div>
						<label className="block text-sm font-medium text-gray-700 mb-2">
							Minimum Priority
						</label>
						<input
							type="number"
							min="1"
							max="10"
							value={priorityFilter || ''}
							onChange={(e) =>
								onPriorityFilterChange(
									e.target.value ? parseInt(e.target.value) : undefined
								)
							}
							className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-white text-gray-900"
							placeholder="All priorities"
						/>
					</div>
				)}
			</div>

			{/* Add Delay */}
			<div className="border-t border-gray-200 pt-4">
				<h3 className="text-sm font-semibold text-gray-700 mb-3">Add Delay</h3>
				<div className="space-y-3">
					<div>
						<label className="block text-sm font-medium text-gray-700 mb-1">
							Train Number
						</label>
						<input
							type="text"
							value={newDelayTrainId}
							onChange={(e) => setNewDelayTrainId(e.target.value)}
							className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-white text-gray-900"
							placeholder="e.g., 12001"
							disabled={isRunning}
						/>
					</div>
					<div>
						<label className="block text-sm font-medium text-gray-700 mb-1">
							Delay (minutes)
						</label>
						<input
							type="number"
							min="1"
							value={newDelayMinutes}
							onChange={(e) => setNewDelayMinutes(parseInt(e.target.value) || 0)}
							className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-white text-gray-900"
							disabled={isRunning}
						/>
					</div>
					<button
						onClick={addDelay}
						disabled={!newDelayTrainId || newDelayMinutes <= 0 || isRunning}
						className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
					>
						Add Delay
					</button>
				</div>

				{/* Active Delays */}
				{delays.length > 0 && (
					<div className="mt-4">
						<div className="text-sm font-medium text-gray-700 mb-2">Active Delays:</div>
						<div className="space-y-2">
							{delays.map((delay, index) => (
								<div
									key={index}
									className="flex items-center justify-between bg-yellow-50 border border-yellow-200 rounded px-3 py-2"
								>
									<span className="text-sm text-gray-700">
										{delay.train_id}: {delay.delay_minutes} min
									</span>
									<button
										onClick={() => removeDelay(index)}
										disabled={isRunning}
										className="text-red-600 hover:text-red-800 text-sm"
									>
										Remove
									</button>
								</div>
							))}
						</div>
					</div>
				)}
			</div>

			{/* Weather Impact */}
			<div className="border-t border-gray-200 pt-4">
				<div className="flex items-center justify-between">
					<div>
						<label className="block text-sm font-medium text-gray-700 mb-1">
							Weather Impact
						</label>
						<p className="text-xs text-gray-500">
							Apply weather effects (fog: -20%, rain: -10%, heat: -5-15%)
						</p>
					</div>
					<label className="relative inline-flex items-center cursor-pointer">
						<input
							type="checkbox"
							checked={weatherEnabled}
							onChange={(e) => onWeatherToggle(e.target.checked)}
							className="sr-only peer"
							disabled={isRunning}
						/>
						<div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
					</label>
				</div>
			</div>

			{/* Auto-Resolve Conflicts */}
			<div className="border-t border-gray-200 pt-4">
				<div className="flex items-center justify-between">
					<div>
						<label className="block text-sm font-medium text-gray-700 mb-1">
							Auto-Resolve Conflicts
						</label>
						<p className="text-xs text-gray-500">
							Automatically resolve conflicts by delaying lower priority trains
						</p>
					</div>
					<label className="relative inline-flex items-center cursor-pointer">
						<input
							type="checkbox"
							checked={autoResolveConflicts}
							onChange={(e) => onAutoResolveToggle(e.target.checked)}
							className="sr-only peer"
							disabled={isRunning}
						/>
						<div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
					</label>
				</div>
			</div>

			{/* Time Speed */}
			<div className="border-t border-gray-200 pt-4">
				<label className="block text-sm font-medium text-gray-700 mb-2">
					Time Speed: {timeSpeed}x
				</label>
				<input
					type="range"
					min="1"
					max="20"
					step="1"
					value={timeSpeed}
					onChange={(e) => onTimeSpeedChange(parseInt(e.target.value))}
					className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
					disabled={isRunning}
				/>
				<div className="flex justify-between text-xs text-gray-500 mt-1">
					<span>1x</span>
					<span>5x</span>
					<span>10x</span>
					<span>20x</span>
				</div>
			</div>

			{/* Run Simulation Button */}
			<div className="border-t border-gray-200 pt-4">
				<button
					onClick={onRunSimulation}
					disabled={isRunning}
					className="w-full px-6 py-3 bg-violet-600 text-white rounded-lg hover:bg-violet-700 disabled:bg-gray-400 disabled:cursor-not-allowed font-medium text-lg"
				>
					{isRunning ? 'Running Simulation...' : 'Run Simulation'}
				</button>
			</div>
		</div>
	);
}

