import { useCallback, useEffect, useState } from 'react'
import { fetchLiveTrains as fetchLiveTrainsApi, type LiveTrain } from '../lib/api'
import { useZoneFilter, ensureDivisionOrDefault } from '../lib/ZoneFilterContext'
import { useRealTimeData } from '../lib/RealTimeDataContext'

export default function LogsPage() {
  const { trains: realTimeTrains, isConnected, refreshData } = useRealTimeData()
  const [trains, setTrains] = useState<LiveTrain[]>([])
  const [station, setStation] = useState<string>('')
  const [hours, setHours] = useState<number | undefined>(undefined)
  const [trainNo, setTrainNo] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [apiStation, setApiStation] = useState<string | null>(null)
  const [totalTrains, setTotalTrains] = useState<number | null>(null)
  const { selectedZone, selectedDivisionKey, divisionMeta, stationCode, setDivisionKey } = useZoneFilter()
  const [isZoneScoped, setIsZoneScoped] = useState(false)

  // ✅ Normalize times like "36:35" → "12:35 (+1d)"
  const normalizeTime = (time: string | number | null | undefined) => {
    if (!time) return '-'
    const [hourStr, minStr] = String(time).split(':')
    const hour = parseInt(hourStr)
    const min = parseInt(minStr)
    if (isNaN(hour) || isNaN(min)) return String(time)

    if (hour >= 24) {
      const day = Math.floor(hour / 24)
      const hr = hour % 24
      return `${hr.toString().padStart(2, '0')}:${min
        .toString()
        .padStart(2, '0')} (+${day}d)`
    }
    return String(time)
  }

  // ✅ Fetch train data
  const fetchLiveTrainsFor = useCallback(async (trainNumber?: string) => {
    if (!station.trim()) {
      setError('Station code is required')
      setTrains([])
      setApiStation(null)
      setTotalTrains(null)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const normalizedTrainNo = trainNumber ? trainNumber.trim() : ''
      const response = await fetchLiveTrainsApi({
        fromStationCode: station.trim(),
        hours,
        trainNo: normalizedTrainNo ? normalizedTrainNo : undefined,
      })
      setTrains(response.trains)
      setApiStation(response.station)
      setTotalTrains(response.total_trains)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to fetch train data'
      setError(message)
      setTrains([])
      setApiStation(null)
      setTotalTrains(null)
    } finally {
      setLoading(false)
    }
  }, [hours, station])

  useEffect(() => {
    fetchLiveTrainsFor()
  }, [fetchLiveTrainsFor])

  // Sync with real-time data when available
  useEffect(() => {
    if (realTimeTrains && realTimeTrains.length > 0 && !station) {
      setTrains(realTimeTrains)
    }
  }, [realTimeTrains, station])

  useEffect(() => {
    if (!selectedZone) {
      setIsZoneScoped(false)
      return
    }
    ensureDivisionOrDefault(selectedZone, selectedDivisionKey, setDivisionKey)
    if (!stationCode) {
      setIsZoneScoped(false)
      return
    }
    const normalized = stationCode.toUpperCase()
    setIsZoneScoped(true)
    if (station !== normalized) {
      setStation(normalized)
    }
  }, [selectedZone, selectedDivisionKey, stationCode, station, setDivisionKey])

  return (
    <div className="p-6 bg-gradient-to-br from-blue-50 via-blue-100 to-indigo-50 min-h-screen">
      <h2 className="text-3xl font-bold mb-6 text-gray-800">🚉 Live Train Logs</h2>
      {selectedZone && (
        <div className="mb-4 rounded-lg bg-blue-100 border border-blue-200 text-blue-900 text-sm px-4 py-3">
          Viewing trains for <span className="font-semibold">{selectedZone}</span>
          {divisionMeta && <span className="font-semibold">{` • ${divisionMeta.division}`}</span>}
          {stationCode && <span>{` (station ${stationCode.toUpperCase()})`}</span>}
        </div>
      )}

      {/* 🔍 Filters */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div>
          <label className="block text-sm font-medium text-gray-600 mb-1">Station Code</label>
          <input
            value={station}
            onChange={(e) => setStation(e.target.value.toUpperCase())}
            placeholder="e.g. NDLS"
            className="border border-gray-300 rounded px-3 py-2 w-full"
            disabled={isZoneScoped}
          />
          {isZoneScoped && (
            <p className="text-xs text-blue-700 mt-1">Locked to dashboard zone selection.</p>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-600 mb-1">Time Range (hours)</label>
          <select
            value={hours ?? ''}
            onChange={(e) => {
              const value = e.target.value
              setHours(value ? Number(value) : undefined)
            }}
            className="border border-gray-300 rounded px-3 py-2 w-full"
          >
            <option value="">Select timeframe</option>
            <option value={1}>1 Hour</option>
            <option value={2}>2 Hours</option>
            <option value={3}>3 Hours</option>
            <option value={6}>6 Hours</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-600 mb-1">
            Train Number (optional)
          </label>
          <input
            value={trainNo}
            onChange={(e) => setTrainNo(e.target.value)}
            placeholder="e.g. 18478"
            className="border border-gray-300 rounded px-3 py-2 w-full"
          />
        </div>
      </div>

      {/* 🔄 Fetch Button */}
      <button
        onClick={() => fetchLiveTrainsFor(trainNo)}
        className="bg-blue-600 text-white px-4 py-2 rounded mb-4 hover:bg-blue-700"
      >
        Fetch Data
      </button>

      {apiStation && !loading && !error && (
        <div className="text-sm text-gray-600 mb-4">
          Showing {trains.length} of {totalTrains ?? trains.length} trains for station {apiStation}.
        </div>
      )}

      {/* 🕒 Loading / Error */}
      {loading && <div className="text-gray-500">Loading live trains...</div>}
      {error && <div className="text-red-600 bg-red-50 p-3 rounded">{error}</div>}

      {/* 🚉 Train Table */}
      {!loading && !error && trains.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full border border-gray-300 text-sm shadow-sm rounded">
            <thead className="bg-gray-100 text-gray-700">
              <tr>
                <th className="p-3 text-left">Train No</th>
                <th className="p-3 text-left">Train Name</th>
                <th className="p-3 text-left">Arrival</th>
                <th className="p-3 text-left">Departure</th>
                <th className="p-3 text-left">Type</th>
                <th className="p-3 text-left">Station</th>
                <th className="p-3 text-left">Platform</th>
                <th className="p-3 text-left">Halt (min)</th>
                <th className="p-3 text-left">Stop</th>
                <th className="p-3 text-left">On-Time Rating</th>
                <th className="p-3 text-left">Train Source</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {trains.map((t, i) => (
                <tr key={i} className="hover:bg-gray-50 transition">
                  <td className="p-3 font-semibold text-blue-600">{t.trainNumber}</td>
                  <td className="p-3">{t.trainName}</td>
                  <td className="p-3">{normalizeTime(t.arrivalTime)}</td>
                  <td className="p-3">{normalizeTime(t.departureTime)}</td>
                  <td className="p-3 text-gray-600">{t.trainType || '-'}</td>
                  <td className="p-3">{t.station_name || '-'}</td>
                  <td className="p-3">{t.platform_number || '-'}</td>
                  <td className="p-3">{t.halt || '-'}</td>
                  <td className="p-3">{t.stop ? 'Yes' : 'No'}</td>
                  <td className="p-3">{t.on_time_rating || '-'}</td>
                  <td className="p-3">{t.train_src || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ⚠️ Empty */}
      {!loading && !error && trains.length === 0 && (
        <div className="text-gray-500 mt-6 text-center">
          No train data found for this station.
        </div>
      )}
    </div>
  )
}
