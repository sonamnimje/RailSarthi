import React, { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import KPIsPanel from '../components/KPIsPanel'
import SmartRecommendations from '../components/SmartRecommendations'
import ForecastsPanel from '../components/ForecastsPanel'
import OverrideModal from '../components/OverrideModal'
import { fetchKpis, fetchRecommendations, type Recommendation, applyOverride } from '../lib/api'

export default function DashboardPage() {
  const navigate = useNavigate()
  const [kpis, setKpis] = useState<{ throughput_per_hour?: number; avg_delay_minutes?: number; congestion_index?: number; on_time_percentage?: number } | null>(null)
  const [recs, setRecs] = useState<Recommendation[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [actionMsg, setActionMsg] = useState<string | null>(null)
  const [overrideModal, setOverrideModal] = useState<{ isOpen: boolean; rec: Recommendation | null }>({ isOpen: false, rec: null })

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      setError(null)
      try {
        const [kpiResp, recResp] = await Promise.all([
          fetchKpis().catch(() => null),
          fetchRecommendations({ section_id: 'S1', lookahead_minutes: 30 }).catch(() => ({ recommendations: [] as Recommendation[] } as any))
        ])
        if (cancelled) return
        setKpis(kpiResp)
        setRecs((recResp?.recommendations as Recommendation[]) || [])
      } catch (e: any) {
        if (!cancelled) setError(e?.message || 'Failed to load dashboard')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    const interval = setInterval(load, 30000)
    return () => { cancelled = true; clearInterval(interval) }
  }, [])

  const mockForecasts = useMemo(() => ([
    { icon: '⚠️', message: 'High chance of bottleneck at Section B (3 trains converging).' },
    { icon: '🌧️', message: 'Weather may cause minor delays near Station C.' }
  ]), [])

  async function handleAccept(rec: Recommendation) {
    try {
      setActionMsg(null)
      await applyOverride({
        controller_id: 'controller-1',
        train_id: rec.train_id,
        action: rec.action,
        ai_action: rec.action,
        reason: 'Accepted AI suggestion',
        timestamp: Date.now()
      })
      setRecs(prev => prev.filter(r => !(r.train_id === rec.train_id && r.action === rec.action)))
      setActionMsg(`Applied: ${rec.action} for ${rec.train_id}`)
      navigate('/app/dashboard')
    } catch (e: any) {
      setActionMsg(e?.message || 'Failed to apply action')
    }
  }

  function handleOverride(rec: Recommendation) {
    setOverrideModal({ isOpen: true, rec })
  }

  async function handleOverrideConfirm(action: string, reason?: string) {
    if (!overrideModal.rec) return
    
    try {
      setActionMsg(null)
      await applyOverride({
        controller_id: 'controller-1',
        train_id: overrideModal.rec.train_id,
        action,
        ai_action: overrideModal.rec.action,
        reason,
        timestamp: Date.now()
      })
      // Remove the acted-on recommendation from the list
      setRecs(prev => prev.filter(r => !(r.train_id === overrideModal.rec!.train_id && r.action === overrideModal.rec!.action)))
      setActionMsg(`Override applied for ${overrideModal.rec.train_id}`)
      setOverrideModal({ isOpen: false, rec: null })
      navigate('/app/dashboard')
    } catch (e: any) {
      setActionMsg(e?.message || 'Failed to apply override')
    }
  }

  function handleOverrideClose() {
    setOverrideModal({ isOpen: false, rec: null })
  }


  return (
    <div className="p-6 bg-white text-gray-900">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <span className="text-2xl">📊</span>
          <h2 className="text-4xl font-extrabold">Dashboard</h2>
        </div>
        <div className="text-sm text-gray-600">
          {loading ? 'Refreshing…' : 'Updated'} {new Date().toLocaleTimeString()}
        </div>
      </div>

      {error && <div className="mb-4 text-sm text-red-600">{error}</div>}
      {actionMsg && <div className="mb-4 text-sm text-blue-700 bg-blue-50 border border-blue-200 rounded p-2">{actionMsg}</div>}

      <div className="flex flex-col gap-6 mb-6">
        <KPIsPanel kpis={kpis} />
        <SmartRecommendations recommendations={recs} onAccept={handleAccept} onOverride={handleOverride} />
        <ForecastsPanel forecasts={mockForecasts} />
      </div>

      <OverrideModal
        isOpen={overrideModal.isOpen}
        onClose={handleOverrideClose}
        onConfirm={handleOverrideConfirm}
        trainId={overrideModal.rec?.train_id || ''}
        aiAction={overrideModal.rec?.action || ''}
      />
    </div>
  )
}


