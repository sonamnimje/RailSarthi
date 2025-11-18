import React, { useMemo, useState, useEffect } from 'react';
import * as d3 from 'd3';
import { Clock, AlertTriangle, CheckCircle2 } from 'lucide-react';

interface TrainSchedule {
	trainNo: string;
	trainName: string;
	route: string[];
	arrivals: { station: string; time: Date; delay?: number }[];
	departures: { station: string; time: Date; delay?: number }[];
}

interface MasterGanttChartProps {
	trains: TrainSchedule[];
	simulationTime?: Date;
	height?: number;
}

export default function MasterGanttChart({ trains, simulationTime, height = 600 }: MasterGanttChartProps) {
	const svgRef = React.useRef<SVGSVGElement>(null);
	const [selectedTrain, setSelectedTrain] = useState<string | null>(null);

	// Calculate time range (24 hours from now)
	const timeRange = useMemo(() => {
		const now = simulationTime || new Date();
		const start = new Date(now);
		start.setHours(0, 0, 0, 0);
		const end = new Date(start);
		end.setHours(24, 0, 0, 0);
		return { start, end, duration: end.getTime() - start.getTime() };
	}, [simulationTime]);

	// Get all unique stations for Y-axis
	const stations = useMemo(() => {
		const stationSet = new Set<string>();
		trains.forEach(train => {
			train.route.forEach(station => stationSet.add(station));
		});
		return Array.from(stationSet).sort();
	}, [trains]);

	// Render chart
	React.useEffect(() => {
		if (!svgRef.current || trains.length === 0) return;

		const svg = d3.select(svgRef.current);
		svg.selectAll('*').remove();

		const margin = { top: 40, right: 20, bottom: 60, left: 150 };
		const width = svgRef.current.clientWidth - margin.left - margin.right;
		const chartHeight = height - margin.top - margin.bottom;

		const g = svg.append('g')
			.attr('transform', `translate(${margin.left},${margin.top})`);

		// X-axis: Time scale
		const xScale = d3.scaleTime()
			.domain([timeRange.start, timeRange.end])
			.range([0, width]);

		// Y-axis: Station scale
		const yScale = d3.scaleBand()
			.domain(stations)
			.range([0, chartHeight])
			.padding(0.1);

		// Draw X-axis
		const xAxis = d3.axisBottom(xScale)
			.tickFormat(d3.timeFormat('%H:%M'))
			.ticks(24);
		
		g.append('g')
			.attr('class', 'x-axis')
			.attr('transform', `translate(0,${chartHeight})`)
			.call(xAxis)
			.selectAll('text')
			.style('text-anchor', 'end')
			.attr('dx', '-.8em')
			.attr('dy', '.15em')
			.attr('transform', 'rotate(-45)');

		// X-axis label
		g.append('text')
			.attr('class', 'axis-label')
			.attr('transform', `translate(${width / 2}, ${chartHeight + 50})`)
			.style('text-anchor', 'middle')
			.style('font-size', '12px')
			.style('fill', '#374151')
			.text('Time (24 hours)');

		// Draw Y-axis
		const yAxis = d3.axisLeft(yScale);
		g.append('g')
			.attr('class', 'y-axis')
			.call(yAxis)
			.selectAll('text')
			.style('font-size', '11px')
			.style('fill', '#374151');

		// Y-axis label
		g.append('text')
			.attr('class', 'axis-label')
			.attr('transform', 'rotate(-90)')
			.attr('y', -margin.left + 20)
			.attr('x', -chartHeight / 2)
			.style('text-anchor', 'middle')
			.style('font-size', '12px')
			.style('fill', '#374151')
			.text('Stations');

		// Draw train lines
		trains.forEach((train, trainIdx) => {
			const isSelected = selectedTrain === train.trainNo;
			const color = isSelected ? '#3b82f6' : `hsl(${(trainIdx * 137.5) % 360}, 70%, 50%)`;

			// Draw line segments between stations
			for (let i = 0; i < train.route.length - 1; i++) {
				const fromStation = train.route[i];
				const toStation = train.route[i + 1];
				const departure = train.departures.find(d => d.station === fromStation);
				const arrival = train.arrivals.find(a => a.station === toStation);

				if (departure && arrival) {
					const x1 = xScale(departure.time);
					const x2 = xScale(arrival.time);
					const y1 = (yScale(fromStation) || 0) + yScale.bandwidth() / 2;
					const y2 = (yScale(toStation) || 0) + yScale.bandwidth() / 2;

					// Draw line
					g.append('line')
						.attr('x1', x1)
						.attr('y1', y1)
						.attr('x2', x2)
						.attr('y2', y2)
						.attr('stroke', color)
						.attr('stroke-width', isSelected ? 3 : 2)
						.attr('opacity', isSelected ? 1 : 0.7)
						.style('cursor', 'pointer')
						.on('click', () => setSelectedTrain(train.trainNo))
						.on('mouseover', function() {
							d3.select(this).attr('stroke-width', 3);
						})
						.on('mouseout', function() {
							if (!isSelected) {
								d3.select(this).attr('stroke-width', 2);
							}
						});

					// Draw departure marker
					if (departure.delay && departure.delay > 0) {
						g.append('circle')
							.attr('cx', x1)
							.attr('cy', y1)
							.attr('r', 5)
							.attr('fill', '#ef4444')
							.attr('stroke', '#ffffff')
							.attr('stroke-width', 2);
					} else {
						g.append('circle')
							.attr('cx', x1)
							.attr('cy', y1)
							.attr('r', 4)
							.attr('fill', color)
							.attr('stroke', '#ffffff')
							.attr('stroke-width', 2);
					}

					// Draw arrival marker
					if (arrival.delay && arrival.delay > 0) {
						g.append('circle')
							.attr('cx', x2)
							.attr('cy', y2)
							.attr('r', 5)
							.attr('fill', '#ef4444')
							.attr('stroke', '#ffffff')
							.attr('stroke-width', 2);
					} else {
						g.append('circle')
							.attr('cx', x2)
							.attr('cy', y2)
							.attr('r', 4)
							.attr('fill', color)
							.attr('stroke', '#ffffff')
							.attr('stroke-width', 2);
					}
				}
			}

			// Draw train label at first station
			if (train.route.length > 0) {
				const firstStation = train.route[0];
				const firstDeparture = train.departures.find(d => d.station === firstStation);
				if (firstDeparture) {
					const x = xScale(firstDeparture.time);
					const y = (yScale(firstStation) || 0) + yScale.bandwidth() / 2;

					g.append('text')
						.attr('x', x + 8)
						.attr('y', y - 8)
						.attr('font-size', '10px')
						.attr('font-weight', 'bold')
						.attr('fill', color)
						.text(train.trainNo);
				}
			}
		});

		// Draw current simulation time line
		if (simulationTime) {
			const currentX = xScale(simulationTime);
			g.append('line')
				.attr('x1', currentX)
				.attr('y1', 0)
				.attr('x2', currentX)
				.attr('y2', chartHeight)
				.attr('stroke', '#ef4444')
				.attr('stroke-width', 2)
				.attr('stroke-dasharray', '5,5')
				.attr('opacity', 0.7);
		}

	}, [trains, stations, timeRange, height, selectedTrain, simulationTime]);

	return (
		<div className="w-full bg-white rounded-xl shadow-lg border border-gray-200 p-4">
			<div className="flex items-center justify-between mb-4">
				<h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
					<BarChart3 className="w-5 h-5" />
					Master Gantt Chart
				</h3>
				<div className="flex items-center gap-4 text-xs text-gray-600">
					<div className="flex items-center gap-1">
						<CheckCircle2 className="w-3 h-3 text-green-500" />
						<span>On Time</span>
					</div>
					<div className="flex items-center gap-1">
						<AlertTriangle className="w-3 h-3 text-red-500" />
						<span>Delayed</span>
					</div>
				</div>
			</div>
			<svg ref={svgRef} width="100%" height={height} className="border border-gray-200 rounded" />
		</div>
	);
}

