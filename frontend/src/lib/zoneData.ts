const ZONE_LIST = [
	'Central Railway',
	'Eastern Railway',
	'East Central Railway',
	'East Coast Railway',
	'Northern Railway',
	'North Central Railway',
	'North Eastern Railway',
	'North Frontier Railway',
	'North Western Railway',
	'Southern Railway',
	'South Central Railway',
	'South Eastern Railway',
	'South East Central Railway',
	'South Western Railway',
	'Western Railway',
	'West Central Railway',
] as const

export type ZoneDisplayName = (typeof ZONE_LIST)[number]

export const INDIAN_RAILWAY_ZONES: readonly ZoneDisplayName[] = ZONE_LIST

export const ZONE_TO_DIVISIONS: Record<ZoneDisplayName, readonly string[]> = {
	'Central Railway': ['Mumbai', 'Nagpur', 'Bhusawal', 'Pune', 'Sholapur'],
	'Eastern Railway': ['Howrah-I', 'Howrah-II', 'Sealdah', 'Malda', 'Asansol', 'Chitaranjan', 'Kolkata Metro'],
	'East Central Railway': ['Danapur', 'Mugalsarai', 'Dhanbad', 'Sonpur', 'Samastipur'],
	'East Coast Railway': ['Khurda Road', 'Waltair', 'Sambhalpur'],
	'Northern Railway': ['Delhi-I', 'Delhi-II', 'Ambala', 'Moradabad', 'Lucknow', 'Firozpur'],
	'North Central Railway': ['Allahabad', 'Jhansi', 'Agra'],
	'North Eastern Railway': ['Izzatnagar', 'Lucknow', 'Varanasi', 'DUW'],
	'North Frontier Railway': ['Katihar', 'Alipurduar', 'Rangiya', 'Lumding', 'Tinsukhia'],
	'North Western Railway': ['Jaipur', 'Jodhpur', 'Bikaner', 'Ajmer'],
	'Southern Railway': ['Chennai', 'Madurai', 'Palghat', 'Trichy', 'Trivendrum'],
	'South Central Railway': ['Secunderabad', 'Hyderabad', 'Guntakal', 'Vijayawada', 'Nanded'],
	'South Eastern Railway': ['Kharagpur', 'Adra', 'Chakradharpur', 'Ranchi', 'Shalimar'],
	'South East Central Railway': ['Bilaspur', 'Nagpur', 'Raipur'],
	'South Western Railway': ['Bangalore', 'Mysore', 'Hubli', 'RWF/YNK'],
	'Western Railway': ['BCT', 'Vadodara', 'Ahmedabad', 'Ratlam', 'Rajkot', 'Bhavnagar'],
	'West Central Railway': ['Jabalpur', 'Bhopal', 'Kota'],
}

const DISPLAY_TO_BACKEND_ZONE: Record<ZoneDisplayName, string> = {
	'Central Railway': 'CR Zone',
	'Eastern Railway': 'SR Zone',
	'East Central Railway': 'SECR Zone',
	'East Coast Railway': 'SECR Zone',
	'Northern Railway': 'NR Zone',
	'North Central Railway': 'NR Zone',
	'North Eastern Railway': 'NR Zone',
	'North Frontier Railway': 'NR Zone',
	'North Western Railway': 'NR Zone',
	'Southern Railway': 'SR Zone',
	'South Central Railway': 'SR Zone',
	'South Eastern Railway': 'SECR Zone',
	'South East Central Railway': 'SECR Zone',
	'South Western Railway': 'SR Zone',
	'Western Railway': 'WR Zone',
	'West Central Railway': 'WR Zone',
}

const BACKEND_TO_DISPLAY_ZONE: Record<string, ZoneDisplayName> = Object.entries(DISPLAY_TO_BACKEND_ZONE).reduce(
	(acc, [display, backend]) => {
		acc[backend] = display as ZoneDisplayName
		return acc
	},
	{} as Record<string, ZoneDisplayName>
)

const ZONE_DEFAULT_STATIONS: Record<ZoneDisplayName, string> = {
	'Central Railway': 'CSMT',
	'Eastern Railway': 'HWH',
	'East Central Railway': 'DNR',
	'East Coast Railway': 'KUR',
	'Northern Railway': 'NDLS',
	'North Central Railway': 'PRYJ',
	'North Eastern Railway': 'LKO',
	'North Frontier Railway': 'GHY',
	'North Western Railway': 'JP',
	'Southern Railway': 'MAS',
	'South Central Railway': 'SC',
	'South Eastern Railway': 'KGP',
	'South East Central Railway': 'BSP',
	'South Western Railway': 'SBC',
	'Western Railway': 'BCT',
	'West Central Railway': 'JBP',
}

const makeDivisionKey = (zone: ZoneDisplayName, division: string) => `${division} (${zone})`

export type DivisionMeta = {
	key: string
	zone: ZoneDisplayName
	division: string
	stationCode?: string
	sections?: string[]
}

const DIVISION_STATION_CODES: Record<string, string> = {
	[makeDivisionKey('Central Railway', 'Mumbai')]: 'CSMT',
	[makeDivisionKey('Central Railway', 'Nagpur')]: 'NGP',
	[makeDivisionKey('Central Railway', 'Bhusawal')]: 'BSL',
	[makeDivisionKey('Central Railway', 'Pune')]: 'PUNE',
	[makeDivisionKey('Central Railway', 'Sholapur')]: 'SUR',
	[makeDivisionKey('Eastern Railway', 'Howrah-I')]: 'HWH',
	[makeDivisionKey('Eastern Railway', 'Howrah-II')]: 'HWH',
	[makeDivisionKey('Eastern Railway', 'Sealdah')]: 'SDAH',
	[makeDivisionKey('Eastern Railway', 'Malda')]: 'MLDT',
	[makeDivisionKey('Eastern Railway', 'Asansol')]: 'ASN',
	[makeDivisionKey('Eastern Railway', 'Chitaranjan')]: 'CRJ',
	[makeDivisionKey('Eastern Railway', 'Kolkata Metro')]: 'KMA',
	[makeDivisionKey('East Central Railway', 'Danapur')]: 'DNR',
	[makeDivisionKey('East Central Railway', 'Mugalsarai')]: 'MGS',
	[makeDivisionKey('East Central Railway', 'Dhanbad')]: 'DHN',
	[makeDivisionKey('East Central Railway', 'Sonpur')]: 'SEE',
	[makeDivisionKey('East Central Railway', 'Samastipur')]: 'SPJ',
	[makeDivisionKey('East Coast Railway', 'Khurda Road')]: 'KUR',
	[makeDivisionKey('East Coast Railway', 'Waltair')]: 'VSKP',
	[makeDivisionKey('East Coast Railway', 'Sambhalpur')]: 'SBP',
	[makeDivisionKey('Northern Railway', 'Delhi-I')]: 'NDLS',
	[makeDivisionKey('Northern Railway', 'Delhi-II')]: 'DEC',
	[makeDivisionKey('Northern Railway', 'Ambala')]: 'UMB',
	[makeDivisionKey('Northern Railway', 'Moradabad')]: 'MB',
	[makeDivisionKey('Northern Railway', 'Lucknow')]: 'LKO',
	[makeDivisionKey('Northern Railway', 'Firozpur')]: 'FZR',
	[makeDivisionKey('North Central Railway', 'Allahabad')]: 'PRYJ',
	[makeDivisionKey('North Central Railway', 'Jhansi')]: 'JHS',
	[makeDivisionKey('North Central Railway', 'Agra')]: 'AGC',
	[makeDivisionKey('North Eastern Railway', 'Izzatnagar')]: 'IZN',
	[makeDivisionKey('North Eastern Railway', 'Lucknow')]: 'LJN',
	[makeDivisionKey('North Eastern Railway', 'Varanasi')]: 'BSB',
	[makeDivisionKey('North Eastern Railway', 'DUW')]: 'GKP',
	[makeDivisionKey('North Frontier Railway', 'Katihar')]: 'KIR',
	[makeDivisionKey('North Frontier Railway', 'Alipurduar')]: 'APDJ',
	[makeDivisionKey('North Frontier Railway', 'Rangiya')]: 'RNY',
	[makeDivisionKey('North Frontier Railway', 'Lumding')]: 'LMG',
	[makeDivisionKey('North Frontier Railway', 'Tinsukhia')]: 'TSK',
	[makeDivisionKey('North Western Railway', 'Jaipur')]: 'JP',
	[makeDivisionKey('North Western Railway', 'Jodhpur')]: 'JU',
	[makeDivisionKey('North Western Railway', 'Bikaner')]: 'BKN',
	[makeDivisionKey('North Western Railway', 'Ajmer')]: 'AII',
	[makeDivisionKey('Southern Railway', 'Chennai')]: 'MAS',
	[makeDivisionKey('Southern Railway', 'Madurai')]: 'MDU',
	[makeDivisionKey('Southern Railway', 'Palghat')]: 'PGT',
	[makeDivisionKey('Southern Railway', 'Trichy')]: 'TPJ',
	[makeDivisionKey('Southern Railway', 'Trivendrum')]: 'TVC',
	[makeDivisionKey('South Central Railway', 'Secunderabad')]: 'SC',
	[makeDivisionKey('South Central Railway', 'Hyderabad')]: 'HYB',
	[makeDivisionKey('South Central Railway', 'Guntakal')]: 'GTL',
	[makeDivisionKey('South Central Railway', 'Vijayawada')]: 'BZA',
	[makeDivisionKey('South Central Railway', 'Nanded')]: 'NED',
	[makeDivisionKey('South Eastern Railway', 'Kharagpur')]: 'KGP',
	[makeDivisionKey('South Eastern Railway', 'Adra')]: 'ADRA',
	[makeDivisionKey('South Eastern Railway', 'Chakradharpur')]: 'CKP',
	[makeDivisionKey('South Eastern Railway', 'Ranchi')]: 'RNC',
	[makeDivisionKey('South Eastern Railway', 'Shalimar')]: 'SHM',
	[makeDivisionKey('South East Central Railway', 'Bilaspur')]: 'BSP',
	[makeDivisionKey('South East Central Railway', 'Nagpur')]: 'NGP',
	[makeDivisionKey('South East Central Railway', 'Raipur')]: 'R',
	[makeDivisionKey('South Western Railway', 'Bangalore')]: 'SBC',
	[makeDivisionKey('South Western Railway', 'Mysore')]: 'MYS',
	[makeDivisionKey('South Western Railway', 'Hubli')]: 'UBL',
	[makeDivisionKey('South Western Railway', 'RWF/YNK')]: 'YNK',
	[makeDivisionKey('Western Railway', 'BCT')]: 'BCT',
	[makeDivisionKey('Western Railway', 'Vadodara')]: 'BRC',
	[makeDivisionKey('Western Railway', 'Ahmedabad')]: 'ADI',
	[makeDivisionKey('Western Railway', 'Ratlam')]: 'RTM',
	[makeDivisionKey('Western Railway', 'Rajkot')]: 'RJT',
	[makeDivisionKey('Western Railway', 'Bhavnagar')]: 'BVC',
	[makeDivisionKey('West Central Railway', 'Jabalpur')]: 'JBP',
	[makeDivisionKey('West Central Railway', 'Bhopal')]: 'BPL',
	[makeDivisionKey('West Central Railway', 'Kota')]: 'KOTA',
}

const DIVISION_SECTION_CODES: Record<string, string[]> = {
	[makeDivisionKey('Central Railway', 'Mumbai')]: ['KALYAN-KASARA', 'THANE-DADAR', 'SEC1'],
	[makeDivisionKey('Western Railway', 'BCT')]: ['WR-001', 'SEC2'],
	[makeDivisionKey('South East Central Railway', 'Bilaspur')]: ['SECR-001', 'SEC3'],
	[makeDivisionKey('Northern Railway', 'Delhi-I')]: ['SEC4'],
}

const divisionMetaMap: Record<string, DivisionMeta> = {}
INDIAN_RAILWAY_ZONES.forEach((zone) => {
	;(ZONE_TO_DIVISIONS[zone] || []).forEach((division) => {
		const key = makeDivisionKey(zone, division)
		divisionMetaMap[key] = {
			key,
			zone,
			division,
			stationCode: DIVISION_STATION_CODES[key] ?? ZONE_DEFAULT_STATIONS[zone],
			sections: DIVISION_SECTION_CODES[key] ?? [],
		}
	})
})

const SECTION_TO_DIVISION: Record<string, string> = {}
Object.entries(DIVISION_SECTION_CODES).forEach(([divisionKey, sections]) => {
	sections.forEach((sectionId) => {
		SECTION_TO_DIVISION[sectionId.toUpperCase()] = divisionKey
	})
})

export function getBackendZoneName(zone: ZoneDisplayName | null | undefined) {
	if (!zone) return null
	return DISPLAY_TO_BACKEND_ZONE[zone] ?? zone
}

export function getDisplayZoneName(backendZone?: string | null) {
	if (!backendZone) return null
	return BACKEND_TO_DISPLAY_ZONE[backendZone] ?? (backendZone as ZoneDisplayName)
}

export function listDivisions(zone: ZoneDisplayName | null | undefined) {
	if (!zone) return []
	return ZONE_TO_DIVISIONS[zone] ?? []
}

export function listDivisionKeys(zone: ZoneDisplayName | null | undefined) {
	if (!zone) return []
	return listDivisions(zone).map((division) => makeDivisionKey(zone, division))
}

export function getDefaultDivisionKey(zone: ZoneDisplayName | null | undefined) {
	const divisions = listDivisionKeys(zone ?? null)
	return divisions.length > 0 ? divisions[0] : null
}

export function parseDivisionKey(key: string | null | undefined) {
	if (!key) return null
	const match = key.match(/^(.*)\s\((.*)\)$/)
	if (!match) return null
	const [, division, zone] = match
	if (!INDIAN_RAILWAY_ZONES.includes(zone as ZoneDisplayName)) {
		return null
	}
	return { division, zone: zone as ZoneDisplayName }
}

export function getDivisionMeta(key: string | null | undefined) {
	if (!key) return undefined
	return divisionMetaMap[key]
}

export function getStationCodeForSelection(zone: ZoneDisplayName | null | undefined, divisionKey: string | null | undefined) {
	const meta = getDivisionMeta(divisionKey ?? null)
	if (meta?.stationCode) return meta.stationCode
	if (zone && ZONE_DEFAULT_STATIONS[zone]) return ZONE_DEFAULT_STATIONS[zone]
	return undefined
}

export function getDivisionKeyForSection(sectionId: string | null | undefined) {
	if (!sectionId) return null
	return SECTION_TO_DIVISION[sectionId.toUpperCase()] ?? null
}

const simpleHash = (value: string) => {
	let hash = 0
	for (let i = 0; i < value.length; i++) {
		hash = (hash << 5) - hash + value.charCodeAt(i)
		hash |= 0
	}
	return hash
}

export function guessZoneBySeed(seed: string | null | undefined): ZoneDisplayName {
	if (!seed) return INDIAN_RAILWAY_ZONES[0]
	const idx = Math.abs(simpleHash(seed)) % INDIAN_RAILWAY_ZONES.length
	return INDIAN_RAILWAY_ZONES[idx]
}

export function guessDivisionKeyBySeed(seed: string | null | undefined) {
	const zone = guessZoneBySeed(seed)
	const divisions = listDivisionKeys(zone)
	if (divisions.length === 0) return null
	const idx = Math.abs(simpleHash(`${seed ?? ''}-division`)) % divisions.length
	return divisions[idx]
}

export function doesRecordMatchScope(params: {
	scopeZone: ZoneDisplayName | null
	scopeDivisionKey?: string | null
	recordZone?: string | null
	recordDivision?: string | null
}) {
	const { scopeZone, scopeDivisionKey, recordZone, recordDivision } = params
	if (!scopeZone) return true

	const backendScope = getBackendZoneName(scopeZone)
	const recordZoneDisplay = getDisplayZoneName(recordZone)
	const zoneMatches =
		!recordZone ||
		recordZone === backendScope ||
		(recordZoneDisplay ? recordZoneDisplay === scopeZone : false)

	if (!zoneMatches) return false
	if (!scopeDivisionKey) return true
	const divisionMeta = getDivisionMeta(scopeDivisionKey)
	if (!divisionMeta) return true
	if (!recordDivision) return true
	return recordDivision === divisionMeta.division || recordDivision === divisionMeta.key
}

export { makeDivisionKey }

