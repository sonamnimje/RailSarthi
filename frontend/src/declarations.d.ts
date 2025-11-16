/// <reference types="@react-three/fiber" />
// This project currently does not use three.js or react-three*
// Remove ambient module declarations to avoid pulling peer deps

// Type declarations for leaflet images
declare module 'leaflet/dist/images/marker-icon.png' {
	const value: string;
	export default value;
}

declare module 'leaflet/dist/images/marker-shadow.png' {
	const value: string;
	export default value;
}

export {};
