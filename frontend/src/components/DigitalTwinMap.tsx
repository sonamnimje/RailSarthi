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

function Track({ children, zoom }: { children: React.ReactNode; zoom: number }) {
	// Outer container allows horizontal panning when zoomed
	return (
		<div className="relative w-full h-32 flex items-center overflow-x-auto">
			{/* inner track scales horizontally by setting width to zoom*100% */}
			<div className="relative h-full" style={{ width: `${Math.max(100, zoom * 100)}%` }}>
				<div className="absolute left-4 right-4 top-1/2 -translate-y-1/2 h-[8px] bg-gray-300 rounded-full shadow-inner" />

				{/* Stations positioned at the ends of the inner track */}
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
	const [zoom, setZoom] = useState<number>(1);

	function increaseZoom() {
		setZoom(z => Math.min(2, +(z + 0.1).toFixed(2)));
	}

	function decreaseZoom() {
		setZoom(z => Math.max(0.6, +(z - 0.1).toFixed(2)));
	}

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

			{/* Zoom controls */}
			<div className="absolute right-8 top-8 flex flex-col gap-2 z-20">
				<button
					className="bg-white p-2 rounded-md shadow border text-sm"
					onClick={increaseZoom}
					aria-label="Zoom in"
					title="Zoom in"
				>
					+
				</button>
				<button
					className="bg-white p-2 rounded-md shadow border text-sm"
					onClick={decreaseZoom}
					aria-label="Zoom out"
					title="Zoom out"
				>
					−
				</button>
			</div>

			<Track zoom={zoom}>
				{trains.map(train => (
					// Train positions are percentages of the inner track width (0-100)
					<TrainMarker key={train.id} train={train} />
				))}
			</Track>
			<div className="mt-4 text-sm text-gray-600">Zoom: {Math.round(zoom * 100)}%</div>
			<Legend />
		</div>
	);
}


