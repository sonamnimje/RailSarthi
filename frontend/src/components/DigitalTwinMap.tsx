import React, { useEffect, useState } from 'react';

type TrainItem = {
	id: string;
	type: 'Local' | 'Express' | 'Freight';
	position: number;
	color: string;
	icon: string;
};

const initialTrains: TrainItem[] = [
	{ id: 'T001', type: 'Local', position: 10, color: 'bg-green-500', icon: '🚆' },
	{ id: 'T002', type: 'Express', position: 40, color: 'bg-red-500', icon: '🚄' },
	{ id: 'T003', type: 'Freight', position: 70, color: 'bg-purple-500', icon: '🚛' },
	{ id: 'T004', type: 'Local', position: 90, color: 'bg-green-500', icon: '🚆' },
];

function Header() {
	return (
		<div className="flex items-center justify-between mb-6">
			<div className="flex items-center gap-2">
				<span className="text-2xl">🚉</span>
				<h2 className="text-2xl font-bold text-indigo-600">Digital Twin: Simulation Map</h2>
			</div>
		</div>
	);
}

function Track({ children }: { children: React.ReactNode }) {
	return (
		<div className="relative w-full h-32 flex items-center">
			<div className="absolute left-16 right-16 top-1/2 -translate-y-1/2 h-[8px] bg-gray-300 rounded-full shadow-inner" />
			{/* Stations */}
			<div className="absolute left-4 top-1/2 -translate-y-1/2 flex flex-col items-center">
				<div className="w-6 h-6 rounded-full bg-blue-600 shadow" />
				<span className="text-sm mt-1 text-gray-700">Station A</span>
			</div>
			<div className="absolute right-4 top-1/2 -translate-y-1/2 flex flex-col items-center">
				<div className="w-6 h-6 rounded-full bg-blue-600 shadow" />
				<span className="text-sm mt-1 text-gray-700">Station B</span>
			</div>
			{children}
		</div>
	);
}

function TrainMarker({ train }: { train: TrainItem }) {
	return (
		<div
			className={`absolute -top-4 px-4 py-2 rounded-xl shadow-md text-white flex items-center gap-2 text-sm ${train.color}`}
			style={{ left: `${train.position}%`, transform: 'translateX(-50%)' }}
			role="img"
			aria-label={`${train.id} ${train.type}`}
		>
			<span className="text-lg">{train.icon}</span>
			<span className="font-semibold whitespace-nowrap">{train.id}-{train.type}</span>
		</div>
	);
}

function Legend() {
	const items = [
		{ label: 'Local', color: 'bg-green-500' },
		{ label: 'Express', color: 'bg-red-500' },
		{ label: 'Freight', color: 'bg-purple-500' },
		{ label: 'Impacted', color: 'bg-orange-500' },
	];

	return (
		<div className="flex flex-wrap justify-center gap-8 mt-6 text-sm">
			{items.map(i => (
				<div key={i.label} className="flex items-center gap-2">
					<span className={`w-4 h-4 ${i.color} rounded-full`} />
					<span className="text-gray-700">{i.label}</span>
				</div>
			))}
		</div>
	);
}

export default function DigitalTwinMap() {
	const [trains, setTrains] = useState<TrainItem[]>(initialTrains);

	useEffect(() => {
		const interval = setInterval(() => {
			setTrains(prev =>
				prev.map(train => ({
					...train,
					position: train.position < 95 ? train.position + 1 : 10,
				}))
			);
		}, 2000);
		return () => clearInterval(interval);
	}, []);

	return (
		<div className="bg-blue-50 rounded-2xl shadow p-8 w-full">
			<Header />
			<Track>
				{trains.map(train => (
					<TrainMarker key={train.id} train={train} />
				))}
			</Track>
			<Legend />
		</div>
	);
}


