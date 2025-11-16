import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import {
	INDIAN_RAILWAY_ZONES,
	type ZoneDisplayName,
	getDivisionMeta,
	getDefaultDivisionKey,
	getStationCodeForSelection,
	listDivisionKeys,
	type DivisionMeta,
} from './zoneData'

type ZoneFilterContextValue = {
	selectedZone: ZoneDisplayName | null
	selectedDivisionKey: string | null
	setZone: (zone: ZoneDisplayName | null) => void
	setDivisionKey: (divisionKey: string | null) => void
	resetScope: () => void
	availableZones: readonly ZoneDisplayName[]
	availableDivisionKeys: readonly string[]
	divisionMeta?: DivisionMeta
	stationCode?: string
}

const ZoneFilterContext = createContext<ZoneFilterContextValue | undefined>(undefined)
const STORAGE_KEY = 'rail:zoneScope'

type StoredScope = {
	zone: ZoneDisplayName | null
	divisionKey: string | null
}

export function ZoneFilterProvider({ children }: { children: React.ReactNode }) {
	const [selectedZone, setSelectedZone] = useState<ZoneDisplayName | null>(null)
	const [selectedDivisionKey, setSelectedDivisionKey] = useState<string | null>(null)

	useEffect(() => {
		try {
			const raw = window.localStorage.getItem(STORAGE_KEY)
			if (!raw) return
			const parsed = JSON.parse(raw) as StoredScope
			if (parsed.zone && INDIAN_RAILWAY_ZONES.includes(parsed.zone)) {
				setSelectedZone(parsed.zone)
				if (parsed.divisionKey) {
					setSelectedDivisionKey(parsed.divisionKey)
				}
			}
		} catch {
			// ignore corrupted storage
		}
	}, [])

	useEffect(() => {
		try {
			const payload: StoredScope = { zone: selectedZone, divisionKey: selectedDivisionKey }
			window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload))
		} catch {
			// ignore quota/storage errors
		}
	}, [selectedZone, selectedDivisionKey])

	const availableDivisionKeys = useMemo(() => listDivisionKeys(selectedZone), [selectedZone])
	const divisionMeta = useMemo(() => getDivisionMeta(selectedDivisionKey ?? undefined), [selectedDivisionKey])
	const stationCode = useMemo(
		() => getStationCodeForSelection(selectedZone, selectedDivisionKey),
		[selectedZone, selectedDivisionKey]
	)

	const setZone = useCallback(
		(zone: ZoneDisplayName | null) => {
			setSelectedZone(zone)
			if (!zone) {
				setSelectedDivisionKey(null)
				return
			}
			if (selectedDivisionKey) {
				const meta = getDivisionMeta(selectedDivisionKey)
				if (!meta || meta.zone !== zone) {
					setSelectedDivisionKey(null)
				}
			}
		},
		[selectedDivisionKey]
	)

	const setDivisionKey = useCallback(
		(divisionKey: string | null) => {
			if (!divisionKey) {
				setSelectedDivisionKey(null)
				return
			}
			const meta = getDivisionMeta(divisionKey)
			if (!meta) {
				setSelectedDivisionKey(null)
				return
			}
			setSelectedDivisionKey(divisionKey)
			setSelectedZone(meta.zone)
		},
		[]
	)

	const resetScope = useCallback(() => {
		setSelectedZone(null)
		setSelectedDivisionKey(null)
	}, [])

	const value = useMemo<ZoneFilterContextValue>(
		() => ({
			selectedZone,
			selectedDivisionKey,
			setZone,
			setDivisionKey,
			resetScope,
			availableZones: INDIAN_RAILWAY_ZONES,
			availableDivisionKeys,
			divisionMeta,
			stationCode,
		}),
		[selectedZone, selectedDivisionKey, setZone, setDivisionKey, resetScope, availableDivisionKeys, divisionMeta, stationCode]
	)

	return <ZoneFilterContext.Provider value={value}>{children}</ZoneFilterContext.Provider>
}

export function useZoneFilter() {
	const ctx = useContext(ZoneFilterContext)
	if (!ctx) {
		throw new Error('useZoneFilter must be used inside ZoneFilterProvider')
	}
	return ctx
}

export function ensureDivisionOrDefault(
	zone: ZoneDisplayName | null,
	divisionKey: string | null,
	setDivision: (divisionKey: string | null) => void
) {
	if (!zone) return divisionKey
	if (divisionKey) return divisionKey
	const fallback = getDefaultDivisionKey(zone)
	if (fallback) {
		setDivision(fallback)
		return fallback
	}
	return null
}

