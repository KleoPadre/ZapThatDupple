from sqlalchemy import Column, Integer, String, Float, Text, Boolean, DateTime, LargeBinary
from sqlalchemy.orm import DeclarativeBase
from datetime import datetime


class Base(DeclarativeBase):
    pass


class ProcessedFile(Base):
    __tablename__ = "processed_files"

    id = Column(Integer, primary_key=True, index=True)
    path = Column(String, unique=True, index=True, nullable=False)
    file_type = Column(String, nullable=False)  # image, video, audio, document
    size = Column(Integer)
    mtime = Column(Float)
    md5_hash = Column(String, index=True)
    phash = Column(String, index=True)  # perceptual hash for images
    embedding_model = Column(String)
    embedding = Column(LargeBinary)  # numpy array serialized
    processed_at = Column(DateTime, default=datetime.utcnow)
    error = Column(Text, nullable=True)


class DuplicateGroup(Base):
    __tablename__ = "duplicate_groups"

    id = Column(Integer, primary_key=True, index=True)
    group_id = Column(String, index=True)
    file_path = Column(String, index=True)
    similarity = Column(Float)
    match_type = Column(String)  # exact, near, semantic
    created_at = Column(DateTime, default=datetime.utcnow)


class ScanSession(Base):
    __tablename__ = "scan_sessions"

    id = Column(Integer, primary_key=True, index=True)
    folders = Column(Text)  # JSON list of folders
    model_image = Column(String)
    model_text = Column(String)
    status = Column(String, default="idle")  # idle, scanning, processing, comparing, done
    total_files = Column(Integer, default=0)
    processed_files = Column(Integer, default=0)
    started_at = Column(DateTime, default=datetime.utcnow)
    finished_at = Column(DateTime, nullable=True)
