import React, { Suspense, lazy, useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import KPIsPanel from '../components/KPIsPanel'
import SmartRecommendations from '../components/SmartRecommendations'
import OverrideModal from '../components/OverrideModal'
import { fetchKpis, fetchRecommendations, type Recommendation, applyOverride } from '../lib/api'

const RailwayMasterChart = lazy(() => import('../components/RailwayMasterChart'))

export default function DashboardPage() {
  const navigate = useNavigate()
  const [kpis, setKpis] = useState<{ throughput_per_hour?: number; avg_delay_minutes?: number; congestion_index?: number; on_time_percentage?: number } | null>(null)
  const [recs, setRecs] = useState<Recommendation[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [actionMsg, setActionMsg] = useState<string | null>(null)
  const [overrideModal, setOverrideModal] = useState<{ isOpen: boolean; rec: Recommendation | null }>({ isOpen: false, rec: null })
  const [lastUpdated, setLastUpdated] = useState<number>(Date.now())

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
        setKpis(prev => (shallowEqual(prev, kpiResp) ? prev : kpiResp))
        const incomingRecs = (recResp?.recommendations as Recommendation[]) || []
        setRecs(prev => (areRecommendationsEqual(prev, incomingRecs) ? prev : incomingRecs))
        setLastUpdated(Date.now())
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

  const formattedLastUpdated = useMemo(() => new Date(lastUpdated).toLocaleTimeString(), [lastUpdated])

  const handleAccept = useCallback(async (rec: Recommendation) => {
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
  }, [navigate])

  const handleOverride = useCallback((rec: Recommendation) => {
    setOverrideModal({ isOpen: true, rec })
  }, [])

  const handleOverrideConfirm = useCallback(async (action: string, reason?: string) => {
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
  }, [navigate, overrideModal.rec])

  const handleOverrideClose = useCallback(() => {
    setOverrideModal({ isOpen: false, rec: null })
  }, [])


  return (
    <div className="p-4 sm:p-6 bg-blue-50 text-gray-900">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-0 mb-4 sm:mb-6">
        <div className="flex items-center gap-2">
          <span className="text-xl sm:text-2xl">📊</span>
          <h2 className="text-2xl sm:text-3xl md:text-4xl font-extrabold">Dashboard</h2>
        </div>
        <div className="text-xs sm:text-sm text-gray-600">
          {loading ? 'Refreshing…' : 'Updated'} {formattedLastUpdated}
        </div>
      </div>

      {error && <div className="mb-4 text-sm text-red-600">{error}</div>}
      {actionMsg && <div className="mb-4 text-sm text-blue-700 bg-blue-50 border border-blue-200 rounded p-2">{actionMsg}</div>}

      <div className="mb-6 grid gap-6 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="flex flex-col gap-6">
          <KPIsPanel kpis={kpis} />
          <Suspense fallback={<ChartSkeleton />}>
            <RailwayMasterChart className="self-stretch" />
          </Suspense>
        </div>
        <div className="flex flex-col gap-6">
          <SmartRecommendations recommendations={recs} onAccept={handleAccept} onOverride={handleOverride} />
        </div>
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

function shallowEqual(
  a: Record<string, unknown> | null | undefined,
  b: Record<string, unknown> | null | undefined
): boolean {
  if (a === b) return true
  if (!a || !b) return false
  const keysA = Object.keys(a)
  const keysB = Object.keys(b)
  if (keysA.length !== keysB.length) return false
  for (const key of keysA) {
    if (a[key] !== b[key]) return false
  }
  return true
}

function areRecommendationsEqual(prev: Recommendation[], next: Recommendation[]): boolean {
  if (prev === next) return true
  if (prev.length !== next.length) return false
  for (let i = 0; i < prev.length; i++) {
    const a = prev[i]
    const b = next[i]
    if (
      a.train_id !== b.train_id ||
      a.action !== b.action ||
      a.reason !== b.reason ||
      a.eta_change_seconds !== b.eta_change_seconds ||
      a.platform !== b.platform ||
      a.priority_score !== b.priority_score
    ) {
      return false
    }
  }
  return true
}

function ChartSkeleton() {
  return (
    <div className="flex h-[640px] w-full items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50 text-sm text-slate-500">
      Loading master chart…
    </div>
  )
}


