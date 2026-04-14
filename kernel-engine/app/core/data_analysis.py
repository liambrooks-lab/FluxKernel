from __future__ import annotations

import base64
import json
from pathlib import Path

from app.core.persona_engine import AttachmentContext, DataAnalysisResponse, DataArtifact
from app.tools.code_executor import execute_code_sync
from app.tools.file_manager import WORKSPACE_DIR


def run_analysis_code(
    prompt: str,
    python_code: str,
    attachments: list[AttachmentContext],
) -> DataAnalysisResponse:
    analysis_dir = WORKSPACE_DIR / "analysis_outputs"
    analysis_dir.mkdir(parents=True, exist_ok=True)

    dataset_manifest = [
        {
            "filename": attachment.filename,
            "stored_path": str((WORKSPACE_DIR / attachment.stored_path).resolve()),
            "media_type": attachment.media_type,
            "relative_path": attachment.relative_path or attachment.filename,
        }
        for attachment in attachments
    ]

    scaffold = f"""
import base64
import json
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import pandas as pd

PROMPT = {prompt!r}
DATASETS = {json.dumps(dataset_manifest, indent=2)}
ANALYSIS_DIR = Path({str(analysis_dir)!r})
ANALYSIS_DIR.mkdir(parents=True, exist_ok=True)
GENERATED_ARTIFACTS = []

def save_chart(fig, stem, description):
    png_path = ANALYSIS_DIR / f"{{stem}}.png"
    b64_path = ANALYSIS_DIR / f"{{stem}}.b64.txt"
    fig.savefig(png_path, bbox_inches="tight", dpi=160)
    plt.close(fig)
    encoded = base64.b64encode(png_path.read_bytes()).decode("utf-8")
    b64_path.write_text(encoded, encoding="utf-8")
    GENERATED_ARTIFACTS.append({{
        "path": str(png_path),
        "media_type": "image/png",
        "description": description,
    }})
    GENERATED_ARTIFACTS.append({{
        "path": str(b64_path),
        "media_type": "text/plain",
        "description": f"Base64 export for {{png_path.name}}",
    }})

{python_code}

print(json.dumps({{"artifacts": GENERATED_ARTIFACTS}}))
""".strip()

    result = execute_code_sync(scaffold, language="python", timeout=90)
    stdout = result.get("stdout", "").strip()
    stderr = result.get("stderr", "").strip()

    artifacts: list[DataArtifact] = []
    if stdout:
        for line in reversed(stdout.splitlines()):
            line = line.strip()
            if not line.startswith("{"):
                continue
            try:
                payload = json.loads(line)
            except json.JSONDecodeError:
                continue
            for item in payload.get("artifacts", []):
                path = Path(item["path"])
                try:
                    relative_path = path.resolve().relative_to(WORKSPACE_DIR.resolve()).as_posix()
                except ValueError:
                    relative_path = path.name
                artifacts.append(
                    DataArtifact(
                        path=relative_path,
                        media_type=item.get("media_type", "application/octet-stream"),
                        description=item.get("description", path.name),
                    )
                )
            break

    insights: list[str] = []
    if stdout:
        insights.extend(
            line.strip() for line in stdout.splitlines()[:-1] if line.strip()
        )
    if not result.get("success"):
        insights.append("Python analysis execution failed. Review stderr for the exact exception.")

    return DataAnalysisResponse(
        summary="Executed the requested analysis in the pandas/matplotlib sandbox.",
        insights=insights,
        output_files=artifacts,
        stdout=stdout,
        stderr=stderr,
    )

