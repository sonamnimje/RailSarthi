import React, { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import KPIsPanel from '../components/KPIsPanel'
import SmartRecommendations from '../components/SmartRecommendations'
import ForecastsPanel from '../components/ForecastsPanel'
import TimelineChart from '../components/TimelineChart'
import OverrideModal from '../components/OverrideModal'
import { fetchKpis, fetchRecommendations, type Recommendation, fetchTimelineData, type TimelineData, applyOverride } from '../lib/api'

export default function DashboardPage() {
  const navigate = useNavigate()
  const [kpis, setKpis] = useState<{ throughput_per_hour?: number; avg_delay_minutes?: number; congestion_index?: number; on_time_percentage?: number } | null>(null)
  const [recs, setRecs] = useState<Recommendation[]>([])
  const [timeline, setTimeline] = useState<TimelineData | null>(null)
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
        const [kpiResp, recResp, timelineResp] = await Promise.all([
          fetchKpis().catch(() => null),
          fetchRecommendations({ section_id: 'S1', lookahead_minutes: 30 }).catch(() => ({ recommendations: [] as Recommendation[] } as any)),
          fetchTimelineData({ section_id: 'S1', hours: 6 }).catch(() => null)
        ])
        if (cancelled) return
        setKpis(kpiResp)
        setRecs((recResp?.recommendations as Recommendation[]) || [])
        setTimeline(timelineResp)
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

  const mockTimelineData = useMemo(() => {
    const now = new Date()
    const startTime = new Date(now.getTime() - 2 * 60 * 60 * 1000) // 2 hours ago
    const endTime = new Date(now.getTime() + 4 * 60 * 60 * 1000) // 4 hours from now
    
    return {
      timeline: {
        'T001': [
          {
            station_id: 'ST001',
            section_id: 'S1',
            event_type: 'departure',
            planned_time: new Date(startTime.getTime() + 30 * 60 * 1000).toISOString(),
            actual_time: new Date(startTime.getTime() + 35 * 60 * 1000).toISOString(),
            delay_minutes: 5,
            status: 'departed',
            platform: 'P1'
          },
          {
            station_id: 'ST002',
            section_id: 'S1',
            event_type: 'arrival',
            planned_time: new Date(startTime.getTime() + 90 * 60 * 1000).toISOString(),
            actual_time: new Date(startTime.getTime() + 95 * 60 * 1000).toISOString(),
            delay_minutes: 5,
            status: 'arrived',
            platform: 'P2'
          }
        ],
        'T002': [
          {
            station_id: 'ST001',
            section_id: 'S1',
            event_type: 'departure',
            planned_time: new Date(startTime.getTime() + 60 * 60 * 1000).toISOString(),
            actual_time: new Date(startTime.getTime() + 75 * 60 * 1000).toISOString(),
            delay_minutes: 15,
            status: 'departed',
            platform: 'P3'
          },
          {
            station_id: 'ST002',
            section_id: 'S1',
            event_type: 'arrival',
            planned_time: new Date(startTime.getTime() + 120 * 60 * 1000).toISOString(),
            actual_time: new Date(startTime.getTime() + 135 * 60 * 1000).toISOString(),
            delay_minutes: 15,
            status: 'arrived',
            platform: 'P1'
          }
        ],
        'T003': [
          {
            station_id: 'ST001',
            section_id: 'S1',
            event_type: 'departure',
            planned_time: new Date(startTime.getTime() + 90 * 60 * 1000).toISOString(),
            actual_time: new Date(startTime.getTime() + 90 * 60 * 1000).toISOString(),
            delay_minutes: 0,
            status: 'departed',
            platform: 'P2'
          },
          {
            station_id: 'ST002',
            section_id: 'S1',
            event_type: 'arrival',
            planned_time: new Date(startTime.getTime() + 150 * 60 * 1000).toISOString(),
            actual_time: new Date(startTime.getTime() + 150 * 60 * 1000).toISOString(),
            delay_minutes: 0,
            status: 'arrived',
            platform: 'P3'
          }
        ]
      },
      time_range: {
        start: startTime.toISOString(),
        end: endTime.toISOString()
      }
    }
  }, [])

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

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        <div className="lg:col-span-2 flex flex-col gap-6">
          <section className="rounded-2xl border border-gray-200 bg-white p-4 shadow">
            <TimelineChart
              data={(timeline && Object.keys(timeline.timeline || {}).length > 0) ? timeline : mockTimelineData}
              height={380}
              embedded
              compact
              showHeader={true}
              showLegend={true}
            />
          </section>
        </div>
        <div className="lg:col-span-1 flex flex-col gap-6">
          <KPIsPanel kpis={kpis} />
          <SmartRecommendations recommendations={recs} onAccept={handleAccept} onOverride={handleOverride} />
          <ForecastsPanel forecasts={mockForecasts} />
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


