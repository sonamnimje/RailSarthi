import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { 
  Play, Pause, RotateCcw, Train, Gauge, 
  TrendingUp, Clock, AlertTriangle, 
  GitBranch, ArrowRight, ArrowLeft, Zap, Plus, Minus,
  Activity, BarChart3, Signal, RefreshCw, Database, Wifi,
  Edit3, Wrench, X, Check, Trash2, Save, Loader2
} from 'lucide-react';
import { cn } from '@/lib/utils';

// Types
interface Station {
  id: number;
  code: string;
  name: string;
  seqNo: number;
  cumulativeDistance: number;
  noOfTracks: number;
  signalType: 'AT' | 'AB';
  isJunction: boolean;
  blockSection: string;
  hasLoop: boolean;
  loopCount: number;
}

interface FreightTrain {
  id: string;
  loadId: string;
  position: number;
  speed: number;
  direction: 'UP' | 'DN';
  status: 'running' | 'stopped' | 'halted';
  commodity?: string;
  destination?: string;
  currentStation: string;
  line: 'main' | 'loop' | 'additional';
  color: string;
  lastUpdate: Date;
}

interface KPIMetrics {
  throughputTrainsPerHour: number;
  avgSpeed: number;
  utilization: number;
  activeTrains: number;
  abSections: number;
  atSections: number;
  totalLoops: number;
  totalCrossovers: number;
  conflictRisk: number;
  capacityGain: number;
}

interface InfrastructureEdit {
  stationCode: string;
  type: 'loop' | 'crossover' | 'upgrade_at';
}

// Train colors based on commodity
const commodityColors: Record<string, string> = {
  'COAL': '#374151',
  'IRON': '#dc2626',
  'CEMENT': '#6b7280',
  'FOOD': '#16a34a',
  'OIL': '#ca8a04',
  'AUTO': '#2563eb',
  'SLAG': '#78716c',
  'IORE': '#b91c1c',
  'PHC': '#0891b2',
  'NPKF': '#7c3aed',
  'default': '#3b82f6',
};

const getTrainColor = (commodity?: string): string => {
  if (!commodity) return commodityColors.default;
  return commodityColors[commodity.toUpperCase()] || commodityColors.default;
};

interface RealTimeBlockDiagramProps {
  stations: Array<{ code: string; name: string; distanceKm: number; haltMinutes?: number }>;
  snapshot?: {
    trains: Record<string, {
      distanceKm: number;
      currentSpeedKmph: number;
      status: 'running' | 'halted' | 'completed';
      delayMin?: number;
    }>;
    simTimeMin: number;
    running: boolean;
  };
  trains?: Array<{
    trainId: string;
    trainType: string;
    stations: Array<{ stationCode: string; scheduledTimeMin: number }>;
  }>;
}

export function RealTimeBlockDiagram({ stations, snapshot, trains = [] }: RealTimeBlockDiagramProps) {
  const [isSimulating, setIsSimulating] = useState(false);
  const [simulationSpeed, setSimulationSpeed] = useState(1);
  const [showSignals, setShowSignals] = useState(true);
  const [showLoops, setShowLoops] = useState(true);
  const [showAdditionalLine, setShowAdditionalLine] = useState(true);
  const [selectedTrain, setSelectedTrain] = useState<string | null>(null);
  const [displayTrains, setDisplayTrains] = useState<FreightTrain[]>([]);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [zoomLevel, setZoomLevel] = useState(1);
  const [isConnected, setIsConnected] = useState(true);
  const [lastDataUpdate, setLastDataUpdate] = useState<Date | null>(null);
  
  // Infrastructure editing state
  const [isEditMode, setIsEditMode] = useState(false);
  const [pendingEdits, setPendingEdits] = useState<InfrastructureEdit[]>([]);
  const [selectedStation, setSelectedStation] = useState<string | null>(null);
  const [localStationOverrides, setLocalStationOverrides] = useState<Map<string, { hasLoop?: boolean; hasCrossover?: boolean; signalType?: 'AT' | 'AB' }>>(new Map());
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  
  const animationRef = useRef<number | null>(null);
  const lastUpdateRef = useRef<number>(Date.now());

  // Process stations from props
  const processedStations = useMemo<Station[]>(() => {
    return stations.slice(0, 8).map((s, idx) => ({
      id: idx,
      code: s.code,
      name: s.name,
      seqNo: idx,
      cumulativeDistance: s.distanceKm || 0,
      noOfTracks: 2,
      signalType: idx % 3 === 0 ? 'AB' : 'AT' as 'AT' | 'AB',
      isJunction: idx % 4 === 0,
      blockSection: '',
      hasLoop: idx % 2 === 0,
      loopCount: idx % 2 === 0 ? 1 : 0,
    }));
  }, [stations]);

  const totalDistance = useMemo(() => {
    if (processedStations.length === 0) return 100;
    return Math.max(...processedStations.map(s => s.cumulativeDistance), 100);
  }, [processedStations]);

  // Process trains from snapshot
  useEffect(() => {
    if (!snapshot || !snapshot.trains) {
      setDisplayTrains([]);
      return;
    }

    const processedTrains: FreightTrain[] = [];
    let colorIndex = 0;

    Object.entries(snapshot.trains).forEach(([trainId, trainData]) => {
      const trainConfig = trains.find(t => t.trainId === trainId);
      if (!trainConfig) return;

      // Only show freight trains
      if (trainConfig.trainType !== 'Freight') return;

      const position = trainData.distanceKm || 0;
      const speed = trainData.currentSpeedKmph || 0;
      const status = trainData.status === 'running' ? 'running' : 
                     trainData.status === 'halted' ? 'halted' : 'stopped';

      // Determine direction from stations
      let direction: 'UP' | 'DN' = 'UP';
      if (trainConfig.stations.length > 1) {
        const firstStation = processedStations.find(s => s.code === trainConfig.stations[0]?.stationCode);
        const lastStation = processedStations.find(s => s.code === trainConfig.stations[trainConfig.stations.length - 1]?.stationCode);
        if (firstStation && lastStation) {
          direction = lastStation.cumulativeDistance > firstStation.cumulativeDistance ? 'UP' : 'DN';
        }
      }

      processedTrains.push({
        id: trainId,
        loadId: trainId.substring(0, 15),
        position,
        speed,
        direction,
        status,
        commodity: 'FREIGHT',
        destination: trainConfig.stations[trainConfig.stations.length - 1]?.stationCode,
        currentStation: processedStations.find(s => Math.abs(s.cumulativeDistance - position) < 5)?.code || '',
        line: colorIndex % 3 === 0 ? 'additional' : 'main',
        color: getTrainColor('FREIGHT'),
        lastUpdate: new Date(),
      });

      colorIndex++;
    });

    setDisplayTrains(processedTrains.slice(0, 12));
    setLastDataUpdate(new Date());
  }, [snapshot, trains, processedStations]);

  // Animation loop for smooth train movement
  useEffect(() => {
    if (!isSimulating || !snapshot?.running) {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
      return;
    }

    const animate = () => {
      const now = Date.now();
      const deltaTime = (now - lastUpdateRef.current) / 1000;
      lastUpdateRef.current = now;
      setCurrentTime(new Date());

      // Update trains based on snapshot
      if (snapshot?.trains) {
        setDisplayTrains(prevTrains => prevTrains.map(train => {
          const trainData = snapshot.trains[train.id];
          if (!trainData) return train;
          
          return {
            ...train,
            position: trainData.distanceKm || train.position,
            speed: trainData.currentSpeedKmph || 0,
            status: trainData.status === 'running' ? 'running' : 
                   trainData.status === 'halted' ? 'halted' : 'stopped',
          };
        }));
      }

      animationRef.current = requestAnimationFrame(animate);
    };

    lastUpdateRef.current = Date.now();
    animationRef.current = requestAnimationFrame(animate);
    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, [isSimulating, simulationSpeed, snapshot]);

  // Calculate KPIs with infrastructure edits included
  const effectiveStations = useMemo(() => {
    return processedStations.map(s => {
      const override = localStationOverrides.get(s.code);
      if (!override) return s;
      return {
        ...s,
        hasLoop: override.hasLoop ?? s.hasLoop,
        signalType: override.signalType ?? s.signalType,
      };
    });
  }, [processedStations, localStationOverrides]);

  const crossoverCount = useMemo(() => {
    let count = 0;
    localStationOverrides.forEach(override => {
      if (override.hasCrossover) count++;
    });
    return count;
  }, [localStationOverrides]);

  // Calculate KPIs from real-time snapshot data
  const kpis = useMemo<KPIMetrics>(() => {
    // Get real-time train data from snapshot
    let runningTrains = 0;
    let totalSpeed = 0;
    let trainCount = 0;
    let freightTrainCount = 0;
    
    if (snapshot?.trains) {
      Object.entries(snapshot.trains).forEach(([trainId, trainData]) => {
        const trainConfig = trains.find(t => t.trainId === trainId);
        if (!trainConfig || trainConfig.trainType !== 'Freight') return;
        
        freightTrainCount++;
        if (trainData.status === 'running') {
          runningTrains++;
        }
        if (trainData.currentSpeedKmph > 0) {
          totalSpeed += trainData.currentSpeedKmph;
          trainCount++;
        }
      });
    }
    
    const avgSpeed = trainCount > 0 ? totalSpeed / trainCount : 0;
    
    // Infrastructure metrics
    const abSections = effectiveStations.filter(s => s.signalType === 'AB').length;
    const atSections = effectiveStations.filter(s => s.signalType === 'AT').length;
    const totalLoops = effectiveStations.reduce((sum, s) => sum + (s.hasLoop ? 1 : 0), 0);
    
    // Capacity calculation: AT=12 trains/hr, AB=6 trains/hr, +2 per loop, +1 per crossover
    const baseCapacity = (atSections * 12) + (abSections * 6);
    const loopBonus = totalLoops * 2;
    const crossoverBonus = crossoverCount * 1;
    const totalCapacity = baseCapacity + loopBonus + crossoverBonus;
    
    // Calculate throughput based on actual running trains and simulation time
    const simTimeHours = snapshot?.simTimeMin ? snapshot.simTimeMin / 60 : 1;
    const completedTrains = snapshot?.trains 
      ? Object.values(snapshot.trains).filter(t => t.status === 'completed').length 
      : 0;
    const throughputTrainsPerHour = simTimeHours > 0 
      ? Math.round((completedTrains / simTimeHours) * 60) 
      : atSections * 4 + abSections * 2 + totalLoops + crossoverCount;
    
    // Utilization based on active trains vs capacity
    const utilization = totalCapacity > 0 
      ? Math.min(100, (freightTrainCount / totalCapacity) * 100) 
      : 0;
    
    // Calculate capacity gain from pending edits
    const originalAT = processedStations.filter(s => s.signalType === 'AT').length;
    const originalLoops = processedStations.reduce((sum, s) => sum + (s.hasLoop ? 1 : 0), 0);
    const originalCapacity = (originalAT * 12) + ((processedStations.length - originalAT) * 6) + (originalLoops * 2);
    const capacityGain = totalCapacity - originalCapacity;

    // Conflict risk based on active trains and infrastructure
    const activeTrainDensity = freightTrainCount / Math.max(processedStations.length, 1);
    const conflictRisk = Math.max(5, Math.min(100, 
      40 - (atSections * 3) - (totalLoops * 2) - (crossoverCount * 1) + (activeTrainDensity * 10)
    ));

    return {
      throughputTrainsPerHour,
      avgSpeed: Math.round(avgSpeed),
      utilization: Math.round(utilization),
      activeTrains: runningTrains,
      abSections,
      atSections,
      totalLoops,
      totalCrossovers: crossoverCount,
      conflictRisk: Math.round(conflictRisk),
      capacityGain,
    };
  }, [snapshot, trains, effectiveStations, processedStations, crossoverCount]);

  // Manual refresh
  const handleRefresh = useCallback(() => {
    setLastDataUpdate(new Date());
  }, []);

  // Infrastructure editing handlers
  const handleAddLoop = useCallback((stationCode: string) => {
    const station = processedStations.find(s => s.code === stationCode);
    if (!station) return;
    
    // Check if loop already exists
    if (station.hasLoop) {
      console.log(`Loop already exists at ${stationCode}`);
      return;
    }

    setLocalStationOverrides(prev => {
      const newMap = new Map(prev);
      const existing = newMap.get(stationCode) || {};
      newMap.set(stationCode, { ...existing, hasLoop: true });
      return newMap;
    });
    
    // Only add to pending if not already there
    setPendingEdits(prev => {
      const exists = prev.some(e => e.stationCode === stationCode && e.type === 'loop');
      if (exists) return prev;
      return [...prev, { stationCode, type: 'loop' }];
    });
    
    console.log(`Loop added at ${stationCode}`);
  }, [processedStations]);

  const handleRemoveLoop = useCallback((stationCode: string) => {
    setLocalStationOverrides(prev => {
      const newMap = new Map(prev);
      const existing = newMap.get(stationCode);
      if (existing) {
        delete existing.hasLoop;
        if (Object.keys(existing).length === 0) {
          newMap.delete(stationCode);
        } else {
          newMap.set(stationCode, existing);
        }
      }
      return newMap;
    });
    
    setPendingEdits(prev => prev.filter(e => !(e.stationCode === stationCode && e.type === 'loop')));
    console.log(`Loop removed from ${stationCode}`);
  }, []);

  const handleAddCrossover = useCallback((stationCode: string) => {
    setLocalStationOverrides(prev => {
      const newMap = new Map(prev);
      const existing = newMap.get(stationCode) || {};
      newMap.set(stationCode, { ...existing, hasCrossover: true });
      return newMap;
    });
    setPendingEdits(prev => [...prev, { stationCode, type: 'crossover' }]);
  }, []);

  const handleUpgradeToAT = useCallback((stationCode: string) => {
    setLocalStationOverrides(prev => {
      const newMap = new Map(prev);
      const existing = newMap.get(stationCode) || {};
      newMap.set(stationCode, { ...existing, signalType: 'AT' });
      return newMap;
    });
    setPendingEdits(prev => [...prev, { stationCode, type: 'upgrade_at' }]);
  }, []);

  const handleRemoveEdit = useCallback((index: number) => {
    const edit = pendingEdits[index];
    if (!edit) return;
    
    setLocalStationOverrides(prev => {
      const newMap = new Map(prev);
      const existing = newMap.get(edit.stationCode);
      if (existing) {
        if (edit.type === 'loop') {
          delete existing.hasLoop;
          // Also remove from processed stations if it was an override
        }
        if (edit.type === 'crossover') delete existing.hasCrossover;
        if (edit.type === 'upgrade_at') delete existing.signalType;
        if (Object.keys(existing).length === 0) {
          newMap.delete(edit.stationCode);
        } else {
          newMap.set(edit.stationCode, existing);
        }
      }
      return newMap;
    });
    setPendingEdits(prev => prev.filter((_, i) => i !== index));
  }, [pendingEdits]);

  const handleClearAllEdits = useCallback(() => {
    setLocalStationOverrides(new Map());
    setPendingEdits([]);
    setSelectedStation(null);
  }, []);

  const handleApplyEdits = useCallback(() => {
    if (pendingEdits.length === 0) return;
    setShowSaveDialog(true);
  }, [pendingEdits]);

  const handleConfirmSave = useCallback(async () => {
    if (pendingEdits.length === 0) return;
    
    setIsSaving(true);
    try {
      // In a real implementation, this would save to a database
      // For now, we'll just clear the pending edits
      await new Promise(resolve => setTimeout(resolve, 1000));
      setPendingEdits([]);
      setShowSaveDialog(false);
    } catch (error) {
      console.error('Error saving edits:', error);
    } finally {
      setIsSaving(false);
    }
  }, [pendingEdits]);

  // Render station building
  const renderStation = (x: number, y: number, code: string, hasLoop: boolean, isJunction: boolean) => (
    <g>
      {/* Station platform */}
      <rect x={x - 30} y={y + 8} width={60} height={12} fill="#94a3b8" stroke="#64748b" strokeWidth={1} rx={2} />
      
      {/* Station building */}
      <g transform={`translate(${x}, ${y - 25})`}>
        <rect x={-18} y={0} width={36} height={25} fill="#e2e8f0" stroke="#94a3b8" strokeWidth={1.5} />
        <polygon points="-22,0 0,-12 22,0" fill="#475569" stroke="#334155" strokeWidth={1} />
        <rect x={-5} y={12} width={10} height={13} fill="#64748b" />
        <rect x={-14} y={5} width={6} height={6} fill="#0ea5e9" opacity={0.7} />
        <rect x={8} y={5} width={6} height={6} fill="#0ea5e9" opacity={0.7} />
      </g>
      {/* Station code label */}
      <rect x={x - 16} y={y + 22} width={32} height={14} fill="#1e293b" rx={2} />
      <text x={x} y={y + 32} textAnchor="middle" className="text-[9px] font-bold fill-white">{code}</text>
      {/* Junction indicator */}
      {isJunction && <circle cx={x + 22} cy={y - 30} r={6} fill="#8b5cf6" stroke="white" strokeWidth={1} />}
    </g>
  );

  // Render signal
  const renderSignal = (x: number, y: number, direction: 'left' | 'right', aspect: 'red' | 'yellow' | 'green' = 'green') => (
    <g transform={`translate(${x}, ${y})`}>
      <rect x={-2} y={0} width={4} height={20} fill="#374151" />
      <rect x={direction === 'left' ? -14 : 2} y={-8} width={12} height={28} fill="#1e293b" stroke="#475569" rx={2} />
      <circle cx={direction === 'left' ? -8 : 8} cy={-2} r={4} fill={aspect === 'red' ? '#ef4444' : '#374151'} />
      <circle cx={direction === 'left' ? -8 : 8} cy={8} r={4} fill={aspect === 'yellow' ? '#eab308' : '#374151'} />
      <circle cx={direction === 'left' ? -8 : 8} cy={18} r={4} fill={aspect === 'green' ? '#22c55e' : '#374151'} />
    </g>
  );

  // Render train
  const renderTrain = (train: FreightTrain, baseY: number) => {
    const x = 80 + (train.position / totalDistance) * 1040;
    const y = train.line === 'additional' ? baseY + 180 : baseY;
    const isSelected = selectedTrain === train.id;
    return (
      <g
        key={train.id}
        className="cursor-pointer transition-all"
        onClick={() => setSelectedTrain(isSelected ? null : train.id)}
      >
        {/* Train glow effect */}
        {isSelected && (
          <rect
            x={x - 22} y={y - 12} width={44} height={24}
            rx={6} fill="none" stroke={train.color} strokeWidth={3} opacity={0.5}
            className="animate-pulse"
          />
        )}
        {/* Train body */}
        <rect
          x={x - 18} y={y - 8} width={36} height={16} rx={4}
          fill={train.color}
          stroke={isSelected ? 'white' : train.color}
          strokeWidth={isSelected ? 2 : 0}
        />
        {/* Train front */}
        <polygon
          points={train.direction === 'UP' 
            ? `${x + 18},${y - 6} ${x + 26},${y} ${x + 18},${y + 6}`
            : `${x - 18},${y - 6} ${x - 26},${y} ${x - 18},${y + 6}`
          }
          fill={train.color}
        />
        {/* Headlight */}
        <circle
          cx={train.direction === 'UP' ? x + 24 : x - 24}
          cy={y}
          r={3}
          fill={train.status === 'running' ? '#fef08a' : '#4b5563'}
        />
        {/* Train ID */}
        <text x={x} y={y + 3} textAnchor="middle" className="text-[7px] fill-white font-bold">
          {train.loadId.slice(-4)}
        </text>
        {/* Speed indicator */}
        <text x={x} y={y - 14} textAnchor="middle" className="text-[8px] fill-foreground font-mono">
          {Math.round(train.speed)} km/h
        </text>
        {/* Status indicator */}
        {train.status === 'halted' && (
          <circle cx={x} cy={y - 22} r={4} fill="#ef4444" className="animate-pulse" />
        )}
        {/* Info tooltip when selected */}
        {isSelected && (
          <g>
            <rect
              x={x - 60} y={y + 20} width={120} height={55}
              rx={4} fill="#1e293b" stroke="#475569" opacity={0.95}
            />
            <text x={x} y={y + 35} textAnchor="middle" className="text-[9px] fill-white font-semibold">
              {train.loadId}
            </text>
            <text x={x} y={y + 47} textAnchor="middle" className="text-[8px] fill-muted-foreground">
              {train.commodity || 'Freight'} → {train.destination || 'Unknown'}
            </text>
            <text x={x} y={y + 59} textAnchor="middle" className="text-[8px] fill-muted-foreground">
              Station: {train.currentStation} • {train.direction}
            </text>
            <text x={x} y={y + 71} textAnchor="middle" className="text-[7px] fill-green-400">
              Updated: {train.lastUpdate.toLocaleTimeString()}
            </text>
          </g>
        )}
      </g>
    );
  };

  return (
    <div className="space-y-4">
      {/* Controls */}
      <Card className="bg-card/50 backdrop-blur border-border/50">
        <CardContent className="py-3">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              {/* Connection status */}
              <div className="flex items-center gap-2 px-2 py-1 rounded-md bg-green-50 border border-green-200">
                <div className={cn(
                  'w-2 h-2 rounded-full',
                  isConnected ? 'bg-green-500 animate-pulse' : 'bg-yellow-500'
                )} />
                <span className={cn(
                  "text-xs font-medium",
                  isConnected ? "text-green-700" : "text-yellow-700"
                )}>
                  {isConnected ? 'Live' : 'Connecting...'}
                </span>
              </div>
              <div className="flex items-center gap-2 px-2 py-1 rounded-md bg-blue-50 border border-blue-200">
                <Signal className={cn(
                  "h-4 w-4",
                  showSignals ? "text-blue-600" : "text-blue-400"
                )} />
                <Label className={cn(
                  "text-xs font-medium",
                  showSignals ? "text-blue-700" : "text-blue-500"
                )}>Signals</Label>
                <Switch 
                  checked={showSignals} 
                  onCheckedChange={setShowSignals}
                  className={showSignals ? "!bg-blue-600" : ""}
                />
              </div>
              <div className="flex items-center gap-2 px-2 py-1 rounded-md bg-purple-50 border border-purple-200">
                <GitBranch className={cn(
                  "h-4 w-4",
                  showLoops ? "text-purple-600" : "text-purple-400"
                )} />
                <Label className={cn(
                  "text-xs font-medium",
                  showLoops ? "text-purple-700" : "text-purple-500"
                )}>Loops</Label>
                <Switch 
                  checked={showLoops} 
                  onCheckedChange={setShowLoops}
                  className={showLoops ? "!bg-purple-600" : ""}
                />
              </div>
              <div className="flex items-center gap-2 px-2 py-1 rounded-md bg-orange-50 border border-orange-200">
                <ArrowRight className={cn(
                  "h-4 w-4",
                  showAdditionalLine ? "text-orange-600" : "text-orange-400"
                )} />
                <Label className={cn(
                  "text-xs font-medium",
                  showAdditionalLine ? "text-orange-700" : "text-orange-500"
                )}>Add. Line</Label>
                <Switch 
                  checked={showAdditionalLine} 
                  onCheckedChange={setShowAdditionalLine}
                  className={showAdditionalLine ? "!bg-orange-600" : ""}
                />
              </div>
            </div>
            <div className="flex items-center gap-3">
              {/* Edit Mode Toggle */}
              <Button 
                variant={isEditMode ? "default" : "outline"} 
                size="sm" 
                onClick={() => setIsEditMode(!isEditMode)}
                className={cn(
                  isEditMode 
                    ? "bg-indigo-600 hover:bg-indigo-700 text-white border-indigo-600" 
                    : "border-indigo-300 text-indigo-700 hover:bg-indigo-50"
                )}
              >
                <Edit3 className={cn(
                  "h-4 w-4 mr-1",
                  isEditMode ? "text-white" : "text-indigo-600"
                )} />
                {isEditMode ? 'Editing' : 'Edit Infra'}
              </Button>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={handleRefresh}
                className="border-sky-300 text-sky-700 hover:bg-sky-50"
              >
                <RefreshCw className="h-4 w-4 mr-1 text-sky-600" />
                Refresh
              </Button>
              <div className="flex items-center gap-2 px-2 py-1 rounded-md bg-amber-50 border border-amber-200">
                <Label className="text-xs font-medium text-amber-700">Speed:</Label>
                <Select value={simulationSpeed.toString()} onValueChange={(v) => setSimulationSpeed(Number(v))}>
                  <SelectTrigger className="w-20 h-8 bg-white border-amber-300 text-amber-700 hover:border-amber-400">
                    <SelectValue placeholder="1x" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="0.5">0.5x</SelectItem>
                    <SelectItem value="1">1x</SelectItem>
                    <SelectItem value="2">2x</SelectItem>
                    <SelectItem value="5">5x</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button
                size="sm"
                variant={isSimulating ? "destructive" : "default"}
                onClick={() => setIsSimulating(!isSimulating)}
                className={cn(
                  isSimulating 
                    ? "bg-red-600 hover:bg-red-700 text-white border-red-600" 
                    : "bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-600"
                )}
              >
                {isSimulating ? (
                  <>
                    <Pause className="h-4 w-4 mr-1" />
                    Stop
                  </>
                ) : (
                  <>
                    <Play className="h-4 w-4 mr-1" />
                    Animate
                  </>
                )}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Pending Edits Panel */}
      {isEditMode && pendingEdits.length > 0 && (
        <Card className="bg-primary/5 border-primary/30">
          <CardContent className="py-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Wrench className="h-4 w-4 text-primary" />
                <span className="text-sm font-medium">
                  {pendingEdits.length} Pending Infrastructure Changes
                </span>
                {kpis.capacityGain > 0 && (
                  <Badge variant="outline" className="bg-green-500/20 text-green-500">
                    +{kpis.capacityGain} capacity gain
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="ghost" onClick={handleClearAllEdits}>
                  <X className="h-4 w-4 mr-1" />
                  Clear All
                </Button>
                <Button size="sm" variant="default" onClick={handleApplyEdits}>
                  <Check className="h-4 w-4 mr-1" />
                  Apply Changes
                </Button>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2 mt-3">
              {pendingEdits.map((edit, idx) => {
                const station = processedStations.find(s => s.code === edit.stationCode);
                const capacityGain = edit.type === 'loop' ? 2 : edit.type === 'crossover' ? 1 : 6;
                return (
                  <div 
                    key={idx} 
                    className="flex items-center justify-between p-2 rounded-lg border bg-white hover:bg-slate-50 transition-colors"
                  >
                    <div className="flex items-center gap-2 flex-1">
                      {edit.type === 'loop' && <GitBranch className="h-4 w-4 text-blue-500" />}
                      {edit.type === 'crossover' && <ArrowRight className="h-4 w-4 text-orange-500" />}
                      {edit.type === 'upgrade_at' && <Zap className="h-4 w-4 text-green-500" />}
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-semibold text-slate-900 truncate">
                          {edit.stationCode}
                        </div>
                        <div className="text-[10px] text-slate-600">
                          {edit.type === 'loop' ? 'Loop Line' : edit.type === 'crossover' ? 'Crossover' : 'AB→AT Upgrade'}
                        </div>
                      </div>
                      <Badge variant="outline" className="text-[10px] bg-green-50 text-green-700 border-green-200">
                        +{capacityGain}
                      </Badge>
                    </div>
                    <button 
                      onClick={() => handleRemoveEdit(idx)} 
                      className="ml-2 p-1 rounded hover:bg-red-50 text-slate-400 hover:text-red-600 transition-colors"
                      title="Remove this edit"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Edit Mode Instructions */}
      {isEditMode && (
        <Card className={cn(
          "border-2",
          pendingEdits.length === 0 
            ? "bg-amber-50 border-amber-300" 
            : "bg-blue-50 border-blue-300"
        )}>
          <CardContent className="py-3">
            <div className="flex items-center gap-3">
              <Edit3 className={cn(
                "h-5 w-5",
                pendingEdits.length === 0 ? "text-amber-600" : "text-blue-600"
              )} />
              <div className="flex-1">
                <span className={cn(
                  "text-sm font-medium",
                  pendingEdits.length === 0 ? "text-amber-800" : "text-blue-800"
                )}>
                  {pendingEdits.length === 0 
                    ? "Click on any station in the diagram to add loops, crossovers, or upgrade AB→AT sections. KPIs update in real-time."
                    : `${pendingEdits.length} infrastructure change${pendingEdits.length > 1 ? 's' : ''} pending. Click stations to add more or use the controls above to manage.`
                  }
                </span>
              </div>
              {pendingEdits.length > 0 && (
                <Button 
                  size="sm" 
                  variant="outline"
                  onClick={handleClearAllEdits}
                  className="text-xs"
                >
                  <X className="h-3 w-3 mr-1" />
                  Clear All
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-5 lg:grid-cols-10 gap-2">
        <KPICard label="Active" value={kpis.activeTrains} icon={<Train className="h-3 w-3" />} />
        <KPICard label="Throughput" value={`${kpis.throughputTrainsPerHour}/hr`} icon={<TrendingUp className="h-3 w-3" />} highlight={kpis.capacityGain > 0} />
        <KPICard label="Avg Speed" value={`${kpis.avgSpeed}`} icon={<Gauge className="h-3 w-3" />} />
        <KPICard label="Utilization" value={`${kpis.utilization}%`} icon={<BarChart3 className="h-3 w-3" />} />
        <KPICard label="AT Sections" value={kpis.atSections} icon={<Zap className="h-3 w-3 text-green-500" />} highlight={kpis.atSections > processedStations.filter(s => s.signalType === 'AT').length} />
        <KPICard label="AB Sections" value={kpis.abSections} icon={<Clock className="h-3 w-3 text-amber-500" />} />
        <KPICard label="Loops" value={kpis.totalLoops} icon={<GitBranch className="h-3 w-3 text-blue-500" />} highlight={kpis.totalLoops > processedStations.filter(s => s.hasLoop).length} />
        <KPICard label="Crossovers" value={kpis.totalCrossovers} icon={<ArrowRight className="h-3 w-3 text-orange-500" />} highlight={kpis.totalCrossovers > 0} />
        <KPICard label="Risk" value={`${kpis.conflictRisk}%`} icon={<AlertTriangle className="h-3 w-3 text-red-500" />} highlight={kpis.conflictRisk > 30} />
        {kpis.capacityGain > 0 && (
          <KPICard label="Gain" value={`+${kpis.capacityGain}`} icon={<TrendingUp className="h-3 w-3 text-green-500" />} highlight />
        )}
      </div>

      {/* Block Diagram */}
      <Card className="bg-card/50 backdrop-blur border-border/50 overflow-hidden">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Database className="h-5 w-5 text-primary" />
                Real-Time Block Diagram
                {isConnected && (
                  <Badge variant="outline" className="ml-2 bg-green-500/20 text-green-500 animate-pulse">
                    <Wifi className="h-3 w-3 mr-1" />
                    LIVE DATA
                  </Badge>
                )}
              </CardTitle>
              <CardDescription>
                {processedStations.length} stations • {displayTrains.length} freight trains from simulation
                {snapshot && (
                  <>
                    <span className="ml-2 text-blue-500">
                      • Sim Time: T+{snapshot.simTimeMin.toFixed(1)}m
                    </span>
                    {snapshot.running && (
                      <span className="ml-2 text-green-500 animate-pulse">
                        • Running
                      </span>
                    )}
                  </>
                )}
                {lastDataUpdate && (
                  <span className="ml-2 text-slate-500">
                    • Updated: {lastDataUpdate.toLocaleTimeString()}
                  </span>
                )}
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={() => setZoomLevel(z => Math.max(0.5, z - 0.25))}>
                <Minus className="h-3 w-3" />
              </Button>
              <span className="text-xs text-muted-foreground w-12 text-center">{Math.round(zoomLevel * 100)}%</span>
              <Button variant="ghost" size="sm" onClick={() => setZoomLevel(z => Math.min(2, z + 0.25))}>
                <Plus className="h-3 w-3" />
              </Button>
              <Badge variant="outline" className="font-mono ml-2">
                {currentTime.toLocaleTimeString()}
              </Badge>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <ScrollArea className="w-full">
            <div style={{ width: `${Math.max(100, zoomLevel * 100)}%`, minWidth: '1200px' }}>
              <svg viewBox="0 0 1200 500" className="w-full h-[500px] bg-gradient-to-b from-background to-muted/20">
                <defs>
                  <pattern id="sleepers" patternUnits="userSpaceOnUse" width="16" height="12">
                    <rect x="6" y="0" width="4" height="12" fill="#64748b" opacity="0.4" />
                  </pattern>
                </defs>
                {/* Title labels */}
                <text x="30" y="120" className="text-[11px] fill-muted-foreground font-semibold">Main Line</text>
                {showAdditionalLine && (
                  <text x="30" y="300" className="text-[11px] fill-muted-foreground font-semibold">Additional Main Line</text>
                )}
                {/* Main line track - UP direction */}
                <g>
                  <rect x="60" y="125" width="1080" height="16" fill="url(#sleepers)" />
                  <line x1="60" y1="128" x2="1140" y2="128" stroke="#475569" strokeWidth="3" />
                  <line x1="60" y1="138" x2="1140" y2="138" stroke="#475569" strokeWidth="3" />
                  <g className="fill-muted-foreground">
                    {[200, 400, 600, 800, 1000].map(x => (
                      <polygon key={x} points={`${x},133 ${x + 10},128 ${x + 10},138`} />
                    ))}
                  </g>
                </g>
                {/* Main line track - DN direction */}
                <g>
                  <rect x="60" y="165" width="1080" height="16" fill="url(#sleepers)" />
                  <line x1="60" y1="168" x2="1140" y2="168" stroke="#475569" strokeWidth="3" />
                  <line x1="60" y1="178" x2="1140" y2="178" stroke="#475569" strokeWidth="3" />
                  <g className="fill-muted-foreground">
                    {[250, 450, 650, 850, 1050].map(x => (
                      <polygon key={x} points={`${x},173 ${x - 10},168 ${x - 10},178`} />
                    ))}
                  </g>
                </g>
                {/* Additional main line */}
                {showAdditionalLine && (
                  <g>
                    <rect x="60" y="305" width="1080" height="16" fill="url(#sleepers)" />
                    <line x1="60" y1="308" x2="1140" y2="308" stroke="#475569" strokeWidth="3" />
                    <line x1="60" y1="318" x2="1140" y2="318" stroke="#475569" strokeWidth="3" />
                    <g className="fill-muted-foreground">
                      {[300, 600, 900].map(x => (
                        <polygon key={x} points={`${x},313 ${x + 10},308 ${x + 10},318`} />
                      ))}
                    </g>
                  </g>
                )}
                {/* Block section labels */}
                {effectiveStations.slice(0, -1).map((station, idx) => {
                  const nextStation = effectiveStations[idx + 1];
                  if (!nextStation) return null;
                  const x1 = 80 + (station.cumulativeDistance / totalDistance) * 1040;
                  const x2 = 80 + (nextStation.cumulativeDistance / totalDistance) * 1040;
                  const isAT = station.signalType === 'AT';
                  const midX = (x1 + x2) / 2;
                  const wasUpgraded = localStationOverrides.get(station.code)?.signalType === 'AT';
                  return (
                    <g key={`section-${station.code}`}>
                      <rect
                        x={x1} y={110} width={x2 - x1} height={85}
                        fill={isAT ? 'rgba(34, 197, 94, 0.05)' : 'rgba(234, 179, 8, 0.05)'}
                        stroke={isAT ? 'rgba(34, 197, 94, 0.2)' : 'rgba(234, 179, 8, 0.2)'}
                        strokeDasharray={isAT ? '' : '8,4'}
                        className={wasUpgraded ? 'animate-pulse' : ''}
                      />
                      <text x={midX} y="105" textAnchor="middle" className={cn(
                        "text-[10px]",
                        wasUpgraded ? "fill-green-400 font-semibold" : "fill-muted-foreground"
                      )}>
                        {isAT ? 'Automatic Block (AT)' : 'Absolute Block (AB)'}
                        {wasUpgraded && ' ✓'}
                      </text>
                      {isAT && showSignals && (
                        <g>
                          {Array.from({ length: Math.floor((x2 - x1) / 40) }).map((_, i) => {
                            const sigX = x1 + 30 + i * 40;
                            if (sigX > x2 - 30) return null;
                            return (
                              <g key={`at-sig-${idx}-${i}`}>
                                <text x={sigX} y="98" textAnchor="middle" className="text-[7px] fill-green-500">1.2 km</text>
                                <line x1={sigX - 15} y1="100" x2={sigX + 15} y2="100" stroke="#22c55e" strokeWidth="1" strokeDasharray="2,2" />
                              </g>
                            );
                          })}
                        </g>
                      )}
                    </g>
                  );
                })}
                {/* Loop lines */}
                {showLoops && effectiveStations.filter(s => s.hasLoop).map((station) => {
                  const x = 80 + (station.cumulativeDistance / totalDistance) * 1040;
                  const isNewLoop = localStationOverrides.get(station.code)?.hasLoop && !processedStations.find(s => s.code === station.code)?.hasLoop;
                  return (
                    <g key={`loop-${station.code}`}>
                      <path
                        d={`M ${x - 50} 128 C ${x - 50} 70, ${x - 30} 50, ${x} 50 C ${x + 30} 50, ${x + 50} 70, ${x + 50} 128`}
                        fill="none" 
                        stroke={isNewLoop ? "#22c55e" : "#475569"} 
                        strokeWidth="3"
                        className={isNewLoop ? "animate-pulse" : ""}
                      />
                      <text x={x} y="40" textAnchor="middle" className={cn(
                        "text-[9px] font-medium",
                        isNewLoop ? "fill-green-400" : "fill-indigo-400"
                      )}>
                        {station.code} Loop {isNewLoop && '(NEW)'}
                      </text>
                      {showSignals && (
                        <>
                          {renderSignal(x - 45, 60, 'right', 'green')}
                          {renderSignal(x + 45, 60, 'left', 'red')}
                        </>
                      )}
                      <circle cx={x - 50} cy={128} r={4} fill={isNewLoop ? "#22c55e" : "#f97316"} />
                      <circle cx={x + 50} cy={128} r={4} fill={isNewLoop ? "#22c55e" : "#f97316"} />
                    </g>
                  );
                })}
                {/* Added crossovers visualization */}
                {Array.from(localStationOverrides.entries())
                  .filter(([_, v]) => v.hasCrossover)
                  .map(([stationCode]) => {
                    const station = effectiveStations.find(s => s.code === stationCode);
                    if (!station) return null;
                    const x = 80 + (station.cumulativeDistance / totalDistance) * 1040;
                    return (
                      <g key={`crossover-${stationCode}`}>
                        {/* Crossover lines between UP and DN tracks */}
                        <path 
                          d={`M ${x - 15} 138 L ${x + 15} 168`} 
                          stroke="#22c55e" strokeWidth="3" 
                          className="animate-pulse"
                        />
                        <path 
                          d={`M ${x + 15} 138 L ${x - 15} 168`} 
                          stroke="#22c55e" strokeWidth="3" 
                          className="animate-pulse"
                        />
                        <circle cx={x - 15} cy={138} r={4} fill="#22c55e" />
                        <circle cx={x + 15} cy={138} r={4} fill="#22c55e" />
                        <circle cx={x - 15} cy={168} r={4} fill="#22c55e" />
                        <circle cx={x + 15} cy={168} r={4} fill="#22c55e" />
                        <text x={x} y="235" textAnchor="middle" className="text-[8px] fill-green-400 font-medium">
                          Crossover (NEW)
                        </text>
                      </g>
                    );
                  })}
                {/* Cross lines */}
                {showAdditionalLine && effectiveStations.filter((_, i) => i % 3 === 1).slice(0, 2).map((station, idx) => {
                  const x = 80 + (station.cumulativeDistance / totalDistance) * 1040;
                  return (
                    <g key={`cross-${station.code}`}>
                      <path d={`M ${x - 20} 178 C ${x - 20} 220, ${x - 60} 260, ${x - 80} 308`} fill="none" stroke="#475569" strokeWidth="2.5" />
                      <path d={`M ${x + 20} 178 C ${x + 20} 220, ${x + 60} 260, ${x + 80} 308`} fill="none" stroke="#475569" strokeWidth="2.5" />
                      {showSignals && (
                        <>
                          {renderSignal(x - 30, 210, 'right', 'yellow')}
                          {renderSignal(x + 30, 210, 'left', 'yellow')}
                        </>
                      )}
                      <circle cx={x - 20} cy={178} r={4} fill="#f97316" />
                      <circle cx={x + 20} cy={178} r={4} fill="#f97316" />
                      <circle cx={x - 80} cy={308} r={4} fill="#f97316" />
                      <circle cx={x + 80} cy={308} r={4} fill="#f97316" />
                    </g>
                  );
                })}
                {/* Stations */}
                {effectiveStations.map((station) => {
                  const x = 80 + (station.cumulativeDistance / totalDistance) * 1040;
                  const override = localStationOverrides.get(station.code);
                  const hasEdits = override && (override.hasLoop || override.hasCrossover || override.signalType);
                  
                  return (
                    <g key={station.code}>
                      {/* Edit mode click area */}
                      {isEditMode && (
                        <g 
                          className="cursor-pointer" 
                          onClick={() => setSelectedStation(selectedStation === station.code ? null : station.code)}
                        >
                          <rect 
                            x={x - 45} y={100} width={90} height={120} 
                            fill="transparent" 
                            className="hover:fill-primary/10"
                          />
                        </g>
                      )}
                      
                      {renderStation(x, 155, station.code, station.hasLoop, station.isJunction)}
                      
                      {/* Edit indicator */}
                      {hasEdits && (
                        <circle cx={x + 25} cy={125} r={8} fill="#22c55e" className="animate-pulse">
                          <title>Infrastructure changes pending</title>
                        </circle>
                      )}
                      
                      {/* Edit mode selection highlight */}
                      {isEditMode && selectedStation === station.code && (
                        <rect 
                          x={x - 45} y={100} width={90} height={120} 
                          fill="none" stroke="#3b82f6" strokeWidth="2" 
                          strokeDasharray="4,2" className="animate-pulse"
                        />
                      )}
                      
                      {showSignals && (
                        <>
                          {renderSignal(x - 35, 115, 'right', 'green')}
                          {renderSignal(x + 35, 115, 'left', 'green')}
                        </>
                      )}
                      <text x={x} y={210} textAnchor="middle" className="text-[8px] fill-muted-foreground font-mono">
                        {station.cumulativeDistance.toFixed(1)} km
                      </text>
                      
                      {/* Edit popup */}
                      {isEditMode && selectedStation === station.code && (
                        <foreignObject x={x - 100} y={220} width={200} height={180}>
                          <div className="bg-white border border-slate-300 rounded-lg p-3 shadow-2xl z-50">
                            <div className="flex items-center justify-between mb-3">
                              <div className="text-sm font-bold text-slate-900">{station.code} - Infrastructure</div>
                              <button
                                onClick={() => setSelectedStation(null)}
                                className="text-slate-400 hover:text-slate-600"
                              >
                                <X className="h-4 w-4" />
                              </button>
                            </div>
                            <div className="flex flex-col gap-2">
                              {/* Loop Section */}
                              <div className="border-b border-slate-200 pb-2">
                                <div className="text-xs font-semibold text-slate-700 mb-1.5 flex items-center gap-1">
                                  <GitBranch className="h-3 w-3 text-blue-500" />
                                  Loop Line
                                </div>
                                {station.hasLoop || override?.hasLoop ? (
                                  <div className="flex items-center justify-between">
                                    <span className="text-xs text-green-600 font-medium">✓ Loop Active</span>
                                    <button
                                      onClick={() => { 
                                        handleRemoveLoop(station.code); 
                                        setSelectedStation(null); 
                                      }}
                                      className="text-xs px-2 py-1 rounded bg-red-50 text-red-600 hover:bg-red-100 transition-colors"
                                    >
                                      Remove
                                    </button>
                                  </div>
                                ) : (
                                  <button
                                    onClick={() => { handleAddLoop(station.code); setSelectedStation(null); }}
                                    className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded text-xs font-medium bg-blue-500 text-white hover:bg-blue-600 transition-colors"
                                  >
                                    <Plus className="h-3 w-3" />
                                    Add Loop Line
                                  </button>
                                )}
                                <div className="text-[10px] text-slate-500 mt-1">
                                      +2 capacity gain
                                    </div>
                              </div>
                              
                              {/* Crossover Section */}
                              <div className="border-b border-slate-200 pb-2">
                                <div className="text-xs font-semibold text-slate-700 mb-1.5 flex items-center gap-1">
                                  <ArrowRight className="h-3 w-3 text-orange-500" />
                                  Crossover
                                </div>
                                {override?.hasCrossover ? (
                                  <div className="flex items-center justify-between">
                                    <span className="text-xs text-green-600 font-medium">✓ Crossover Active</span>
                                    <button
                                      onClick={() => { 
                                        handleRemoveEdit(pendingEdits.findIndex(e => e.stationCode === station.code && e.type === 'crossover')); 
                                        setSelectedStation(null); 
                                      }}
                                      className="text-xs px-2 py-1 rounded bg-red-50 text-red-600 hover:bg-red-100 transition-colors"
                                    >
                                      Remove
                                    </button>
                                  </div>
                                ) : (
                                  <button
                                    onClick={() => { handleAddCrossover(station.code); setSelectedStation(null); }}
                                    className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded text-xs font-medium bg-orange-500 text-white hover:bg-orange-600 transition-colors"
                                  >
                                    <Plus className="h-3 w-3" />
                                    Add Crossover
                                  </button>
                                )}
                                <div className="text-[10px] text-slate-500 mt-1">
                                      +1 capacity gain
                                    </div>
                              </div>
                              
                              {/* Signal Upgrade Section */}
                              <div>
                                <div className="text-xs font-semibold text-slate-700 mb-1.5 flex items-center gap-1">
                                  <Zap className="h-3 w-3 text-green-500" />
                                  Signal Type
                                </div>
                                {station.signalType === 'AT' || override?.signalType === 'AT' ? (
                                  <div className="flex items-center justify-between">
                                    <span className="text-xs text-green-600 font-medium">✓ AT (Automatic Block)</span>
                                    {override?.signalType === 'AT' && (
                                      <button
                                        onClick={() => { 
                                          handleRemoveEdit(pendingEdits.findIndex(e => e.stationCode === station.code && e.type === 'upgrade_at')); 
                                          setSelectedStation(null); 
                                        }}
                                        className="text-xs px-2 py-1 rounded bg-red-50 text-red-600 hover:bg-red-100 transition-colors"
                                      >
                                        Revert
                                      </button>
                                    )}
                                  </div>
                                ) : (
                                  <button
                                    onClick={() => { handleUpgradeToAT(station.code); setSelectedStation(null); }}
                                    className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded text-xs font-medium bg-green-500 text-white hover:bg-green-600 transition-colors"
                                  >
                                    <Zap className="h-3 w-3" />
                                    Upgrade AB → AT
                                  </button>
                                )}
                                <div className="text-[10px] text-slate-500 mt-1">
                                      +6 capacity gain
                                    </div>
                              </div>
                            </div>
                          </div>
                        </foreignObject>
                      )}
                    </g>
                  );
                })}
                {/* Additional line stations */}
                {showAdditionalLine && processedStations.filter((_, i) => i % 2 === 1).slice(0, 3).map((station, idx) => {
                  const x = 180 + idx * 350;
                  return (
                    <g key={`add-${idx}`}>
                      {renderStation(x, 335, `S${idx + 4}`, false, false)}
                      {showSignals && (
                        <>
                          {renderSignal(x - 35, 295, 'right', 'green')}
                          {renderSignal(x + 35, 295, 'left', 'green')}
                        </>
                      )}
                    </g>
                  );
                })}
                {/* Trains from simulation */}
                {displayTrains.map(train => renderTrain(train, 133))}
                {/* Legend */}
                <g transform="translate(60, 420)">
                  <rect x={0} y={0} width={1080} height={70} fill="rgba(30, 41, 59, 0.5)" rx={4} />
                  <text x={20} y={20} className="text-[11px] fill-foreground font-semibold">Legend:</text>
                  
                  <rect x={20} y={30} width={40} height={20} fill="rgba(234, 179, 8, 0.2)" stroke="#eab308" strokeDasharray="4,2" rx={2} />
                  <text x={70} y={43} className="text-[9px] fill-muted-foreground">[AB] Absolute Block</text>
                  
                  <rect x={220} y={30} width={40} height={20} fill="rgba(34, 197, 94, 0.2)" stroke="#22c55e" rx={2} />
                  <text x={270} y={43} className="text-[9px] fill-muted-foreground">[AT] Automatic Block</text>
                  
                  <g transform="translate(430, 35)">
                    <rect x={0} y={-5} width={8} height={18} fill="#1e293b" rx={1} />
                    <circle cx={4} cy={-1} r={3} fill="#ef4444" />
                    <circle cx={4} cy={6} r={3} fill="#374151" />
                    <circle cx={4} cy={13} r={3} fill="#374151" />
                  </g>
                  <text x={450} y={43} className="text-[9px] fill-muted-foreground">Signal</text>
                  
                  <circle cx={530} cy={40} r={5} fill="#f97316" />
                  <text x={545} y={43} className="text-[9px] fill-muted-foreground">Points</text>
                  
                  <rect x={610} y={32} width={30} height={14} rx={3} fill="#3b82f6" />
                  <text x={650} y={43} className="text-[9px] fill-muted-foreground">Train</text>
                  
                  {/* Commodity colors */}
                  <text x={720} y={20} className="text-[9px] fill-muted-foreground">Commodities:</text>
                  <rect x={720} y={30} width={16} height={12} rx={2} fill={commodityColors.COAL} />
                  <text x={740} y={40} className="text-[7px] fill-muted-foreground">Coal</text>
                  <rect x={780} y={30} width={16} height={12} rx={2} fill={commodityColors.IRON} />
                  <text x={800} y={40} className="text-[7px] fill-muted-foreground">Iron</text>
                  <rect x={840} y={30} width={16} height={12} rx={2} fill={commodityColors.CEMENT} />
                  <text x={860} y={40} className="text-[7px] fill-muted-foreground">Cement</text>
                  <rect x={920} y={30} width={16} height={12} rx={2} fill={commodityColors.OIL} />
                  <text x={940} y={40} className="text-[7px] fill-muted-foreground">Oil</text>
                  <rect x={980} y={30} width={16} height={12} rx={2} fill={commodityColors.FOOD} />
                  <text x={1000} y={40} className="text-[7px] fill-muted-foreground">Food</text>
                </g>
              </svg>
            </div>
            <ScrollBar orientation="horizontal" />
          </ScrollArea>
        </CardContent>
      </Card>

      {/* Train List */}
      <Card className="bg-card/50 backdrop-blur border-border/50">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Database className="h-4 w-4" />
            Freight Trains from Simulation ({displayTrains.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
            {displayTrains.map(train => (
              <div
                key={train.id}
                className={cn(
                  'p-3 rounded-lg border cursor-pointer transition-all hover:scale-[1.02]',
                  selectedTrain === train.id ? 'border-primary bg-primary/10 ring-2 ring-primary/20' : 'border-border/50 hover:border-primary/50',
                  train.status === 'halted' && 'border-red-500/50 bg-red-500/10'
                )}
                onClick={() => setSelectedTrain(selectedTrain === train.id ? null : train.id)}
              >
                <div className="flex items-center gap-2 mb-1">
                  <div className="w-4 h-4 rounded-full" style={{ backgroundColor: train.color }} />
                  <span className="text-sm font-mono font-semibold truncate">{train.loadId}</span>
                </div>
                <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                  <span className="flex items-center gap-1">
                    {train.direction === 'UP' ? <ArrowRight className="h-3 w-3" /> : <ArrowLeft className="h-3 w-3" />}
                    {train.speed.toFixed(0)} km/h
                  </span>
                  <Badge
                    variant="outline"
                    className={cn(
                      'text-[9px] px-1',
                      train.status === 'running' && 'bg-green-500/20 text-green-500',
                      train.status === 'halted' && 'bg-red-500/20 text-red-500',
                      train.status === 'stopped' && 'bg-yellow-500/20 text-yellow-500'
                    )}
                  >
                    {train.status}
                  </Badge>
                </div>
                <div className="text-[10px] text-muted-foreground">
                  {train.commodity && (
                    <span className="inline-flex items-center gap-1 mr-2">
                      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: train.color }} />
                      {train.commodity}
                    </span>
                  )}
                  @ {train.currentStation}
                </div>
                {train.destination && (
                  <div className="text-[10px] text-blue-400 mt-1">
                    → {train.destination}
                  </div>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Save Confirmation Dialog */}
      <AlertDialog open={showSaveDialog} onOpenChange={setShowSaveDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Save className="h-5 w-5 text-primary" />
              Save Infrastructure Changes
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>You are about to save {pendingEdits.length} infrastructure changes:</p>
                
                <div className="bg-muted/50 rounded-lg p-3 space-y-2 max-h-48 overflow-y-auto">
                  {pendingEdits.map((edit, idx) => (
                    <div key={idx} className="flex items-center justify-between text-sm">
                      <span className="flex items-center gap-2">
                        {edit.type === 'loop' && <GitBranch className="h-4 w-4 text-blue-500" />}
                        {edit.type === 'crossover' && <ArrowRight className="h-4 w-4 text-orange-500" />}
                        {edit.type === 'upgrade_at' && <Zap className="h-4 w-4 text-green-500" />}
                        <span className="font-mono">{edit.stationCode}</span>
                        <span className="text-muted-foreground">
                          {edit.type === 'loop' ? 'Loop Line' : edit.type === 'crossover' ? 'Crossover' : 'AB→AT Upgrade'}
                        </span>
                      </span>
                      <Badge variant="outline" className="text-green-500">
                        +{edit.type === 'loop' ? 2 : edit.type === 'crossover' ? 1 : 6} capacity
                      </Badge>
                    </div>
                  ))}
                </div>
                <div className="flex items-center justify-between text-sm border-t pt-2">
                  <span className="font-medium">Total Capacity Gain:</span>
                  <Badge className="bg-green-500/20 text-green-500">
                    +{pendingEdits.reduce((sum, e) => 
                      sum + (e.type === 'loop' ? 2 : e.type === 'crossover' ? 1 : 6), 0
                    )} trains/hr
                  </Badge>
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isSaving}>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleConfirmSave} 
              disabled={isSaving}
              className="bg-primary"
            >
              {isSaving ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="h-4 w-4 mr-2" />
                  Save Changes
                </>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function KPICard({ label, value, icon, highlight = false }: { label: string; value: string | number; icon: React.ReactNode; highlight?: boolean }) {
  return (
    <Card className={cn('bg-card/50 backdrop-blur border-border/50', highlight && 'border-red-500/50 bg-red-500/10')}>
      <CardContent className="p-2">
        <div className="flex items-center gap-1.5">
          <div className="text-muted-foreground">{icon}</div>
          <div>
            <p className="text-[10px] text-muted-foreground">{label}</p>
            <p className="text-sm font-bold">{value}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

