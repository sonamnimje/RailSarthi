export type StationCategory = 'junction' | 'crossing' | 'block'

export interface Station {
  id: number
  name: string
  code: string
  km: number
  category: StationCategory
  notes?: string
}

export interface BlockSection {
  id: string
  fromStationId: number
  toStationId: number
  name: string
  lengthKm: number
  remarks?: string
}

export type SignalType = 'home' | 'starter' | 'distant'

export interface Signal {
  id: string
  stationId: number
  direction: 'up' | 'down'
  type: SignalType
}

export interface TrainStop {
  stationId: number
  arrival: string
  departure: string
  remarks?: string
  crossingWith?: string
}

export type TrainType = 'express' | 'passenger' | 'superfast' | 'goods'

export interface Train {
  id: number
  number: string
  name: string
  type: TrainType
  direction: 'up' | 'down'
  schedule: TrainStop[]
}

export const stations: Station[] = [
  { id: 1, name: 'Bhusaval Jn', code: 'BSL', km: 0, category: 'junction', notes: 'Crew / Yard Control' },
  { id: 2, name: 'Varangaon', code: 'VRJ', km: 18, category: 'block' },
  { id: 3, name: 'Bodwad', code: 'BDWD', km: 43, category: 'block' },
  { id: 4, name: 'Raver', code: 'RV', km: 61, category: 'crossing', notes: 'Crossing loop' },
  { id: 5, name: 'Burhanpur', code: 'BAU', km: 74, category: 'junction', notes: 'Control Cabin' },
  { id: 6, name: 'Nepanagar', code: 'NPNR', km: 98, category: 'crossing' },
  { id: 7, name: 'Chhanera', code: 'CAER', km: 121, category: 'block' },
  { id: 8, name: 'Khandwa Jn', code: 'KNW', km: 132, category: 'junction', notes: 'Division Boundary' }
]

export const blockSections: BlockSection[] = [
  { id: 'BSL-VRJ', fromStationId: 1, toStationId: 2, name: 'BSL - VRJ', lengthKm: 18, remarks: 'Double line' },
  { id: 'VRJ-BDWD', fromStationId: 2, toStationId: 3, name: 'VRJ - BDWD', lengthKm: 25 },
  { id: 'BDWD-RV', fromStationId: 3, toStationId: 4, name: 'BDWD - RV', lengthKm: 18, remarks: 'Automatic block' },
  { id: 'RV-BAU', fromStationId: 4, toStationId: 5, name: 'RV - BAU', lengthKm: 13, remarks: 'Neutral section' },
  { id: 'BAU-NPNR', fromStationId: 5, toStationId: 6, name: 'BAU - NPNR', lengthKm: 24 },
  { id: 'NPNR-CAER', fromStationId: 6, toStationId: 7, name: 'NPNR - CAER', lengthKm: 23 },
  { id: 'CAER-KNW', fromStationId: 7, toStationId: 8, name: 'CAER - KNW', lengthKm: 11, remarks: 'Approach controlled' }
]

export const signals: Signal[] = [
  { id: 'BSL-UP-H', stationId: 1, direction: 'up', type: 'home' },
  { id: 'BSL-UP-S', stationId: 1, direction: 'up', type: 'starter' },
  { id: 'BSL-DN-H', stationId: 1, direction: 'down', type: 'home' },
  { id: 'BSL-DN-S', stationId: 1, direction: 'down', type: 'starter' },
  { id: 'VRJ-UP-H', stationId: 2, direction: 'up', type: 'home' },
  { id: 'VRJ-UP-S', stationId: 2, direction: 'up', type: 'starter' },
  { id: 'VRJ-DN-H', stationId: 2, direction: 'down', type: 'home' },
  { id: 'VRJ-DN-S', stationId: 2, direction: 'down', type: 'starter' },
  { id: 'BDWD-UP-H', stationId: 3, direction: 'up', type: 'home' },
  { id: 'BDWD-DN-H', stationId: 3, direction: 'down', type: 'home' },
  { id: 'RV-UP-H', stationId: 4, direction: 'up', type: 'home' },
  { id: 'RV-UP-S', stationId: 4, direction: 'up', type: 'starter' },
  { id: 'RV-DN-H', stationId: 4, direction: 'down', type: 'home' },
  { id: 'RV-DN-S', stationId: 4, direction: 'down', type: 'starter' },
  { id: 'BAU-UP-H', stationId: 5, direction: 'up', type: 'home' },
  { id: 'BAU-UP-S', stationId: 5, direction: 'up', type: 'starter' },
  { id: 'BAU-DN-H', stationId: 5, direction: 'down', type: 'home' },
  { id: 'BAU-DN-S', stationId: 5, direction: 'down', type: 'starter' },
  { id: 'NPNR-UP-H', stationId: 6, direction: 'up', type: 'home' },
  { id: 'NPNR-DN-H', stationId: 6, direction: 'down', type: 'home' },
  { id: 'CAER-UP-H', stationId: 7, direction: 'up', type: 'home' },
  { id: 'CAER-DN-H', stationId: 7, direction: 'down', type: 'home' },
  { id: 'KNW-UP-H', stationId: 8, direction: 'up', type: 'home' },
  { id: 'KNW-UP-S', stationId: 8, direction: 'up', type: 'starter' },
  { id: 'KNW-DN-H', stationId: 8, direction: 'down', type: 'home' },
  { id: 'KNW-DN-S', stationId: 8, direction: 'down', type: 'starter' }
]

export const trains: Train[] = [
  {
    id: 1,
    number: '12812',
    name: 'Amarkantak Express',
    type: 'superfast',
    direction: 'up',
    schedule: [
      { stationId: 1, arrival: '04:10', departure: '04:10', remarks: 'Right time start' },
      { stationId: 2, arrival: '04:34', departure: '04:36' },
      { stationId: 3, arrival: '05:05', departure: '05:07' },
      { stationId: 4, arrival: '05:30', departure: '05:32' },
      { stationId: 5, arrival: '06:03', departure: '06:06', crossingWith: '12811', remarks: 'Loop line halt' },
      { stationId: 6, arrival: '06:26', departure: '06:28' },
      { stationId: 7, arrival: '07:00', departure: '07:02' },
      { stationId: 8, arrival: '07:25', departure: '07:25', remarks: 'Terminate at KNW' }
    ]
  },
  {
    id: 2,
    number: '22131',
    name: 'Bhusaval Passenger',
    type: 'passenger',
    direction: 'up',
    schedule: [
      { stationId: 1, arrival: '06:10', departure: '06:10' },
      { stationId: 2, arrival: '06:36', departure: '06:38' },
      { stationId: 3, arrival: '07:10', departure: '07:13' },
      { stationId: 4, arrival: '07:45', departure: '07:50', remarks: 'Crossing loop occupied' },
      { stationId: 5, arrival: '08:25', departure: '08:35' },
      { stationId: 6, arrival: '09:05', departure: '09:15' },
      { stationId: 7, arrival: '09:55', departure: '10:00' },
      { stationId: 8, arrival: '10:35', departure: '10:35' }
    ]
  },
  {
    id: 3,
    number: 'GDS-61',
    name: 'Up Goods Special',
    type: 'goods',
    direction: 'up',
    schedule: [
      { stationId: 1, arrival: '09:45', departure: '09:45' },
      { stationId: 2, arrival: '10:25', departure: '10:40' },
      { stationId: 3, arrival: '11:25', departure: '11:55' },
      { stationId: 4, arrival: '12:40', departure: '13:10' },
      { stationId: 5, arrival: '14:00', departure: '14:30' },
      { stationId: 6, arrival: '15:15', departure: '15:45', crossingWith: 'GDS-62' },
      { stationId: 7, arrival: '16:30', departure: '17:00' },
      { stationId: 8, arrival: '17:35', departure: '17:35' }
    ]
  },
  {
    id: 4,
    number: '12811',
    name: 'Amarkantak Express',
    type: 'superfast',
    direction: 'down',
    schedule: [
      { stationId: 8, arrival: '05:05', departure: '05:05' },
      { stationId: 7, arrival: '05:28', departure: '05:30' },
      { stationId: 6, arrival: '05:58', departure: '06:00' },
      { stationId: 5, arrival: '06:03', departure: '06:07', crossingWith: '12812' },
      { stationId: 4, arrival: '06:58', departure: '07:00' },
      { stationId: 3, arrival: '07:25', departure: '07:27' },
      { stationId: 2, arrival: '07:55', departure: '07:57' },
      { stationId: 1, arrival: '08:15', departure: '08:15', remarks: 'Arrival into BSL yard' }
    ]
  },
  {
    id: 5,
    number: '22132',
    name: 'Khandwa Passenger',
    type: 'passenger',
    direction: 'down',
    schedule: [
      { stationId: 8, arrival: '09:45', departure: '09:45' },
      { stationId: 7, arrival: '10:20', departure: '10:25' },
      { stationId: 6, arrival: '10:55', departure: '11:05' },
      { stationId: 5, arrival: '11:35', departure: '11:45' },
      { stationId: 4, arrival: '12:15', departure: '12:22' },
      { stationId: 3, arrival: '12:50', departure: '12:55' },
      { stationId: 2, arrival: '13:20', departure: '13:25' },
      { stationId: 1, arrival: '13:45', departure: '13:45' }
    ]
  },
  {
    id: 6,
    number: 'GDS-62',
    name: 'Down Goods Special',
    type: 'goods',
    direction: 'down',
    schedule: [
      { stationId: 8, arrival: '11:10', departure: '11:10' },
      { stationId: 7, arrival: '11:45', departure: '12:10' },
      { stationId: 6, arrival: '12:45', departure: '13:15', crossingWith: 'GDS-61' },
      { stationId: 5, arrival: '14:00', departure: '14:30' },
      { stationId: 4, arrival: '15:05', departure: '15:35' },
      { stationId: 3, arrival: '16:10', departure: '16:40' },
      { stationId: 2, arrival: '17:15', departure: '17:45' },
      { stationId: 1, arrival: '18:20', departure: '18:20' }
    ]
  }
]

