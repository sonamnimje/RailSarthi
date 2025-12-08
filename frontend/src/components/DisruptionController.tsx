import React, { useState } from 'react';
import { Disruption, DisruptionType } from '../simulationEngine';

interface DisruptionControllerProps {
	stations: Array<{ code: string; name: string; distanceKm: number }>;
	onApplyDisruption: (disruption: Disruption) => void;
	onClearDisruptions?: () => void;
}

const DISRUPTION_TYPES: Array<{ value: DisruptionType; label: string; color: string }> = [
	{ value: 'signal_failure', label: 'Signal Failure', color: 'bg-amber-100 text-amber-800 border-amber-200' },
	{ value: 'track_block', label: 'Track Blockage', color: 'bg-rose-100 text-rose-800 border-rose-200' },
	{ value: 'weather_slowdown', label: 'Weather/Fog', color: 'bg-blue-100 text-blue-800 border-blue-200' },
	{ value: 'rolling_stock', label: 'Loco Failure', color: 'bg-purple-100 text-purple-800 border-purple-200' },
	{ value: 'operational', label: 'Crew Delay', color: 'bg-orange-100 text-orange-800 border-orange-200' },
	{ value: 'platform_issue', label: 'Platform Congestion', color: 'bg-pink-100 text-pink-800 border-pink-200' },
];

export default function DisruptionController({ stations, onApplyDisruption, onClearDisruptions }: DisruptionControllerProps) {
	const [selectedType, setSelectedType] = useState<DisruptionType>('signal_failure');
	const [startStation, setStartStation] = useState<string>(stations[0]?.code || '');
	const [endStation, setEndStation] = useState<string>(stations[1]?.code || '');
	const [duration, setDuration] = useState<number>(30);
	const [startDelay, setStartDelay] = useState<number>(20);
	const [description, setDescription] = useState<string>('');

	const handleApply = () => {
		if (!startStation || !endStation) {
			alert('Please select start and end stations');
			return;
		}

		const disruption: Disruption = {
			id: `ctrl_${Date.now()}`,
			type: selectedType,
			description: description || `${DISRUPTION_TYPES.find(t => t.value === selectedType)?.label} - ${startStation} → ${endStation}`,
			startStation,
			endStation,
			startAtMin: startDelay,
			durationMin: duration,
			speedReduction: {
				Passenger: selectedType === 'track_block' ? 0 : selectedType === 'signal_failure' ? 0.25 : 0.5,
				Freight: selectedType === 'track_block' ? 0 : selectedType === 'signal_failure' ? 0.15 : 0.7,
			},
		};

		onApplyDisruption(disruption);
		
		// Reset form
		setDescription('');
	};

	const selectedTypeInfo = DISRUPTION_TYPES.find(t => t.value === selectedType);

	return (
		<div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
			<div className="flex items-center justify-between mb-4">
				<div>
					<div className="text-xs uppercase font-semibold text-slate-500">Controller</div>
					<div className="text-lg font-bold text-slate-800">Apply Disruption</div>
				</div>
			</div>

			<div className="space-y-4">
				{/* Disruption Type */}
				<div>
					<label className="block text-xs font-semibold text-slate-700 mb-2">Disruption Type</label>
					<select
						value={selectedType}
						onChange={(e) => setSelectedType(e.target.value as DisruptionType)}
						className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-800"
					>
						{DISRUPTION_TYPES.map((type) => (
							<option key={type.value} value={type.value}>
								{type.label}
							</option>
						))}
					</select>
				</div>

				{/* Station Selection */}
				<div className="grid grid-cols-2 gap-3">
					<div>
						<label className="block text-xs font-semibold text-slate-700 mb-2">Start Station</label>
						<select
							value={startStation}
							onChange={(e) => setStartStation(e.target.value)}
							className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-800"
						>
							{stations.map((station) => (
								<option key={station.code} value={station.code}>
									{station.name} ({station.code})
								</option>
							))}
						</select>
					</div>
					<div>
						<label className="block text-xs font-semibold text-slate-700 mb-2">End Station</label>
						<select
							value={endStation}
							onChange={(e) => setEndStation(e.target.value)}
							className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-800"
						>
							{stations.map((station) => (
								<option key={station.code} value={station.code}>
									{station.name} ({station.code})
								</option>
							))}
						</select>
					</div>
				</div>

				{/* Duration and Start Time */}
				<div className="grid grid-cols-2 gap-3">
					<div>
						<label className="block text-xs font-semibold text-slate-700 mb-2">
							Duration (min)
						</label>
						<input
							type="number"
							min="5"
							max="120"
							value={duration}
							onChange={(e) => setDuration(parseInt(e.target.value) || 30)}
							className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-800"
						/>
					</div>
					<div>
						<label className="block text-xs font-semibold text-slate-700 mb-2">
							Start @ (min)
						</label>
						<input
							type="number"
							min="0"
							max="300"
							value={startDelay}
							onChange={(e) => setStartDelay(parseInt(e.target.value) || 20)}
							className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-800"
						/>
					</div>
				</div>

				{/* Description (Optional) */}
				<div>
					<label className="block text-xs font-semibold text-slate-700 mb-2">
						Description (Optional)
					</label>
					<input
						type="text"
						value={description}
						onChange={(e) => setDescription(e.target.value)}
						placeholder={`${selectedTypeInfo?.label} at ${startStation} → ${endStation}`}
						className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-800"
					/>
				</div>

				{/* Preview */}
				{selectedTypeInfo && (
					<div className={`rounded-xl border px-3 py-2 text-sm ${selectedTypeInfo.color}`}>
						<div className="font-semibold">{selectedTypeInfo.label}</div>
						<div className="text-xs">
							{startStation} → {endStation} • {duration} min • starts @ {startDelay} min
						</div>
					</div>
				)}

				{/* Action Buttons */}
				<div className="flex gap-2">
					<button
						onClick={handleApply}
						className="flex-1 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
					>
						Apply Disruption
					</button>
					{onClearDisruptions && (
						<button
							onClick={onClearDisruptions}
							className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50"
						>
							Clear All
						</button>
					)}
				</div>
			</div>
		</div>
	);
}

