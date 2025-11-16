# backend/app/db/models_sim.py
from sqlalchemy import Column, Integer, String, DateTime, Text, text
from sqlalchemy.orm import Mapped, mapped_column
from datetime import datetime
from app.db.models import Base


class OverrideLog(Base):
    __tablename__ = "override_logs"
    
    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True, autoincrement=True)
    run_id: Mapped[str] = mapped_column(String(128), index=True)
    train_id: Mapped[str] = mapped_column(String(64), index=True)
    section: Mapped[str] = mapped_column(String(128))
    enter_ts: Mapped[str] = mapped_column(String(64))
    leave_ts: Mapped[str] = mapped_column(String(64))
    reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=text("CURRENT_TIMESTAMP"))

