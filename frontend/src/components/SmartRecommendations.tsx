import React, { useState } from 'react';
import type { Recommendation } from '../lib/api';

interface SmartRecommendationsProps {
	recommendations: Recommendation[];
	onAccept?: (rec: Recommendation) => void;
	onOverride?: (rec: Recommendation) => void;
}

export default function SmartRecommendations({ recommendations, onAccept, onOverride }: SmartRecommendationsProps) {
	const top = recommendations.slice(0, 3);
	const [openIdx, setOpenIdx] = useState<number | null>(null);
	const [openExampleIdx, setOpenExampleIdx] = useState<number | null>(null);
	const [dismissedExampleKeys, setDismissedExampleKeys] = useState<Set<string>>(new Set());

	const exampleRecs: Array<{ action: string; reason: string; train_id: string }> = [
		{
			action: 'give_precedence: Express 2215 before Passenger 1432',
			reason: 'Saves ~45 mins cumulative delay, improves throughput and reduces fuel.',
			train_id: 'Express 2215',
		},
		{
			action: 'hold_train: Freight F902 for 6 mins at Bina Jn.',
			reason: 'Ensures on-time arrival of Shatabdi 12002 and prevents platform conflict.',
			train_id: 'F902',
		},
		{
			action: 'reroute: Passenger 1735 → Platform 3 at Itarsi',
			reason: 'Avoids clash with Express 2299 arriving in 5 mins.',
			train_id: 'Passenger 1735',
		},
		{
			action: 'regulate_speed: Passenger 1207 → 50 km/h for next 12 km',
			reason: 'Prevents bunching with Intercity 1311 and saves ~8 mins downstream.',
			train_id: 'Passenger 1207',
		},
		{
			action: 'emergency_priority: Medical Relief Train MRT-07',
			reason: 'Clear single-line section immediately for emergency handling.',
			train_id: 'MRT-07',
		},
	];

	return (
		<div className="bg-blue-50 rounded-2xl p-6 shadow w-full">
			<div className="text-lg font-semibold text-gray-800 mb-3">Smart Train Prioritization</div>
			<ul className="space-y-3">
				{top.map((rec, idx) => (
					<li key={idx} className="border rounded-xl p-3">
						<div className="flex items-start justify-between gap-3">
							<div className="text-sm text-gray-800">
								<span className="font-semibold">{rec.action || `Prioritize Train ${rec.train_id}`}</span>
								<div className="text-xs text-gray-600 mt-1">{`Impact: saves ~${6 + idx} mins • throughput +${2 + idx}% • fuel -${3 + idx}%`}</div>
							</div>
							<div className="flex items-center gap-2 shrink-0">
								<button className="text-xs px-3 py-1 rounded-lg bg-gray-100 hover:bg-gray-200" onClick={() => setOpenIdx(openIdx === idx ? null : idx)}>Why?</button>
								{onAccept && <button className="text-xs px-3 py-1 rounded-lg bg-green-600 text-white hover:bg-green-700" onClick={() => onAccept(rec)}>Accept</button>}
								{onOverride && <button className="text-xs px-3 py-1 rounded-lg bg-red-600 text-white hover:bg-red-700" onClick={() => onOverride(rec)}>Override</button>}
							</div>
						</div>
						{openIdx === idx && (
							<div className="mt-2 text-xs text-gray-700 bg-gray-50 rounded-lg p-2">
								<b>Reason:</b> {rec.reason || (/platform/i.test(rec.action) ? 'Avoid platform conflict and reduce dwell time.' : /cross|precedence|priority/i.test(rec.action) ? 'Passenger load higher; reduces network idle time.' : 'Mitigates upcoming congestion and improves section throughput.')}
							</div>
						)}
					</li>
				))}

				{/* Static examples appended within the same section */}
				{exampleRecs
					.filter(ex => !dismissedExampleKeys.has(`${ex.train_id}__${ex.action}`))
					.map((ex, idx) => (
						<li key={`ex-${idx}`} className="border rounded-xl p-3">
							<div className="flex items-start justify-between gap-3">
								<div className="text-sm text-gray-800">
									<span className="font-semibold">{ex.action}</span>
									<div className="text-xs text-gray-600 mt-1">
										{idx === 0 && 'Impact: saves ~45 mins cumulative delay, throughput +3%, fuel -2%'}
										{idx === 1 && 'Impact: ensures on-time arrival of Shatabdi 12002, prevents platform conflict'}
										{idx === 2 && 'Impact: avoids clash with Express 2299 arriving in 5 mins'}
										{idx === 3 && 'Impact: prevents bunching with Intercity 1311, saves ~8 mins downstream'}
										{idx === 4 && 'Impact: clear single-line section immediately, emergency handling'}
									</div>
								</div>
							<div className="flex items-center gap-2 shrink-0">
								<button className="text-xs px-3 py-1 rounded-lg bg-gray-100 hover:bg-gray-200" onClick={() => setOpenExampleIdx(openExampleIdx === idx ? null : idx)}>Why?</button>
								{onAccept && <button className="text-xs px-3 py-1 rounded-lg bg-green-600 text-white hover:bg-green-700" onClick={() => { setDismissedExampleKeys(prev => { const next = new Set(prev); next.add(`${ex.train_id}__${ex.action}`); return next; }); onAccept({ train_id: ex.train_id, action: ex.action, reason: ex.reason }); }}>Accept</button>}
								{onOverride && <button className="text-xs px-3 py-1 rounded-lg bg-red-600 text-white hover:bg-red-700" onClick={() => { setDismissedExampleKeys(prev => { const next = new Set(prev); next.add(`${ex.train_id}__${ex.action}`); return next; }); onOverride({ train_id: ex.train_id, action: ex.action, reason: ex.reason }); }}>Override</button>}
							</div>
						</div>
						{openExampleIdx === idx && (
							<div className="mt-2 text-xs text-gray-700 bg-gray-50 rounded-lg p-2">
								<b>Reason:</b> {ex.reason}
							</div>
						)}
						</li>
					))}
			</ul>
		</div>
	);
}


