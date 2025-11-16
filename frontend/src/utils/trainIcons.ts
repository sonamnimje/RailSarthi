import L from 'leaflet';

// Helper to create train icon with color and rotation
export function createTrainIcon(color: string, rotation: number = 0, size: number = 26): L.DivIcon {
	return L.divIcon({
		className: 'custom-train-icon',
		html: `
			<div style="
				width: ${size}px;
				height: ${size}px;
				transform: rotate(${rotation}deg);
				transform-origin: center;
				transition: transform 0.3s ease-out;
			">
				<svg width="${size}" height="${size}" viewBox="0 0 26 26" xmlns="http://www.w3.org/2000/svg">
					<!-- Train body -->
					<rect x="2" y="8" width="22" height="10" rx="2" fill="${color}" stroke="white" stroke-width="1.5"/>
					<!-- Windows -->
					<rect x="5" y="10" width="4" height="3" fill="white" opacity="0.8"/>
					<rect x="11" y="10" width="4" height="3" fill="white" opacity="0.8"/>
					<rect x="17" y="10" width="4" height="3" fill="white" opacity="0.8"/>
					<!-- Wheels -->
					<circle cx="7" cy="20" r="2" fill="#333"/>
					<circle cx="13" cy="20" r="2" fill="#333"/>
					<circle cx="19" cy="20" r="2" fill="#333"/>
					<!-- Front light -->
					<circle cx="24" cy="13" r="1.5" fill="#FFD700"/>
				</svg>
			</div>
		`,
		iconSize: [size, size],
		iconAnchor: [size / 2, size / 2],
	});
}

// Train icons by type
export const passengerTrainIcon = (rotation: number = 0) => 
	createTrainIcon('#3b82f6', rotation); // Blue

export const freightTrainIcon = (rotation: number = 0) => 
	createTrainIcon('#8b5cf6', rotation); // Purple

export const expressTrainIcon = (rotation: number = 0) => 
	createTrainIcon('#ef4444', rotation); // Red

export const localTrainIcon = (rotation: number = 0) => 
	createTrainIcon('#10b981', rotation); // Green

// Get icon based on train type and speed
export function getTrainIcon(trainType: string, speed: number, rotation: number = 0): L.DivIcon {
	// Speed-based color override
	let color = '#6b7280'; // Default grey (stopped)
	
	if (speed >= 5 && speed <= 60) {
		color = '#3b82f6'; // Blue (normal)
	} else if (speed > 60) {
		color = '#ef4444'; // Red (high speed)
	}
	
	// Type-based icon selection (if speed allows)
	if (speed < 5) {
		// Stopped - always grey
		return createTrainIcon('#6b7280', rotation);
	}
	
	// Moving - use type or speed-based color
	const typeLower = trainType?.toLowerCase() || '';
	if (typeLower.includes('express') || typeLower.includes('rajdhani') || typeLower.includes('shatabdi')) {
		return expressTrainIcon(rotation);
	} else if (typeLower.includes('freight') || typeLower.includes('goods')) {
		return freightTrainIcon(rotation);
	} else if (typeLower.includes('local') || typeLower.includes('suburban')) {
		return localTrainIcon(rotation);
	} else {
		// Default passenger train with speed-based color
		return createTrainIcon(color, rotation);
	}
}

// Calculate bearing (direction) between two coordinates
export function calculateBearing(lat1: number, lon1: number, lat2: number, lon2: number): number {
	const dLon = (lon2 - lon1) * Math.PI / 180;
	const lat1Rad = lat1 * Math.PI / 180;
	const lat2Rad = lat2 * Math.PI / 180;
	
	const y = Math.sin(dLon) * Math.cos(lat2Rad);
	const x = Math.cos(lat1Rad) * Math.sin(lat2Rad) - Math.sin(lat1Rad) * Math.cos(lat2Rad) * Math.cos(dLon);
	
	const bearing = Math.atan2(y, x) * 180 / Math.PI;
	return (bearing + 360) % 360; // Normalize to 0-360
}

