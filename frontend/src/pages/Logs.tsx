import { useState, useEffect } from 'react'
import axios from 'axios'

export default function LogsPage() {
  const [trains, setTrains] = useState([])
  const [station, setStation] = useState('NDLS')
  const [hours, setHours] = useState(2)
  const [trainNo, setTrainNo] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  // ✅ Normalize times like "36:35" → "12:35 (+1d)"
  const normalizeTime = (time) => {
    if (!time) return '-'
    const [hourStr, minStr] = time.split(':')
    const hour = parseInt(hourStr)
    const min = parseInt(minStr)
    if (isNaN(hour) || isNaN(min)) return time

    if (hour >= 24) {
      const day = Math.floor(hour / 24)
      const hr = hour % 24
      return `${hr.toString().padStart(2, '0')}:${min
        .toString()
        .padStart(2, '0')} (+${day}d)`
    }
    return time
  }

  // ✅ Fetch train data
  const fetchLiveTrains = async () => {
    setLoading(true)
    setError(null)
    try {
      const params = { fromStationCode: station, hours }
      if (trainNo) params.trainNo = trainNo

      const res = await axios.get('http://127.0.0.1:8000/api/live/live-trains', { params })
      const data = res.data.trains || res.data.data || []
      setTrains(data)
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to fetch train data')
      setTrains([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchLiveTrains()
  }, [station, hours])

  return (
    <div className="p-6 bg-white min-h-screen">
      <h2 className="text-3xl font-bold mb-6 text-gray-800">🚉 Live Train Logs</h2>

      {/* 🔍 Filters */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div>
          <label className="block text-sm font-medium text-gray-600 mb-1">Station Code</label>
          <input
            value={station}
            onChange={(e) => setStation(e.target.value.toUpperCase())}
            placeholder="e.g. NDLS"
            className="border border-gray-300 rounded px-3 py-2 w-full"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-600 mb-1">Time Range (hours)</label>
          <select
            value={hours}
            onChange={(e) => setHours(Number(e.target.value))}
            className="border border-gray-300 rounded px-3 py-2 w-full"
          >
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
        onClick={fetchLiveTrains}
        className="bg-blue-600 text-white px-4 py-2 rounded mb-4 hover:bg-blue-700"
      >
        Fetch Data
      </button>

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
