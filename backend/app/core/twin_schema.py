from typing import Dict, List, Optional
from pydantic import BaseModel, Field


class Station(BaseModel):
    station_id: str = Field(..., description="Unique station identifier (code)")
    name: Optional[str] = None
    lat: Optional[float] = None
    lon: Optional[float] = None
    platforms: Optional[int] = 0


class Section(BaseModel):
    section_id: str = Field(..., description="Unique section id, e.g. from-to code")
    from_station: str
    to_station: str
    length_km: float = 1.0
    speed_limit_kmph: Optional[float] = 80.0


class Division(BaseModel):
    division_id: str
    name: Optional[str]
    stations: Dict[str, Station] = {}
    sections: Dict[str, Section] = {}


class TwinGraph(BaseModel):
    division: Division
    # adjacency lists: from -> list of section ids
    adjacency: Dict[str, List[str]] = {}

    def nodes(self) -> List[str]:
        return list(self.division.stations.keys())

    def edges(self) -> List[Section]:
        return list(self.division.sections.values())
