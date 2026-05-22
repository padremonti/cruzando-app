"""Utilidades TTS para talleres de sanar.html (s{mundo}_{retiro}.json)"""

import json
import logging
import re
from pathlib import Path

import gradio as gr
import requests

from config import (
    OPENAI_API_KEY, AUDIO_API_URL, TTS_MODEL, AUDIO_FORMAT,
    OUTPUT_DIR, TTS_COST_PER_CHAR,
)

logger = logging.getLogger(__name__)

# Convención de nombres
# s{m}_{r}_bienvenida.mp3     → introduccion.texto
# s{m}_{r}_{N}.mp3            → misterios[N].contemplacion.texto
# s{m}_{r}_{N}_oracion.mp3   → misterios[N].oracion.texto

TALLER_SECTIONS = [
    ("bienvenida",    "Bienvenida del taller"),
    ("contemplacion", "Contemplación"),
    ("oracion",       "Oración"),
]

TALLER_VOICE = "nova"
TALLER_INSTRUCTIONS = (
    "Voz femenina, maternal, cálida y contemplativa. "
    "Habla despacio, con pausas naturales entre párrafos. "
    "Tono de acompañamiento pastoral, no de locución comercial."
)


def discover_taller_json_files() -> list:
    """Busca archivos s*.json en el directorio actual."""
    return sorted(p.name for p in Path(".").glob("s*.json"))


def load_taller_json(filename: str) -> dict:
    if not filename:
        raise gr.Error("Selecciona un archivo JSON de taller.")
    path = Path(filename)
    if not path.exists():
        raise gr.Error(f"No encontré el archivo: {filename}")
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def save_taller_json(filename: str, data: dict) -> None:
    path = Path(filename)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)


def get_slug_parts(filename: str) -> tuple:
    """s1_2.json → mundo=1, retiro=2"""
    stem = Path(filename).stem  # "s1_2"
    parts = stem.lstrip("s").split("_")
    if len(parts) >= 2:
        return parts[0], parts[1]
    return "1", "1"


def build_taller_filename(filename: str, section_type: str, misterio_num: int = None) -> str:
    """
    section_type: 'bienvenida' | 'contemplacion' | 'oracion'
    misterio_num: requerido para contemplacion y oracion
    """
    stem = Path(filename).stem  # "s1_2"
    if section_type == "bienvenida":
        return f"{stem}_bienvenida.mp3"
    elif section_type == "contemplacion":
        return f"{stem}_{misterio_num}.mp3"
    elif section_type == "oracion":
        return f"{stem}_{misterio_num}_oracion.mp3"
    return f"{stem}_unknown.mp3"


def get_misterio_text(data: dict, misterio_idx: int, section_type: str) -> str:
    """Obtiene el texto del campo correcto según section_type."""
    misterios = data.get("misterios", [])
    if misterio_idx < 0 or misterio_idx >= len(misterios):
        return ""
    m = misterios[misterio_idx]
    if section_type == "contemplacion":
        return m.get("contemplacion", {}).get("texto", "")
    elif section_type == "oracion":
        return m.get("oracion", {}).get("texto", "")
    return ""


def get_intro_text(data: dict) -> str:
    return data.get("introduccion", {}).get("texto", "")


def misterio_choices(data: dict) -> list:
    """Lista '1 — Nombre' para dropdown de misterios."""
    return [
        f"{i+1} — {m.get('nombre', f'Misterio {i+1}')}"
        for i, m in enumerate(data.get("misterios", []))
    ]


def generate_taller_audio(
    text: str,
    out_filename: str,
    speed: float = 1.0,
) -> tuple:
    """Genera el MP3 y lo guarda en OUTPUT_DIR. Devuelve (path, cost)."""
    if not OPENAI_API_KEY:
        raise gr.Error("No encontré OPENAI_API_KEY en tu archivo .env")
    if not text or not text.strip():
        raise gr.Error("El texto está vacío.")

    out_path = OUTPUT_DIR / out_filename
    headers = {
        "Authorization": f"Bearer {OPENAI_API_KEY}",
        "Content-Type": "application/json",
    }
    payload = {
        "model": TTS_MODEL,
        "voice": TALLER_VOICE,
        "input": text.strip(),
        "response_format": AUDIO_FORMAT,
        "instructions": TALLER_INSTRUCTIONS,
        "speed": round(speed, 2),
    }
    try:
        r = requests.post(AUDIO_API_URL, headers=headers, json=payload, timeout=180)
        r.raise_for_status()
    except requests.HTTPError as e:
        detail = ""
        try:
            detail = r.json()
        except Exception:
            detail = r.text
        raise gr.Error(f"Error HTTP: {detail}") from e
    except Exception as e:
        raise gr.Error(f"Error de conexión: {e}") from e

    with open(out_path, "wb") as f:
        f.write(r.content)

    cost = len(text.strip()) * TTS_COST_PER_CHAR.get(TTS_MODEL, 15 / 1_000_000)
    return str(out_path), cost


def save_taller_field(filename: str, section_type: str, misterio_idx: int, new_text: str) -> str:
    """Guarda el texto editado de vuelta al JSON del taller."""
    try:
        data = load_taller_json(filename)
        if section_type == "bienvenida":
            data.setdefault("introduccion", {})["texto"] = new_text.strip()
        elif section_type in ("contemplacion", "oracion"):
            misterios = data.get("misterios", [])
            if 0 <= misterio_idx < len(misterios):
                data["misterios"][misterio_idx].setdefault(section_type, {})["texto"] = new_text.strip()
        save_taller_json(filename, data)
        return f"✅ Guardado en {filename}"
    except Exception as e:
        return f"❌ Error al guardar: {e}"


def check_audio_status(filename: str, data: dict) -> str:
    """Revisa qué audios existen ya en OUTPUT_DIR."""
    stem = Path(filename).stem
    lines = []
    f_bien = OUTPUT_DIR / f"{stem}_bienvenida.mp3"
    lines.append(f"{'✅' if f_bien.exists() else '❌'} {stem}_bienvenida.mp3")
    for i, m in enumerate(data.get("misterios", []), start=1):
        nombre = m.get("nombre", f"Misterio {i}")[:30]
        f_cont = OUTPUT_DIR / f"{stem}_{i}.mp3"
        f_orac = OUTPUT_DIR / f"{stem}_{i}_oracion.mp3"
        lines.append(f"  {'✅' if f_cont.exists() else '❌'} {stem}_{i}.mp3  ({nombre})")
        lines.append(f"  {'✅' if f_orac.exists() else '❌'} {stem}_{i}_oracion.mp3")
    return "\n".join(lines)
