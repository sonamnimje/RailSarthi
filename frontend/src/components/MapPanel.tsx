import React, { useEffect, useState } from 'react';

type Position = { train_id: string; location_km: number; speed_kmph: number };

// Mock train schedule data for demonstration
const trainsData = [
	{
		id: "T001",
		name: "Express Train",
		departure: new Date(Date.now() - 10 * 60 * 1000), // 10 minutes ago
		arrival: new Date(Date.now() + 20 * 60 * 1000), // 20 minutes from now
		status: "On Time"
	},
	{
		id: "T002", 
		name: "Local Train",
		departure: new Date(Date.now() - 5 * 60 * 1000), // 5 minutes ago
		arrival: new Date(Date.now() + 15 * 60 * 1000), // 15 minutes from now
		status: "Delayed"
	},
	{
		id: "T003",
		name: "Freight Train", 
		departure: new Date(Date.now() - 15 * 60 * 1000), // 15 minutes ago
		arrival: new Date(Date.now() + 10 * 60 * 1000), // 10 minutes from now
		status: "On Time"
	}
];

export default function MapPanel({ positions }: { positions: Position[] }) {
	const [progress, setProgress] = useState<Record<string, number>>({})

	useEffect(() => {
		const updateProgress = () => {
			const newProgress: Record<string, number> = {}
			trainsData.forEach(train => {
				const now = new Date()
				const dep = new Date(train.departure)
				const arr = new Date(train.arrival)
				let pct = ((now.getTime() - dep.getTime()) / (arr.getTime() - dep.getTime())) * 100
				if (pct < 0) pct = 0
				if (pct > 100) pct = 100
				newProgress[train.id] = pct
			})
			setProgress(newProgress)
		}

		updateProgress()
		const interval = setInterval(updateProgress, 1000) // update every 1 second
		return () => clearInterval(interval)
	}, [])

	const renderPositions = trainsData.map(train => ({
		train_id: train.id,
		location_pct: progress[train.id] || 0,
		name: train.name,
		status: train.status
	}))

	const getTrainIcon = (id: string) => {
		if (/freight/i.test(id)) return '🚄';
		if (/local/i.test(id)) return '🚆';
		return '🚆';
	};
	const getTrainColor = (id: string) => {
		if (/freight/i.test(id)) return 'bg-purple-500';
		if (/local/i.test(id)) return 'bg-green-500';
		return 'bg-blue-500';
	};
	return (
		<div className="bg-gradient-to-br from-slate-50 to-white rounded-3xl p-8 shadow-xl border border-slate-200 flex-1 min-w-[500px]">
			{/* Header Module */}
			<div className="flex items-center justify-between mb-6">
				<div className="flex items-center gap-3">
					<div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-purple-600 rounded-2xl flex items-center justify-center shadow-lg">
						<span className="text-2xl">🚆</span>
					</div>
					<div>
						<h2 className="text-2xl font-bold text-slate-800">Live Train Map</h2>
						<p className="text-sm text-slate-500">Real-time Digital Twin</p>
					</div>
				</div>
				<div className="flex items-center gap-2 bg-green-100 text-green-700 px-3 py-1.5 rounded-full text-sm font-medium">
					<div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
					Live
				</div>
			</div>

			{/* Track Module */}
			<div className="relative bg-gradient-to-r from-slate-100 to-slate-200 rounded-2xl p-6 mb-6 border border-slate-300">
				{/* Track Line */}
				<div className="relative h-2 bg-gradient-to-r from-slate-400 via-slate-500 to-slate-400 rounded-full shadow-inner">
					{/* Track Ties */}
					<div className="absolute inset-0 flex justify-between items-center">
						{Array.from({length: 20}, (_, i) => (
							<div key={i} className="w-1 h-2 bg-slate-600 rounded-sm" style={{left: `${i * 5}%`}}></div>
						))}
					</div>
				</div>

				{/* Station Markers */}
				<div className="absolute left-6 top-1/2 -translate-y-1/2 flex flex-col items-center z-10">
					<div className="w-8 h-8 bg-gradient-to-br from-blue-600 to-blue-700 rounded-full flex items-center justify-center shadow-lg border-4 border-white">
						<span className="text-white text-sm font-bold">A</span>
					</div>
					<span className="text-xs font-semibold text-slate-700 mt-2 bg-blue-50 px-2 py-1 rounded-full shadow">Station A</span>
				</div>
				<div className="absolute right-6 top-1/2 -translate-y-1/2 flex flex-col items-center z-10">
					<div className="w-8 h-8 bg-gradient-to-br from-blue-600 to-blue-700 rounded-full flex items-center justify-center shadow-lg border-4 border-white">
						<span className="text-white text-sm font-bold">B</span>
					</div>
					<span className="text-xs font-semibold text-slate-700 mt-2 bg-blue-50 px-2 py-1 rounded-full shadow">Station B</span>
				</div>

				{/* Moving Trains */}
				{renderPositions.map((pos, index) => {
					// Calculate vertical offset to prevent overlapping
					const verticalOffset = index * 80; // 80px spacing between cards
					const isEven = index % 2 === 0;
					const cardPosition = isEven ? 'top-12' : 'bottom-12';
					
					return (
						<div
							key={pos.train_id}
							className="absolute flex flex-col items-center transition-all duration-1000 ease-linear z-20"
							style={{ 
								left: `calc(${6 + (pos.location_pct ?? 0) * 0.88}% - 20px)`, 
								top: '50%', 
								transform: 'translateY(-50%)' 
							}}
						>
							<div className={`w-10 h-10 rounded-2xl ${getTrainColor(pos.train_id)} flex items-center justify-center text-white text-xl border-4 border-white shadow-xl hover:scale-110 transition-transform duration-200`}>
								{getTrainIcon(pos.train_id)}
							</div>
							{/* Train Info Card */}
							<div className={`absolute ${cardPosition} bg-blue-50 rounded-xl shadow-lg border border-slate-200 p-3 min-w-[140px] text-center z-30`}>
								<div className="text-xs font-bold text-slate-800 mb-1">{pos.name}</div>
								<div className="text-xs text-slate-600 mb-1">{pos.train_id}</div>
								<div className={`text-xs font-medium px-2 py-1 rounded-full ${
									pos.status === 'On Time' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
								}`}>
									{pos.status}
								</div>
								<div className="text-xs text-slate-500 mt-1">
									{Math.round(pos.location_pct)}% Complete
								</div>
							</div>
						</div>
					);
				})}
			</div>

			{/* Stats Module */}
			<div className="grid grid-cols-3 gap-4">
				<div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-xl p-6 border border-blue-200 text-center">
					<div className="text-3xl font-bold text-blue-700 mb-1">{renderPositions.length}</div>
					<div className="text-sm font-medium text-blue-600">Active Trains</div>
				</div>
				<div className="bg-gradient-to-br from-green-50 to-green-100 rounded-xl p-6 border border-green-200 text-center">
					<div className="text-3xl font-bold text-green-700 mb-1">
						{renderPositions.filter(p => p.status === 'On Time').length}
					</div>
					<div className="text-sm font-medium text-green-600">On Time</div>
				</div>
				<div className="bg-gradient-to-br from-orange-50 to-orange-100 rounded-xl p-6 border border-orange-200 text-center">
					<div className="text-3xl font-bold text-orange-700 mb-1">
						{Math.round(renderPositions.reduce((acc, p) => acc + p.location_pct, 0) / renderPositions.length) || 0}%
					</div>
					<div className="text-sm font-medium text-orange-600">Avg Progress</div>
				</div>
			</div>
		</div>
	);
}