import json
import os
import re
from pathlib import Path

import gradio as gr
from gradio.themes import Soft
import requests
from dotenv import load_dotenv

load_dotenv()

OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")

# --- Endpoints / modelos ---
AUDIO_API_URL = "https://api.openai.com/v1/audio/speech"
RESPONSES_API_URL = "https://api.openai.com/v1/responses"

TTS_MODEL = "tts-1"
TEXT_MODEL = "gpt-4o-mini"
AUDIO_FORMAT = "mp3"

OUTPUT_DIR = Path("tts_outputs")
OUTPUT_DIR.mkdir(exist_ok=True)

# --- Secciones activas ---
SECTION_CODES = {
    "Bienvenida": "START",
    "Camino y Palabra": "UBIBLE",
    "Contemplacion": "CONT",
    "Canto": "M",
    "Pregunta A": "QA",
    "Pregunta B": "QB",
    "Pregunta C": "QC",
    "Oracion final": "PRAY",
    "Despedida": "BYE",
}

SECTION_VOICES = {
    "Bienvenida": "nova",
    "Camino y Palabra": "onyx",
    "Contemplacion": "alloy",
    "Canto": None,  # no TTS
    "Pregunta A": "alloy",
    "Pregunta B": "alloy",
    "Pregunta C": "alloy",
    "Oracion final": "onyx",
    "Despedida": "nova",
}

SECTION_INSTRUCTIONS = {
    "Bienvenida": (
        "Voz femenina adulta, cálida, reconfortante y luminosa. "
        "Tono acogedor, sereno y esperanzador. "
        "Debe sonar como una presencia buena que recibe con ternura, paz y confianza. "
        "Ritmo pausado y natural. "
        "Respeta la puntuación y deja reposar las frases. "
        "Dicción clara en español mexicano."
        "Mantén un ritmo sereno."
        "Evita exageraciones."
        "Respeta pausas naturales."
        "No sobreactúes."
    ),
    "Camino y Palabra": (
        "Voz masculina adulta, serena, sobria y protectora. "
        "Tono paterno, confiable y estable, con firmeza tranquila. "
        "Debe sonar como un guía silencioso que orienta y proclama con claridad y cercanía. "
        "No es dura, no es distante, no es teatral. "
        "Evita cualquier dramatismo o exceso de solemnidad. "
        "Mantiene un tono recogido, reverente y estable. "
        "Habla con pausas claras entre frases. "
        "No unas las oraciones. "
        "Deja que cada idea repose. "
        "Ritmo pausado, con autoridad humilde y calidez contenida. "
        "Respeta la puntuación y permite silencios naturales. "
        "Dicción clara en español mexicano."
        "Mantén un ritmo sereno."
        "Evita exageraciones."
        "Respeta pausas naturales."
        "No sobreactúes."
    ),
    "Contemplacion": (
        "Voz masculina joven-adulta, cercana, clara y contemplativa. "
        "Tono fraterno, humano y caminante. "
        "Natural, íntimo y sereno. "
        "Ritmo pausado, con respiración suave y buena intención espiritual. "
        "Habla con sensibilidad y cercanía, respetando la puntuación. "
        "Deja reposar las frases. "
        "Dicción clara en español mexicano."
        "Mantén un ritmo sereno."
        "Evita exageraciones."
        "Respeta pausas naturales."
        "No sobreactúes."
    ),
    "Pregunta A": (
        "Voz masculina joven-adulta, cercana, clara y contemplativa. "
        "Formula la pregunta con calma, hondura y sencillez. "
        "Tono fraterno, íntimo y orante. "
        "Que la pregunta se formule con naturalidad. "
        "Habla con pausas claras entre frases. "
        "No unas las oraciones. "
        "Respeta la puntuación y mantiene un ritmo pausado. "
        "Dicción clara en español mexicano."
        "Mantén un ritmo sereno."
        "Evita exageraciones."
        "Respeta pausas naturales."
        "No sobreactúes."
    ),
    "Pregunta B": (
        "Voz masculina joven-adulta, cercana, clara y contemplativa. "
        "Formula la pregunta con calma, hondura y sencillez. "
        "Tono fraterno, íntimo y orante. "
        "Que la pregunta se formule con naturalidad. "
        "Habla con pausas claras entre frases. "
        "No unas las oraciones. "
        "Respeta la puntuación y mantiene un ritmo pausado. "
        "Dicción clara en español mexicano."
        "Mantén un ritmo sereno."
        "Evita exageraciones."
        "Respeta pausas naturales."
        "No sobreactúes."
    ),
    "Pregunta C": (
        "Voz masculina joven-adulta, cercana, clara y contemplativa. "
        "Formula la pregunta con calma, hondura y sencillez. "
        "Tono fraterno, íntimo y orante. "
        "Que la pregunta se formule con naturalidad. "
        "Habla con pausas claras entre frases. "
        "No unas las oraciones. "
        "Respeta la puntuación y mantiene un ritmo pausado. "
        "Dicción clara en español mexicano."
        "Mantén un ritmo sereno."
        "Evita exageraciones."
        "Respeta pausas naturales."
        "No sobreactúes."
    ),
    "Oracion final": (
        "Voz masculina adulta, serena, sobria y protectora. "
        "Tono paterno, confiable y estable, con firmeza tranquila. "
        "Debe sonar como un guía silencioso que orienta y proclama con claridad y cercanía. "
        "No es dura, no es distante, no es teatral. "
        "Evita cualquier dramatismo o exceso de solemnidad. "
        "Mantiene un tono recogido, reverente y estable. "
        "Habla con pausas claras entre frases. "
        "No unas las oraciones. "
        "Deja que cada idea repose. "
        "Ritmo pausado, con autoridad humilde y calidez contenida. "
        "Respeta la puntuación y permite silencios naturales. "
        "Dicción clara en español mexicano."
        "Mantén un ritmo sereno."
        "Evita exageraciones."
        "Respeta pausas naturales."
        "No sobreactúes."
    ),
    "Despedida": (
        "Voz femenina adulta, cálida, cercana y luminosa. "
        "Tono casual, alegre y motivador. "
        "Deja al oyente con ánimo, paz y deseo de seguir caminando. "
        "No es solemne ni distante, sino viva, amable y esperanzadora. "
        "Puede tener una ligera sonrisa en la voz. "
        "Ritmo natural, con energía suave y positiva. "
        "Respeta la puntuación y deja reposar las frases, pero sin apagar el impulso final. "
        "Dicción clara en español mexicano."
        "Mantén un ritmo sereno."
        "Evita exageraciones."
        "Respeta pausas naturales."
        "No sobreactúes."
    ),
}

BLOQUES = ["gozosos", "luminosos", "dolorosos", "gloriosos"]

NOMBRES_OFICIALES = {
    ("gozosos", 1): "Primer Misterio Gozoso: La encarnación del Hijo de Dios.",
    ("gozosos", 2): "Segundo Misterio Gozoso: La visitación de Nuestra Señora a su prima Santa Isabel.",
    ("gozosos", 3): "Tercer Misterio Gozoso: El nacimiento del Hijo de Dios.",
    ("gozosos", 4): "Cuarto Misterio Gozoso: La Presentación de Jesús en el templo.",
    ("gozosos", 5): "Quinto Misterio Gozoso: El Niño Jesús perdido y hallado en el templo.",
    ("luminosos", 1): "Primer Misterio Luminoso: El Bautismo de Jesús en el Jordán.",
    ("luminosos", 2): "Segundo Misterio Luminoso: La autorrevelación de Jesús en las bodas de Caná.",
    ("luminosos", 3): "Tercer Misterio Luminoso: El anuncio del Reino de Dios invitando a la conversión.",
    ("luminosos", 4): "Cuarto Misterio Luminoso: La Transfiguración.",
    ("luminosos", 5): "Quinto Misterio Luminoso: La Institución de la Eucaristía.",
    ("dolorosos", 1): "Primer Misterio Doloroso: La Oración de Jesús en el Huerto.",
    ("dolorosos", 2): "Segundo Misterio Doloroso: La Flagelación del Señor.",
    ("dolorosos", 3): "Tercer Misterio Doloroso: La Coronación de espinas.",
    ("dolorosos", 4): "Cuarto Misterio Doloroso: Jesús con la Cruz a cuestas camino del Calvario.",
    ("dolorosos", 5): "Quinto Misterio Doloroso: La Crucifixión y Muerte de Nuestro Señor.",
    ("gloriosos", 1): "Primer Misterio Glorioso: La Resurrección del Hijo de Dios.",
    ("gloriosos", 2): "Segundo Misterio Glorioso: La Ascensión del Señor a los Cielos.",
    ("gloriosos", 3): "Tercer Misterio Glorioso: La Venida del Espíritu Santo sobre los Apóstoles.",
    ("gloriosos", 4): "Cuarto Misterio Glorioso: La Asunción de Nuestra Señora a los Cielos.",
    ("gloriosos", 5): "Quinto Misterio Glorioso: La Coronación de la Santísima Virgen como Reina de Cielos y Tierra.",
}

LIBROS_LITURGICOS = {
    # Evangelios
    "Mateo":  {"formula": "Del Santo Evangelio según San Mateo",  "es_evangelio": True},
    "Marcos": {"formula": "Del Santo Evangelio según San Marcos", "es_evangelio": True},
    "Lucas":  {"formula": "Del Santo Evangelio según San Lucas",  "es_evangelio": True},
    "Juan":   {"formula": "Del Santo Evangelio según San Juan",   "es_evangelio": True},
    # Hechos
    "Hechos": {"formula": "De los Hechos de los Apóstoles", "es_evangelio": False},
    # Cartas paulinas
    "Romanos":           {"formula": "De la carta del Apóstol San Pablo a los Romanos",                "es_evangelio": False},
    "1 Corintios":       {"formula": "De la primera carta del Apóstol San Pablo a los Corintios",      "es_evangelio": False},
    "2 Corintios":       {"formula": "De la segunda carta del Apóstol San Pablo a los Corintios",      "es_evangelio": False},
    "Gálatas":           {"formula": "De la carta del Apóstol San Pablo a los Gálatas",                "es_evangelio": False},
    "Efesios":           {"formula": "De la carta del Apóstol San Pablo a los Efesios",                "es_evangelio": False},
    "Filipenses":        {"formula": "De la carta del Apóstol San Pablo a los Filipenses",             "es_evangelio": False},
    "Colosenses":        {"formula": "De la carta del Apóstol San Pablo a los Colosenses",             "es_evangelio": False},
    "1 Tesalonicenses":  {"formula": "De la primera carta del Apóstol San Pablo a los Tesalonicenses", "es_evangelio": False},
    "2 Tesalonicenses":  {"formula": "De la segunda carta del Apóstol San Pablo a los Tesalonicenses", "es_evangelio": False},
    "1 Timoteo":         {"formula": "De la primera carta del Apóstol San Pablo a Timoteo",            "es_evangelio": False},
    "2 Timoteo":         {"formula": "De la segunda carta del Apóstol San Pablo a Timoteo",            "es_evangelio": False},
    "Tito":              {"formula": "De la carta del Apóstol San Pablo a Tito",                       "es_evangelio": False},
    "Filemón":           {"formula": "De la carta del Apóstol San Pablo a Filemón",                    "es_evangelio": False},
    "Hebreos":           {"formula": "De la carta a los Hebreos",                                      "es_evangelio": False},
    # Cartas católicas
    "Santiago": {"formula": "De la carta del Apóstol Santiago",                 "es_evangelio": False},
    "1 Pedro":  {"formula": "De la primera carta del Apóstol San Pedro",        "es_evangelio": False},
    "2 Pedro":  {"formula": "De la segunda carta del Apóstol San Pedro",        "es_evangelio": False},
    "1 Juan":   {"formula": "De la primera carta del Apóstol San Juan",         "es_evangelio": False},
    "2 Juan":   {"formula": "De la segunda carta del Apóstol San Juan",         "es_evangelio": False},
    "3 Juan":   {"formula": "De la tercera carta del Apóstol San Juan",         "es_evangelio": False},
    "Judas":    {"formula": "De la carta del Apóstol San Judas",                "es_evangelio": False},
    # Apocalipsis
    "Apocalipsis": {"formula": "Del libro del Apocalipsis del Apóstol San Juan", "es_evangelio": False},
    # AT — Pentateuco
    "Génesis":      {"formula": "Del libro del Génesis",       "es_evangelio": False},
    "Éxodo":        {"formula": "Del libro del Éxodo",         "es_evangelio": False},
    "Levítico":     {"formula": "Del libro del Levítico",      "es_evangelio": False},
    "Números":      {"formula": "Del libro de los Números",    "es_evangelio": False},
    "Deuteronomio": {"formula": "Del libro del Deuteronomio",  "es_evangelio": False},
    # AT — Históricos
    "Josué":    {"formula": "Del libro de Josué",             "es_evangelio": False},
    "Jueces":   {"formula": "Del libro de los Jueces",        "es_evangelio": False},
    "Rut":      {"formula": "Del libro de Rut",               "es_evangelio": False},
    "1 Samuel": {"formula": "Del primer libro de Samuel",     "es_evangelio": False},
    "2 Samuel": {"formula": "Del segundo libro de Samuel",    "es_evangelio": False},
    "1 Reyes":  {"formula": "Del primer libro de los Reyes",  "es_evangelio": False},
    "2 Reyes":  {"formula": "Del segundo libro de los Reyes", "es_evangelio": False},
    # AT — Sapienciales
    "Salmos":       {"formula": "Del libro de los Salmos",     "es_evangelio": False},
    "Proverbios":   {"formula": "Del libro de los Proverbios", "es_evangelio": False},
    "Sabiduría":    {"formula": "Del libro de la Sabiduría",   "es_evangelio": False},
    "Sirácide":     {"formula": "Del libro del Sirácide",      "es_evangelio": False},
    "Eclesiástico": {"formula": "Del libro del Eclesiástico",  "es_evangelio": False},
    # AT — Profetas
    "Isaías":    {"formula": "Del libro del profeta Isaías",    "es_evangelio": False},
    "Jeremías":  {"formula": "Del libro del profeta Jeremías",  "es_evangelio": False},
    "Ezequiel":  {"formula": "Del libro del profeta Ezequiel",  "es_evangelio": False},
    "Daniel":    {"formula": "Del libro del profeta Daniel",    "es_evangelio": False},
    "Miqueas":   {"formula": "Del libro del profeta Miqueas",   "es_evangelio": False},
    "Zacarías":  {"formula": "Del libro del profeta Zacarías",  "es_evangelio": False},
    "Malaquías": {"formula": "Del libro del profeta Malaquías", "es_evangelio": False},
}


# -------------------------------------------------------------------
# Utilidades JSON
# -------------------------------------------------------------------

def discover_json_files():
    return sorted([p.name for p in Path(".").glob("*.json")])


def reload_json_choices():
    files = discover_json_files()
    value = files[0] if files else None
    return gr.update(choices=files, value=value)


def load_json_file(filename: str):
    if not filename:
        raise gr.Error("No seleccionaste un archivo JSON.")
    path = Path(filename)
    if not path.exists():
        raise gr.Error(f"No encontré el archivo: {filename}")
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def parse_tema_id_to_level_and_cuaderno(data: dict):
    tema_id = str(data.get("tema", {}).get("id", "")).zfill(4)
    if len(tema_id) != 4 or not tema_id.isdigit():
        return 1, 1
    nivel = int(tema_id[:2])
    cuaderno = int(tema_id[2:])
    return nivel, cuaderno


def get_misterios_for_block(data: dict, bloque: str):
    return data.get("misterios", {}).get(bloque, [])


def get_misterio_record(data: dict, bloque: str, misterio_index_in_block: int):
    misterios = get_misterios_for_block(data, bloque)
    if not misterios:
        raise gr.Error(f"No encontré misterios en el bloque '{bloque}'.")
    if misterio_index_in_block < 1 or misterio_index_in_block > len(misterios):
        raise gr.Error(f"El misterio del bloque debe estar entre 1 y {len(misterios)}.")
    return misterios[misterio_index_in_block - 1]


def build_context_summary(data: dict, bloque: str, misterio_record: dict):
    mundo = data.get("mundo", "")
    elemento = data.get("elemento", "")
    subtitulo_bloque = data.get("subtitulos_bloque", {}).get(bloque, "")
    titulo = misterio_record.get("titulo", "")
    subtitulo = misterio_record.get("subtitulo", "")
    referencia = misterio_record.get("referencia", "")

    summary = (
        f"Mundo: {mundo}\n"
        f"Elemento: {elemento}\n"
        f"Bloque: {bloque}\n"
        f"Subtítulo del bloque: {subtitulo_bloque}\n"
        f"Misterio: {titulo}\n"
        f"Subtítulo del misterio: {subtitulo}\n"
        f"Referencia: {referencia}"
    )
    return summary


def _extraer_libro(referencia: str) -> str:
    """Extrae el nombre del libro de una referencia tipo 'Lucas 1:26-38' o '1 Corintios 13:1'."""
    m = re.match(r'^(.*?)\s+\d+:\d+', referencia.strip())
    return m.group(1).strip() if m else referencia.strip()


def build_ubible_text(misterio_record: dict, titulo_oficial: str) -> str:
    referencia = misterio_record.get("referencia", "").strip()
    evangelio = misterio_record.get("evangelio", "").strip()

    libro = _extraer_libro(referencia)
    info_libro = LIBROS_LITURGICOS.get(libro, {})
    formula = info_libro.get("formula", f"De la Sagrada Escritura ({libro})")
    es_evangelio = info_libro.get("es_evangelio", False)
    cierre = "Palabra del Señor." if es_evangelio else "Palabra de Dios."

    partes = []
    if titulo_oficial:
        partes.append(titulo_oficial)
    partes.append(formula)
    partes.append(evangelio)
    partes.append(cierre)

    return "\n\n".join(partes)


def split_meditacion_into_questions(meditacion: str):
    """
    Divide el campo 'meditacion' en QA / QB / QC usando las etiquetas:
    - Por María hacia Jesús:
    - Desde el Hijo hacia el Padre:
    - Hijos y hermanos en el Espíritu:
    """
    if not meditacion or not meditacion.strip():
        return "", "", ""

    pattern = (
        r"Por María hacia Jesús:"
        r"|Desde el Hijo hacia el Padre:"
        r"|Hijos y hermanos en el Espíritu:"
    )
    parts = re.split(pattern, meditacion.strip())

    # parts[0] es texto antes de la primera etiqueta (intro o vacío)
    a = parts[1].strip() if len(parts) > 1 else ""
    b = parts[2].strip() if len(parts) > 2 else ""
    c = parts[3].strip() if len(parts) > 3 else ""

    return a, b, c


def load_context_from_json(json_file: str, bloque: str, misterio_en_bloque: int):
    data = load_json_file(json_file)
    misterio_record = get_misterio_record(data, bloque, int(misterio_en_bloque))
    nivel, cuaderno = parse_tema_id_to_level_and_cuaderno(data)
    misterio_numero = int(misterio_record.get("numero", misterio_en_bloque))
    summary = build_context_summary(data, bloque, misterio_record)
    titulo_info = f"{misterio_record.get('titulo', '')} — {misterio_record.get('subtitulo', '')}"
    return nivel, cuaderno, misterio_numero, titulo_info, summary


def load_base_text(json_file: str, bloque: str, misterio_en_bloque: int, section_name: str):
    data = load_json_file(json_file)
    misterio_record = get_misterio_record(data, bloque, int(misterio_en_bloque))
    nivel, cuaderno = parse_tema_id_to_level_and_cuaderno(data)
    misterio_numero = int(misterio_record.get("numero", misterio_en_bloque))

    text = ""
    info = ""

    if section_name == "Camino y Palabra":
        titulo_oficial = NOMBRES_OFICIALES.get((bloque, int(misterio_en_bloque)), "")
        text = build_ubible_text(misterio_record, titulo_oficial)
        info = "Texto litúrgico armado desde JSON (sin IA)"
    elif section_name == "Contemplacion":
        text = misterio_record.get("contemplacion", "")
        info = "Texto base cargado desde JSON: contemplacion"
    elif section_name == "Pregunta A":
        qa, _, _ = split_meditacion_into_questions(misterio_record.get("meditacion", ""))
        text = qa
        info = "Texto base cargado desde JSON: meditacion → Pregunta A"
    elif section_name == "Pregunta B":
        _, qb, _ = split_meditacion_into_questions(misterio_record.get("meditacion", ""))
        text = qb
        info = "Texto base cargado desde JSON: meditacion → Pregunta B"
    elif section_name == "Pregunta C":
        _, _, qc = split_meditacion_into_questions(misterio_record.get("meditacion", ""))
        text = qc
        info = "Texto base cargado desde JSON: meditacion → Pregunta C"
    elif section_name == "Oracion final":
        raw = misterio_record.get("intercesion", "").strip()
        if raw and not re.search(r'am[eé]n\.?\s*$', raw, re.IGNORECASE):
            raw += "\n\nAmén."
        text = "Oración Final\n\n" + raw if raw else "Oración Final"
        info = "Texto base cargado desde JSON: intercesion"
    elif section_name in ["Bienvenida", "Despedida"]:
        info = "Esta sección no se carga desde JSON. Usa ✨ Generar texto con IA."
    else:
        info = "No hay texto base para esta sección."

    summary = build_context_summary(data, bloque, misterio_record)
    titulo_info = f"{misterio_record.get('titulo', '')} — {misterio_record.get('subtitulo', '')}"

    return text, info, nivel, cuaderno, misterio_numero, titulo_info, summary


# -------------------------------------------------------------------
# Utilidades nombre / TTS
# -------------------------------------------------------------------

def build_standard_filename(section_name: str, nivel: int, cuaderno: int, misterio: int) -> str:
    code = SECTION_CODES[section_name]
    return f"{code}_{nivel}_{cuaderno}_{misterio}.{AUDIO_FORMAT}"


def ensure_terminal_punctuation(text: str) -> str:
    text = text.strip()
    if text and text[-1] not in ".!?…:;":
        text += "."
    return text


def preview_filename(section_name: str, nivel: int, cuaderno: int, misterio: int):
    nivel = int(nivel)
    cuaderno = int(cuaderno)
    misterio = int(misterio)

    filename = build_standard_filename(section_name, nivel, cuaderno, misterio)

    if section_name == "Canto":
        return (
            filename,
            "Canto no se genera por TTS en este script. Solo se muestra la nomenclatura esperada.",
        )

    return (
        filename,
        f"Voz canónica: {SECTION_VOICES[section_name]} | Modelo TTS: {TTS_MODEL}",
    )


_SECTION_ORDER = [
    "Bienvenida",
    "Camino y Palabra",
    "Contemplacion",
    "Pregunta A",
    "Pregunta B",
    "Pregunta C",
    "Oracion final",
    "Despedida",
]


def _auto_load_text(json_file, bloque, misterio_en_bloque, section_name):
    """Load or generate text for a section; returns (text, info, nivel, cuaderno, misterio, titulo_info, summary)."""
    if section_name in ["Bienvenida", "Despedida"]:
        return generate_ai_text(json_file, bloque, int(misterio_en_bloque), section_name)
    return load_base_text(json_file, bloque, int(misterio_en_bloque), section_name)


def load_context_and_text(json_file, bloque, misterio_en_bloque, section_name):
    text, info, nivel, cuaderno, misterio, titulo_info, summary = _auto_load_text(
        json_file, bloque, misterio_en_bloque, section_name
    )
    filename, _ = preview_filename(section_name, int(nivel), int(cuaderno), int(misterio))
    return nivel, cuaderno, misterio, titulo_info, summary, text, info, filename


def siguiente_seccion_y_carga(section_name, json_file, bloque, misterio_en_bloque, nivel, cuaderno, misterio):
    aviso = ""
    new_bloque = bloque
    new_misterio_en_bloque = int(misterio_en_bloque)

    if section_name == "Despedida":
        new_misterio_en_bloque += 1
        if new_misterio_en_bloque > 5:
            new_misterio_en_bloque = 1
            bloque_idx = BLOQUES.index(bloque)
            new_bloque = BLOQUES[(bloque_idx + 1) % len(BLOQUES)]
        aviso = f"Nuevo Misterio — {new_bloque.capitalize()} #{new_misterio_en_bloque}"
        new_section = "Bienvenida"
    else:
        idx = _SECTION_ORDER.index(section_name) if section_name in _SECTION_ORDER else -1
        new_section = _SECTION_ORDER[(idx + 1) % len(_SECTION_ORDER)]

    text, info, new_nivel, new_cuaderno, new_misterio, titulo_info, summary = _auto_load_text(
        json_file, new_bloque, new_misterio_en_bloque, new_section
    )
    filename, _ = preview_filename(new_section, int(new_nivel), int(new_cuaderno), int(new_misterio))
    notice = aviso if aviso else info

    return (
        new_section, text, notice, filename,
        new_nivel, new_cuaderno, new_misterio,
        new_misterio_en_bloque, new_bloque,
        titulo_info, summary,
    )


# -------------------------------------------------------------------
# OpenAI: generación de texto (Modo A)
# -------------------------------------------------------------------

def extract_output_text_from_responses_api(resp_json: dict) -> str:
    # Intento robusto con varias formas posibles
    if isinstance(resp_json.get("output_text"), str) and resp_json.get("output_text").strip():
        return resp_json["output_text"].strip()

    output = resp_json.get("output", [])
    chunks = []
    for item in output:
        content = item.get("content", [])
        for part in content:
            if part.get("type") in ["output_text", "text"] and part.get("text"):
                chunks.append(part["text"])
    return "\n".join(chunks).strip()


def generate_ai_text(json_file: str, bloque: str, misterio_en_bloque: int, section_name: str):
    if not OPENAI_API_KEY:
        raise gr.Error("No encontré OPENAI_API_KEY en tu archivo .env")

    if section_name not in ["Bienvenida", "Despedida"]:
        raise gr.Error("La IA de texto en este flujo está pensada para Bienvenida y Despedida.")

    data = load_json_file(json_file)
    misterio_record = get_misterio_record(data, bloque, int(misterio_en_bloque))
    nivel, cuaderno = parse_tema_id_to_level_and_cuaderno(data)
    misterio_numero = int(misterio_record.get("numero", misterio_en_bloque))

    mundo = data.get("mundo", "")
    elemento = data.get("elemento", "")
    subtitulo_bloque = data.get("subtitulos_bloque", {}).get(bloque, "")
    titulo = misterio_record.get("titulo", "")
    subtitulo = misterio_record.get("subtitulo", "")
    referencia = misterio_record.get("referencia", "")

    if section_name == "Bienvenida":
        prompt = f"""
Escribe la bienvenida de audio para una sesión de oración de CruzAndo. Debe ser MUY BREVE: máximo 5 oraciones antes del cierre final.

Contexto del itinerario:
- Mundo: {mundo}
- Elemento: {elemento}
- Bloque: {bloque} — {subtitulo_bloque}
- Misterio: {titulo} ({subtitulo})
- Referencia bíblica: {referencia}

Estructura obligatoria (en este orden):
1. Una frase que ubique al usuario en el itinerario (mundo, elemento o bloque), sin describir demasiado.
2. Una frase que anuncie de qué trata esta sesión, mencionando el nombre del misterio.
3. Mencionar la referencia bíblica solo como libro, capítulo y versículo (ej. "Lucas uno, veintiseis"), nunca copiar el texto.
4. Terminar EXACTAMENTE con estas tres líneas, sin agregar nada después:

Respira hondo…
Abre tu corazón…
Comencemos a cruzar…

Estilo:
- Segunda persona singular (tú), nunca plural ni impersonal
- Tono cálido, cercano y sencillo
- Frases cortas, naturales para voz femenina
- Sin dramatismo, sin solemnidad excesiva
"""
    else:
        prompt = f"""
Genera una despedida breve para una sesión de oración católica de CruzAndo.

Contexto:
- Mundo: {mundo}
- Elemento: {elemento}
- Bloque: {bloque}
- Subtítulo del bloque: {subtitulo_bloque}
- Misterio: {titulo}
- Subtítulo del misterio: {subtitulo}

Objetivo:
- voz femenina cálida, cercana y luminosa
- tono alegre, motivador y reconfortante
- no solemne
- breve
- debe dejar impulso para seguir caminando
- debe sonar como una madre que despide con cariño y ánimo
- frases cortas, buenas para audio

Importante:
- dirigirse siempre al usuario en segunda persona singular (tú), nunca en plural ni en impersonal
- no escribir oración final larga
- no usar cierre demasiado serio
- no sonar comercial
- terminar EXACTAMENTE con esta frase y nada distinto al final:

¡Goza el camino, y que Dios te bendiga siempre!
"""

    headers = {
        "Authorization": f"Bearer {OPENAI_API_KEY}",
        "Content-Type": "application/json",
    }

    payload = {
        "model": TEXT_MODEL,
        "input": prompt,
    }

    try:
        response = requests.post(RESPONSES_API_URL, headers=headers, json=payload, timeout=180)
        response.raise_for_status()
        result = response.json()
        generated = extract_output_text_from_responses_api(result)
    except requests.HTTPError as e:
        detail = ""
        try:
            detail = response.json()
        except Exception:
            detail = response.text
        raise gr.Error(f"Error HTTP al generar texto con IA:\n{detail}") from e
    except Exception as e:
        raise gr.Error(f"Error al generar texto con IA: {e}") from e

    if not generated.strip():
        raise gr.Error("La IA no devolvió texto útil.")

    info = f"Texto generado con IA para: {section_name} | Modelo texto: {TEXT_MODEL}"
    titulo_info = f"{titulo} — {subtitulo}"
    summary = build_context_summary(data, bloque, misterio_record)

    return generated, info, nivel, cuaderno, misterio_numero, titulo_info, summary


# -------------------------------------------------------------------
# OpenAI: TTS
# -------------------------------------------------------------------

def generate_audio(text: str, section_name: str, nivel: int, cuaderno: int, misterio: int):
    if not OPENAI_API_KEY:
        raise gr.Error("No encontré OPENAI_API_KEY en tu archivo .env")

    if section_name == "Canto":
        raise gr.Error("La sección 'Canto' no se genera por TTS en este script.")

    if not text or not text.strip():
        raise gr.Error("Pega un texto para generar audio.")

    nivel = int(nivel)
    cuaderno = int(cuaderno)
    misterio = int(misterio)

    if nivel < 1:
        raise gr.Error("El nivel debe ser 1 o mayor.")
    if cuaderno < 1:
        raise gr.Error("El cuaderno debe ser 1 o mayor.")
    if not 1 <= misterio <= 20:
        raise gr.Error("El misterio debe estar entre 1 y 20.")

    voice = SECTION_VOICES[section_name]

    prepared_text = ensure_terminal_punctuation(text)
    prepared_text = prepared_text + "\n\nFin del texto."

    instructions = (
        SECTION_INSTRUCTIONS[section_name]
        + " No omitas ninguna frase del texto. "
        + "Pronuncia completo el cierre. "
        + "La última frase es indispensable y debe decirse íntegra. "
        + "No resumas ni suavices el final."
    )

    filename = build_standard_filename(section_name, nivel, cuaderno, misterio)
    out_file = OUTPUT_DIR / filename

    headers = {
        "Authorization": f"Bearer {OPENAI_API_KEY}",
        "Content-Type": "application/json",
    }

    payload = {
        "model": TTS_MODEL,
        "voice": voice,
        "input": prepared_text,
        "response_format": AUDIO_FORMAT,
        "instructions": instructions,
    }

    try:
        response = requests.post(AUDIO_API_URL, headers=headers, json=payload, timeout=180)
        response.raise_for_status()
    except requests.HTTPError as e:
        detail = ""
        try:
            detail = response.json()
        except Exception:
            detail = response.text
        raise gr.Error(f"Error HTTP al llamar la API de audio:\n{detail}") from e
    except Exception as e:
        raise gr.Error(f"Error al generar audio: {e}") from e

    with open(out_file, "wb") as f:
        f.write(response.content)

    result = (
        f"Archivo generado: {out_file.name}\n"
        f"Sección: {section_name}\n"
        f"Prefijo: {SECTION_CODES[section_name]}\n"
        f"Modelo TTS: {TTS_MODEL}\n"
        f"Voz canónica: {voice}\n"
        f"Nivel: {nivel}\n"
        f"Cuaderno: {cuaderno}\n"
        f"Misterio: {misterio}"
    )

    return str(out_file), result, out_file.name, str(out_file)


# -------------------------------------------------------------------
# UI
# -------------------------------------------------------------------

custom_css = """
body {
    background-color: #0f172a;
}

.gradio-container {
    background-color: #0f172a !important;
}

.gradio-container .block,
.gradio-container .gr-block,
.gradio-container .gr-box,
.gradio-container .gr-panel,
.gradio-container .gr-form,
.gradio-container .gr-group {
    background-color: #1e293b !important;
    border: 1px solid #334155 !important;
}

.gr-row, .gr-column {
    background-color: transparent !important;
}

textarea, input {
    background-color: #020617 !important;
    color: #ffffff !important;
    border: 1px solid #38bdf8 !important;
}

textarea:focus, input:focus {
    border: 1px solid #7dd3fc !important;
    outline: none !important;
}

select {
    background-color: #020617 !important;
    color: #ffffff !important;
    border: 1px solid #38bdf8 !important;
}

label {
    color: #cbd5f5 !important;
}

button {
    background-color: #0ea5e9 !important;
    color: white !important;
    border-radius: 8px !important;
}

button:hover {
    background-color: #38bdf8 !important;
}

.gr-markdown {
    background-color: transparent !important;
    color: #e2e8f0 !important;
}

audio {
    background-color: #020617 !important;
}

#text_editable textarea {
    height: 300px !important;
    max-height: 300px !important;
    overflow-y: auto !important;
    resize: none !important;
}
"""

json_choices = discover_json_files()
default_json = json_choices[0] if json_choices else None

with gr.Blocks(
    title="CruzAndo TTS Maker",
    theme=Soft(primary_hue="blue", neutral_hue="slate"),
    css=custom_css,
) as demo:
    gr.Markdown("# CruzAndo TTS Maker")
    gr.Markdown(
        "Carga textos desde JSON, genera Bienvenida/Despedida con IA, edita y produce el MP3 final."
    )

    with gr.Row():

        # --- Columna izquierda: selección de fuente ---
        with gr.Column(scale=1):
            gr.Markdown("### 📂 Fuente")
            with gr.Row():
                json_file = gr.Dropdown(
                    choices=json_choices,
                    value=default_json,
                    label="Archivo JSON",
                )
                reload_json_btn = gr.Button("🔄", scale=0)
            with gr.Row():
                bloque = gr.Dropdown(
                    choices=BLOQUES,
                    value="gozosos",
                    label="Bloque",
                )
                misterio_en_bloque = gr.Number(
                    value=1,
                    precision=0,
                    label="Misterio en bloque (1–5)",
                )
            with gr.Row():
                nivel = gr.Number(value=1, precision=0, label="Nivel")
                cuaderno = gr.Number(value=1, precision=0, label="Cuaderno")
                misterio = gr.Number(value=1, precision=0, label="Misterio")
            load_context_btn = gr.Button("📥 Cargar contexto JSON")
            titulo_info = gr.Textbox(label="Misterio seleccionado", lines=2)
            context_info = gr.Textbox(label="Contexto", lines=7)

        # --- Columna central: trabajo ---
        with gr.Column(scale=2):
            gr.Markdown("### ✏️ Trabajo")
            section_name = gr.Dropdown(
                choices=list(SECTION_CODES.keys()),
                value="Bienvenida",
                label="Sección",
            )
            text = gr.Textbox(
                label="Texto editable",
                lines=12,
                elem_id="text_editable",
                placeholder="Aquí se cargará o generará el texto. Luego puedes corregirlo antes de crear el TTS.",
            )
            generate_btn = gr.Button("🎧 Generar audio", variant="primary")

        # --- Columna derecha: resultados ---
        with gr.Column(scale=1):
            gr.Markdown("### 🎧 Resultado")
            filename_preview = gr.Textbox(label="Nombre de archivo previsto")
            voice_info = gr.Textbox(label="Información de voz / aviso", lines=3)
            audio_output = gr.Audio(label="Vista previa", type="filepath")
            next_section_btn = gr.Button("➡️ Siguiente sección")
            result_output = gr.Textbox(label="Resultado", lines=8)
            download_output = gr.File(label="Descargar MP3")

    reload_json_btn.click(
        fn=reload_json_choices,
        inputs=[],
        outputs=[json_file],
    )

    load_context_btn.click(
        fn=load_context_and_text,
        inputs=[json_file, bloque, misterio_en_bloque, section_name],
        outputs=[nivel, cuaderno, misterio, titulo_info, context_info, text, voice_info, filename_preview],
    )

    generate_btn.click(
        fn=generate_audio,
        inputs=[text, section_name, nivel, cuaderno, misterio],
        outputs=[audio_output, result_output, filename_preview, download_output],
    )

    next_section_btn.click(
        fn=siguiente_seccion_y_carga,
        inputs=[section_name, json_file, bloque, misterio_en_bloque, nivel, cuaderno, misterio],
        outputs=[
            section_name, text, voice_info, filename_preview,
            nivel, cuaderno, misterio,
            misterio_en_bloque, bloque,
            titulo_info, context_info,
        ],
    )

if __name__ == "__main__":
    demo.launch(inbrowser=True)