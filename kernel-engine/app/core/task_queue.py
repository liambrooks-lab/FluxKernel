"""
task_queue.py — Celery application singleton for FluxKernel async task dispatch.

Workers are started separately via:
    celery -A app.core.task_queue.celery_app worker --loglevel=info

The broker and result backend both default to localhost Redis but are
overridable via CELERY_BROKER_URL / CELERY_RESULT_BACKEND in the environment.
"""
import os
from celery import Celery

BROKER_URL = os.getenv("CELERY_BROKER_URL", "redis://localhost:6379/0")
RESULT_BACKEND = os.getenv("CELERY_RESULT_BACKEND", "redis://localhost:6379/1")

celery_app = Celery(
    "fluxkernel",
    broker=BROKER_URL,
    backend=RESULT_BACKEND,
)

celery_app.conf.update(
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    timezone="UTC",
    enable_utc=True,
    # Tasks results expire after 1 hour to keep Redis lean
    result_expires=3600,
    # Prevent tasks from running forever
    task_time_limit=600,       # hard kill at 10 min
    task_soft_time_limit=540,  # SIGTERM at 9 min (allows cleanup)
    # Auto-discover tasks in the tools package
    imports=["app.tools.code_executor"],
)
