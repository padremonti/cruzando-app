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

OUTPUT_DIR = Path(r"C:\R2\cruzando-audios")
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

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
    "Canto": None,
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
    "Mateo":  {"formula": "Del Santo Evangelio según San Mateo",  "es_evangelio": True},
    "Marcos": {"formula": "Del Santo Evangelio según San Marcos", "es_evangelio": True},
    "Lucas":  {"formula": "Del Santo Evangelio según San Lucas",  "es_evangelio": True},
    "Juan":   {"formula": "Del Santo Evangelio según San Juan",   "es_evangelio": True},
    "Hechos": {"formula": "De los Hechos de los Apóstoles", "es_evangelio": False},
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
    "Santiago": {"formula": "De la carta del Apóstol Santiago",                 "es_evangelio": False},
    "1 Pedro":  {"formula": "De la primera carta del Apóstol San Pedro",        "es_evangelio": False},
    "2 Pedro":  {"formula": "De la segunda carta del Apóstol San Pedro",        "es_evangelio": False},
    "1 Juan":   {"formula": "De la primera carta del Apóstol San Juan",         "es_evangelio": False},
    "2 Juan":   {"formula": "De la segunda carta del Apóstol San Juan",         "es_evangelio": False},
    "3 Juan":   {"formula": "De la tercera carta del Apóstol San Juan",         "es_evangelio": False},
    "Judas":    {"formula": "De la carta del Apóstol San Judas",                "es_evangelio": False},
    "Apocalipsis": {"formula": "Del libro del Apocalipsis del Apóstol San Juan", "es_evangelio": False},
    "Génesis":      {"formula": "Del libro del Génesis",       "es_evangelio": False},
    "Éxodo":        {"formula": "Del libro del Éxodo",         "es_evangelio": False},
    "Levítico":     {"formula": "Del libro del Levítico",      "es_evangelio": False},
    "Números":      {"formula": "Del libro de los Números",    "es_evangelio": False},
    "Deuteronomio": {"formula": "Del libro del Deuteronomio",  "es_evangelio": False},
    "Josué":    {"formula": "Del libro de Josué",             "es_evangelio": False},
    "Jueces":   {"formula": "Del libro de los Jueces",        "es_evangelio": False},
    "Rut":      {"formula": "Del libro de Rut",               "es_evangelio": False},
    "1 Samuel": {"formula": "Del primer libro de Samuel",     "es_evangelio": False},
    "2 Samuel": {"formula": "Del segundo libro de Samuel",    "es_evangelio": False},
    "1 Reyes":  {"formula": "Del primer libro de los Reyes",  "es_evangelio": False},
    "2 Reyes":  {"formula": "Del segundo libro de los Reyes", "es_evangelio": False},
    "Salmos":       {"formula": "Del libro de los Salmos",     "es_evangelio": False},
    "Proverbios":   {"formula": "Del libro de los Proverbios", "es_evangelio": False},
    "Sabiduría":    {"formula": "Del libro de la Sabiduría",   "es_evangelio": False},
    "Sirácide":     {"formula": "Del libro del Sirácide",      "es_evangelio": False},
    "Eclesiástico": {"formula": "Del libro del Eclesiástico",  "es_evangelio": False},
    "Isaías":    {"formula": "Del libro del profeta Isaías",    "es_evangelio": False},
    "Jeremías":  {"formula": "Del libro del profeta Jeremías",  "es_evangelio": False},
    "Ezequiel":  {"formula": "Del libro del profeta Ezequiel",  "es_evangelio": False},
    "Daniel":    {"formula": "Del libro del profeta Daniel",    "es_evangelio": False},
    "Miqueas":   {"formula": "Del libro del profeta Miqueas",   "es_evangelio": False},
    "Zacarías":  {"formula": "Del libro del profeta Zacarías",  "es_evangelio": False},
    "Malaquías": {"formula": "Del libro del profeta Malaquías", "es_evangelio": False},
}


# -------------------------------------------------------------------
# Utilidades JSON (TTS Maker)
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
    partes.append(formula + ":")
    partes.append(evangelio)
    partes.append(cierre)

    return "\n\n".join(partes)


def split_meditacion_into_questions(meditacion: str):
    if not meditacion or not meditacion.strip():
        return "", "", ""

    pattern = (
        r"Por María hacia Jesús:"
        r"|Desde el Hijo hacia el Padre:"
        r"|Hijos y hermanos en el Espíritu:"
    )
    parts = re.split(pattern, meditacion.strip())

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
        text = raw if raw else ""
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
    if section_name in ["Bienvenida", "Despedida"]:
        return generate_ai_text(json_file, bloque, int(misterio_en_bloque), section_name)
    return load_base_text(json_file, bloque, int(misterio_en_bloque), section_name)


def load_context_and_text(json_file, bloque, misterio_en_bloque, section_name):
    text, info, nivel, cuaderno, misterio, titulo_info, summary = _auto_load_text(
        json_file, bloque, misterio_en_bloque, section_name
    )
    filename, _ = preview_filename(section_name, int(nivel), int(cuaderno), int(misterio))
    return nivel, cuaderno, misterio, titulo_info, summary, text, info, filename


def load_context_and_text_with_fields(json_file, bloque, misterio_en_bloque, section_name):
    """Como load_context_and_text pero también devuelve los 7 campos del misterio para el accordion."""
    text, info, nivel, cuaderno, misterio, titulo_info, summary = _auto_load_text(
        json_file, bloque, misterio_en_bloque, section_name
    )
    filename, _ = preview_filename(section_name, int(nivel), int(cuaderno), int(misterio))

    # Cargar campos crudos del misterio para el accordion
    try:
        data = load_json_file(json_file)
        rec = get_misterio_record(data, bloque, int(misterio_en_bloque))
        ac_titulo       = rec.get("titulo", "")
        ac_subtitulo    = rec.get("subtitulo", "")
        ac_referencia   = rec.get("referencia", "")
        ac_evangelio    = rec.get("evangelio", "")
        ac_contemplacion = rec.get("contemplacion", "")
        ac_meditacion   = rec.get("meditacion", "")
        ac_intercesion  = rec.get("intercesion", "")
    except Exception:
        ac_titulo = ac_subtitulo = ac_referencia = ""
        ac_evangelio = ac_contemplacion = ac_meditacion = ac_intercesion = ""

    return (
        nivel, cuaderno, misterio, titulo_info, summary, text, info, filename,
        ac_titulo, ac_subtitulo, ac_referencia,
        ac_evangelio, ac_contemplacion, ac_meditacion, ac_intercesion,
    )


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
# OpenAI: generación de texto
# -------------------------------------------------------------------

def extract_output_text_from_responses_api(resp_json: dict) -> str:
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
Eres el asistente de redacción del P. César Ricardo Montijo Rivas, sacerdote mexicano y creador de CruzAndo, una peregrinación espiritual gamificada basada en el Santo Rosario. Debes escribir un borrador de START (Bienvenida) para una sesión de audio que él revisará y editará.

CONTEXTO DEL MISTERIO:
- Mundo: {mundo}
- Elemento: {elemento}
- Bloque: {bloque} — {subtitulo_bloque}
- Misterio: {titulo}
- Subtítulo del misterio: {subtitulo}
- Referencia bíblica: {referencia}

ESTILO Y VOZ (imitar con fidelidad):
- Voz femenina, maternal y cercana — como una guía que camina contigo, no que predica desde arriba.
- Tono pastoral y cálido, nunca solemne ni teatral. Natural, como en conversación real.
- Puedes abrir con una pregunta retórica o tensión espiritual que enganche al oyente antes de ubicarlo en el itinerario.
- Segunda persona singular (tú), directa y personal.
- Puedes mencionar el nombre del mundo, elemento o bloque con naturalidad en la primera o segunda frase.
- Anuncia el misterio y la referencia bíblica de forma sencilla (ej: "Lucas dos, versículos uno al siete").
- Las frases son cortas. Los párrafos también. Hay espacio entre las ideas.
- Máximo 4-6 oraciones de contenido antes del cierre ritual.

EJEMPLOS DE ESTILO DEL AUTOR (observa el tono y la estructura, no copies):
Ejemplo 1: "Bienvenido a esta sesión de CruzAndo la Cruz, en el segundo nivel: pecado. A pesar de encontrarnos meditando los tiernos misterios de la infancia de Cristo, ya desde su nacimiento se enfrentó con un mundo oscuro, donde el egoísmo hace que cerremos las puertas a Dios. Vamos a meditar en Lucas 2, versículos del 1 al 7."
Ejemplo 2: "Tal vez, muchas veces has escuchado y dicho la expresión: «Cordero de Dios que quita el pecado del mundo»... ¿qué significa esto? Vamos a sumergirnos en el misterio del Bautismo en el Jordán, escuchando Juan 1, versículos 29 y del 32 al 34."
Ejemplo 3: "Muchas personas se suelen preguntar: ¿por qué Dios permitió que me hicieran daño?... Y la respuesta más liberadora que puedo darte es esta: Dios NO permitió el pecado: lo padeció contigo y por ti."

CIERRE OBLIGATORIO — terminar SIEMPRE con estas tres líneas exactas, sin añadir nada después:

Respira hondo…
Abre tu corazón…
Comencemos a cruzar…
"""
    else:
        prompt = f"""
Eres el asistente de redacción del P. César Ricardo Montijo Rivas, sacerdote mexicano y creador de CruzAndo, una peregrinación espiritual gamificada basada en el Santo Rosario. Debes escribir un borrador de BYE (Despedida) para una sesión de audio que él revisará y editará.

CONTEXTO DEL MISTERIO:
- Mundo: {mundo}
- Elemento: {elemento}
- Bloque: {bloque}
- Subtítulo del bloque: {subtitulo_bloque}
- Misterio: {titulo}
- Subtítulo del misterio: {subtitulo}

ESTILO Y VOZ (imitar con fidelidad):
- Voz femenina, maternal y cercana — como una guía que te acompaña al final del camino de hoy.
- Tono alegre, esperanzador, con impulso hacia adelante. Nunca solemne ni pesado.
- Estructura habitual: (1) remate contemplativo breve sobre el misterio recién rezado, (2) anticipo del próximo misterio o sesión como gancho, (3) opcionalmente: recordatorio del diario personal, (4) cierre festivo.
- Las frases son cortas. Puede haber una pausa dramática ("...") entre ideas.
- Segunda persona singular (tú), directa y personal.
- Máximo 4-6 oraciones antes del cierre.
- No sonar comercial ni genérico.

EJEMPLOS DE ESTILO DEL AUTOR (observa el tono y la estructura, no copies):
Ejemplo 1: "El Salvador ya está aquí, liberándote de todo peso. Siente esa alegría en tu corazón. En la próxima sesión, vamos a reconocer cuántas veces hemos cerrado las puertas a Dios, y eso es justamente el pecado."
Ejemplo 2: "Con cada Eucaristía, su sangre derramada nos recuerda que siempre hay un nuevo comienzo. Felicidades por recorrer los Misterios Luminosos cruzando el pecado. Ahora, has desbloqueado el canto: «Entra su Luz». A propósito, ¿has descubierto más sobre tu fe? Recuerda que puedes escribir tus reflexiones en tu diario personal."
Ejemplo 3: "La Flagelación del Señor nos enseña a enfrentar el dolor con valentía, para interrumpir por siempre el ciclo de la venganza y la violencia. ¿Has escrito alguna reflexión que sea valiosa, para compartir con alguien? Recuerda que puedes consultarla en tu diario... En la próxima sesión vamos a entrar a un tema muy actual: la cultura de la cancelación. ¡Te espero pronto!"

CIERRE OBLIGATORIO — terminar SIEMPRE con esta línea exacta, sin añadir nada después:

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
# Editor de Contenido — helpers
# -------------------------------------------------------------------

def convert_quotes_in_strings(obj):
    """Reemplaza pares "..." por «...» en todos los valores de texto, recursivamente."""
    if isinstance(obj, str):
        return re.sub(r'"([^"]*)"', r'«\1»', obj)
    elif isinstance(obj, dict):
        return {k: convert_quotes_in_strings(v) for k, v in obj.items()}
    elif isinstance(obj, list):
        return [convert_quotes_in_strings(item) for item in obj]
    return obj


def load_json_for_editor(filename: str):
    if not filename:
        return "", "Selecciona un archivo JSON."
    path = Path(filename)
    if not path.exists():
        return "", f"Archivo no encontrado: {filename}"
    with open(path, "r", encoding="utf-8") as f:
        content = f.read()
    try:
        data = json.loads(content)
        return json.dumps(data, indent=2, ensure_ascii=False), f"Cargado: {filename}"
    except json.JSONDecodeError as e:
        return content, f"JSON inválido al leer — línea {e.lineno}: {e.msg}"


def save_json_from_editor(filename: str, content: str):
    if not filename:
        return "Selecciona el archivo destino."
    if not content or not content.strip():
        return "El contenido está vacío."
    try:
        data = json.loads(content)
    except json.JSONDecodeError as e:
        return f"JSON inválido — línea {e.lineno}, col {e.colno}: {e.msg}\nArchivo NO guardado."
    data = convert_quotes_in_strings(data)
    path = Path(filename)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
    return f"Guardado: {path.name}  (transformación de comillas aplicada)"


# -------------------------------------------------------------------
# Gestor JSON — helpers comunes
# -------------------------------------------------------------------

_GESTOR_BLOCK_KEY = {"data": "misterios", "micro": "bloques", "cantos": "cantos"}


def build_gestor_filename(nivel_id: str, file_type: str) -> str:
    nid = nivel_id.strip().zfill(4)
    if file_type == "data":
        return f"{nid}.json"
    return f"{nid}-{file_type}.json"


def load_gestor_file(nivel_id: str, file_type: str):
    if not nivel_id.strip():
        return "", "", "", "", "Indica el ID del nivel."
    filename = build_gestor_filename(nivel_id, file_type)
    path = Path(filename)
    if not path.exists():
        return "", "", "", "", f"No encontré: {filename}"
    with open(path, "r", encoding="utf-8") as f:
        data = json.load(f)
    top_key = _GESTOR_BLOCK_KEY.get(file_type, "misterios")
    blocks = data.get(top_key, {})
    empty_default = {} if file_type == "micro" else []
    out = [
        json.dumps(blocks.get(b, empty_default), indent=2, ensure_ascii=False)
        for b in BLOQUES
    ]
    return out[0], out[1], out[2], out[3], f"Cargado: {filename}"


def save_gestor_file(nivel_id: str, file_type: str, goz: str, lum: str, dol: str, glo: str):
    if not nivel_id.strip():
        return "Indica el ID del nivel."
    filename = build_gestor_filename(nivel_id, file_type)
    path = Path(filename)
    if not path.exists():
        return f"Archivo no encontrado: {filename}"
    with open(path, "r", encoding="utf-8") as f:
        data = json.load(f)
    top_key = _GESTOR_BLOCK_KEY.get(file_type, "misterios")
    errors = []
    new_blocks = {}
    for bloque, raw in zip(BLOQUES, [goz, lum, dol, glo]):
        if not raw.strip():
            new_blocks[bloque] = {} if file_type == "micro" else []
            continue
        try:
            new_blocks[bloque] = json.loads(raw)
        except json.JSONDecodeError as e:
            errors.append(f"{bloque}: línea {e.lineno} — {e.msg}")
    if errors:
        return "Errores de JSON (archivo NO guardado):\n" + "\n".join(errors)
    data.setdefault(top_key, {}).update(new_blocks)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
    return f"Guardado: {filename}"


# -------------------------------------------------------------------
# Gestor A — Visor/Editor por misterio
# -------------------------------------------------------------------

def _gestor_a_misterio_choices(data: dict, bloque: str) -> list:
    misterios = data.get("misterios", {}).get(bloque, [])
    return [
        f"{m.get('numero', i+1)} — {m.get('titulo', '(sin título)')}"
        for i, m in enumerate(misterios)
    ]


def gestor_a_load_data(nivel_id: str):
    _empty = ("", "", "", "", "", "", "")
    if not nivel_id.strip():
        return (None, "Indica el ID del nivel.", gr.update(), gr.update(choices=[], value=None)) + _empty
    filename = build_gestor_filename(nivel_id, "data")
    path = Path(filename)
    if not path.exists():
        return (None, f"No encontré: {filename}", gr.update(), gr.update(choices=[], value=None)) + _empty
    with open(path, "r", encoding="utf-8") as f:
        data = json.load(f)
    choices = _gestor_a_misterio_choices(data, "gozosos")
    return (
        data,
        f"Cargado: {filename}",
        gr.update(value="Gozosos"),
        gr.update(choices=choices, value=None),
    ) + _empty


def gestor_a_update_misterios(data, bloque_display: str):
    _empty = ("", "", "", "", "", "", "")
    if not data or not bloque_display:
        return (gr.update(choices=[], value=None),) + _empty
    choices = _gestor_a_misterio_choices(data, bloque_display.lower())
    return (gr.update(choices=choices, value=None),) + _empty


def gestor_a_load_misterio_fields(data, bloque_display: str, misterio_label: str):
    if not data or not misterio_label:
        return "", "", "", "", "", "", ""
    bloque = bloque_display.lower() if bloque_display else "gozosos"
    misterios = data.get("misterios", {}).get(bloque, [])
    try:
        num = int(misterio_label.split(" — ")[0].strip())
    except (ValueError, IndexError):
        return "", "", "", "", "", "", ""
    m = next((x for x in misterios if x.get("numero") == num), None)
    if not m:
        return "", "", "", "", "", "", ""
    return (
        m.get("titulo", ""),
        m.get("subtitulo", ""),
        m.get("referencia", ""),
        m.get("evangelio", ""),
        m.get("contemplacion", ""),
        m.get("meditacion", ""),
        m.get("intercesion", ""),
    )


def save_misterio_from_accordion(json_file, bloque, misterio_en_bloque,
                                  titulo, subtitulo, referencia,
                                  evangelio, contemplacion, meditacion, intercesion):
    """Guarda los campos editados en el accordion directamente al JSON cargado en TTS Maker."""
    if not json_file:
        return "No hay archivo JSON seleccionado."
    try:
        data = load_json_file(json_file)
    except Exception as e:
        return f"Error al leer el archivo: {e}"

    bloque = bloque.lower() if bloque else "gozosos"
    misterios = data.get("misterios", {}).get(bloque, [])
    idx_en_bloque = int(misterio_en_bloque) - 1

    if idx_en_bloque < 0 or idx_en_bloque >= len(misterios):
        return f"Índice de misterio fuera de rango ({misterio_en_bloque}) en bloque '{bloque}'."

    data["misterios"][bloque][idx_en_bloque].update({
        "titulo":        titulo.strip()       if titulo        else "",
        "subtitulo":     subtitulo.strip()    if subtitulo     else "",
        "referencia":    referencia.strip()   if referencia    else "",
        "evangelio":     evangelio            if evangelio     else "",
        "contemplacion": contemplacion        if contemplacion else "",
        "meditacion":    meditacion           if meditacion    else "",
        "intercesion":   intercesion          if intercesion   else "",
    })

    try:
        path = Path(json_file)
        with open(path, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
        num = data["misterios"][bloque][idx_en_bloque].get("numero", misterio_en_bloque)
        return f"Misterio {num} ({bloque}) guardado correctamente en {path.name}."
    except Exception as e:
        return f"Error al guardar: {e}"


def gestor_a_save_misterio(nivel_id, bloque_display, misterio_label, data,
                            titulo, subtitulo, referencia, evangelio,
                            contemplacion, meditacion, intercesion):
    if data is None:
        return "Primero carga un archivo.", None
    if not bloque_display or not misterio_label:
        return "Selecciona un bloque y un misterio primero.", data
    bloque = bloque_display.lower()
    misterios = data.get("misterios", {}).get(bloque, [])
    try:
        num = int(misterio_label.split(" — ")[0].strip())
    except (ValueError, IndexError):
        return "No pude identificar el misterio seleccionado.", data
    idx = next((i for i, m in enumerate(misterios) if m.get("numero") == num), None)
    if idx is None:
        return f"Misterio {num} no encontrado en el bloque '{bloque}'.", data
    data["misterios"][bloque][idx].update({
        "titulo":       titulo.strip()    if titulo       else "",
        "subtitulo":    subtitulo.strip() if subtitulo    else "",
        "referencia":   referencia.strip() if referencia  else "",
        "evangelio":    evangelio         if evangelio    else "",
        "contemplacion": contemplacion    if contemplacion else "",
        "meditacion":   meditacion        if meditacion   else "",
        "intercesion":  intercesion       if intercesion  else "",
    })
    filename = build_gestor_filename(nivel_id, "data")
    try:
        with open(Path(filename), "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
        return f"Misterio {num} guardado correctamente en {filename}.", data
    except Exception as e:
        return f"Error al guardar: {e}", data


# -------------------------------------------------------------------
# Gestor B — Compilador de estructura vacía
# -------------------------------------------------------------------

def _empty_misterio(n: int) -> dict:
    return {
        "numero": n,
        "titulo": "",
        "subtitulo": "",
        "referencia": "",
        "evangelio": "",
        "contemplacion": "",
        "meditacion": "Por María hacia Jesús:\n\nDesde el Hijo hacia el Padre:\n\nHijos y hermanos en el Espíritu:\n",
        "intercesion": "",
    }


def _empty_micro_block() -> dict:
    empty_option = lambda: {"texto": "", "emoji": "", "eco": ""}
    empty_question = lambda: {"pregunta": "", "opciones": [empty_option(), empty_option()]}
    return {
        "subtitulo": "",
        "tarjetas": [{"emoji": "", "titulo": "", "contenido": ""} for _ in range(4)],
        "preguntas": [empty_question() for _ in range(3)],
    }


def create_empty_structure(file_type: str, nivel_id: str, mundo: str, cuaderno: str, tension: str):
    nid = nivel_id.strip().zfill(4)
    filename = build_gestor_filename(nid, file_type)
    path = Path(filename)

    nums_data = {
        "gozosos": range(1, 6),
        "luminosos": range(6, 11),
        "dolorosos": range(11, 16),
        "gloriosos": range(16, 21),
    }

    if file_type == "data":
        data = {
            "tema": {
                "id": nid,
                "mundo_slug": "",
                "mundo_nombre": mundo,
                "elemento_slug": "",
                "siguiente": "",
            },
            "mundo": mundo,
            "elemento": cuaderno,
            "numero": "",
            "audio_rezo": "",
            "subtitulos_bloque": {b: "" for b in BLOQUES},
            "misterios": {b: [_empty_misterio(n) for n in rng] for b, rng in nums_data.items()},
        }
    elif file_type == "micro":
        data = {
            "id": nid,
            "nivel": mundo,
            "cuaderno": cuaderno,
            "tension_vertebral": tension,
            "bloques": {b: _empty_micro_block() for b in BLOQUES},
        }
    elif file_type == "cantos":
        data = {
            "nivel": nid,
            "cantos": {
                b: [{"numero": n, "titulo": "", "letra": ""} for n in rng]
                for b, rng in nums_data.items()
            },
        }
    else:
        return "", "Tipo de archivo desconocido."

    preview = json.dumps(data, indent=2, ensure_ascii=False)

    if path.exists():
        return preview, f"Aviso: {filename} ya existe — NO se sobreescribió. Copia el JSON si lo necesitas."

    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
    return preview, f"Archivo creado: {filename}"


# -------------------------------------------------------------------
# Gestor C — Bulk IA (parseo de misterios)
# -------------------------------------------------------------------

_PARSER_SYSTEM = (
    "Eres un parser de contenido para la app CruzAndo. "
    "Recibirás texto de uno o más misterios del Rosario extraído de un cuaderno de formación espiritual. "
    "Tu tarea es convertirlo en un arreglo JSON con esta estructura exacta por cada misterio:\n"
    "[\n"
    "  {\n"
    '    "numero": <número local 1-5 dentro del bloque>,\n'
    '    "titulo": "<nombre oficial del misterio, sin el ordinal>",\n'
    '    "subtitulo": "<subtítulo temático del misterio>",\n'
    '    "referencia": "<cita bíblica, ej: Lucas 1:26-31 (DHH)>",\n'
    '    "evangelio": "<texto completo del evangelio, respetando \\n para saltos de párrafo>",\n'
    '    "contemplacion": "<texto completo de contemplación, respetando \\n para saltos de párrafo>",\n'
    '    "meditacion": "Por María hacia Jesús:\\n<pregunta>\\nDesde el Hijo hacia el Padre:\\n<pregunta>\\nHijos y hermanos en el Espíritu:\\n<pregunta>",\n'
    '    "intercesion": "<texto completo de la intercesión>"\n'
    "  }\n"
    "]\n"
    "Ignora completamente la sección MI CAMINO CON ESTE MISTERIO.\n"
    "Devuelve SOLO el arreglo JSON, sin explicaciones, sin markdown, sin backticks."
)


def parse_misterios_with_ai(raw_text: str):
    if not OPENAI_API_KEY:
        return "", "No encontré OPENAI_API_KEY."
    if not raw_text.strip():
        return "", "Pega el texto a parsear."
    headers = {"Authorization": f"Bearer {OPENAI_API_KEY}", "Content-Type": "application/json"}
    payload = {"model": TEXT_MODEL, "instructions": _PARSER_SYSTEM, "input": raw_text}
    try:
        r = requests.post(RESPONSES_API_URL, headers=headers, json=payload, timeout=180)
        r.raise_for_status()
        generated = extract_output_text_from_responses_api(r.json())
    except requests.HTTPError as e:
        try:
            detail = r.json()
        except Exception:
            detail = r.text
        return "", f"Error HTTP: {detail}"
    except Exception as e:
        return "", f"Error: {e}"
    if not generated.strip():
        return "", "La IA no devolvió texto."
    try:
        parsed = json.loads(generated)
        return json.dumps(parsed, indent=2, ensure_ascii=False), f"{len(parsed)} misterio(s) parseados. Revisa antes de agregar."
    except json.JSONDecodeError as e:
        return generated, f"Aviso: JSON inválido de IA en línea {e.lineno}. Corrige manualmente."


def add_misterios_to_block(nivel_id: str, bloque: str, parsed_text: str):
    if not nivel_id.strip():
        return "Indica el ID del nivel."
    if not parsed_text.strip():
        return "No hay misterios parseados para agregar."
    filename = build_gestor_filename(nivel_id, "data")
    path = Path(filename)
    if not path.exists():
        return f"No encontré: {filename}"
    try:
        new_items = json.loads(parsed_text)
    except json.JSONDecodeError as e:
        return f"JSON inválido: línea {e.lineno} — {e.msg}"
    if not isinstance(new_items, list):
        return "Los datos parseados deben ser una lista JSON."
    with open(path, "r", encoding="utf-8") as f:
        data = json.load(f)
    existing = data.get("misterios", {}).get(bloque, [])
    existing_nums = {m.get("numero") for m in existing}
    dups = [m.get("numero") for m in new_items if m.get("numero") in existing_nums]
    if dups:
        return f"Números duplicados encontrados: {dups}. Corrige antes de guardar."
    existing.extend(new_items)
    existing.sort(key=lambda m: m.get("numero", 0))
    data.setdefault("misterios", {})[bloque] = existing
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
    return f"Agregados {len(new_items)} misterio(s) al bloque '{bloque}' en {filename}"


# -------------------------------------------------------------------
# Gestor D — Micro IA
# -------------------------------------------------------------------

_MICRO_SYSTEM = (
    "Eres un asistente de formación espiritual católica para la app CruzAndo. Recibirás:\n"
    "1. El texto de introducción de un cuaderno de formación\n"
    "2. Los datos de los misterios del Rosario de ese nivel en JSON\n"
    "Tu tarea es generar el archivo micro-learning completo con esta estructura exacta:\n"
    '{\n'
    '  "id": "<id del nivel>",\n'
    '  "nivel": "<nombre del mundo/nivel>",\n'
    '  "cuaderno": "<nombre del cuaderno>",\n'
    '  "tension_vertebral": "<frase vertebral>",\n'
    '  "bloques": {\n'
    '    "gozosos": {\n'
    '      "subtitulo": "<tomado exactamente del campo subtitulos_bloque del JSON>",\n'
    '      "tarjetas": [\n'
    '        {"emoji": "...", "titulo": "<máx 5 palabras>", "contenido": "<2-3 líneas, accesible para adultos 50+>"}\n'
    '      ],\n'
    '      "preguntas": [\n'
    '        {"pregunta": "<directa, en segunda persona singular>",\n'
    '         "opciones": [\n'
    '           {"texto": "<opción A, en primera persona>", "emoji": "...", "eco": "<máx 10 palabras, cálido>"},\n'
    '           {"texto": "<opción B, en primera persona>", "emoji": "...", "eco": "<máx 10 palabras, cálido>"}\n'
    '         ]}\n'
    '      ]\n'
    '    },\n'
    '    "luminosos": { "subtitulo": "...", "tarjetas": [...], "preguntas": [...] },\n'
    '    "dolorosos": { "subtitulo": "...", "tarjetas": [...], "preguntas": [...] },\n'
    '    "gloriosos": { "subtitulo": "...", "tarjetas": [...], "preguntas": [...] }\n'
    '  }\n'
    '}\n'
    "Reglas estrictas:\n"
    "- Exactamente 4 tarjetas por bloque\n"
    "- Exactamente 3 preguntas por bloque, cada una con exactamente 2 opciones\n"
    "- Las tarjetas derivan del texto de introducción y de las contemplaciones del JSON\n"
    "- Tono cálido, pastoral, no académico, no moralista\n"
    "- Preguntas en segunda persona singular (tú)\n"
    "- Los ecos acompañan sin juzgar ni premiar\n"
    "- Los subtítulos de cada bloque se toman EXACTAMENTE del campo subtitulos_bloque del JSON\n"
    "- Devuelve SOLO el JSON, sin explicaciones, sin markdown, sin backticks"
)


def generate_micro_with_ai(nivel_id: str, intro_text: str, tension: str, cuaderno_name: str):
    if not OPENAI_API_KEY:
        return "", "No encontré OPENAI_API_KEY."
    if not nivel_id.strip():
        return "", "Indica el ID del nivel."
    filename = build_gestor_filename(nivel_id, "data")
    path = Path(filename)
    if not path.exists():
        return "", f"No encontré el archivo de datos: {filename}"
    with open(path, "r", encoding="utf-8") as f:
        data = json.load(f)
    mundo = data.get("mundo", "")
    context = {
        "subtitulos_bloque": data.get("subtitulos_bloque", {}),
        "resumen_misterios": {
            b: [
                {
                    "titulo": m.get("titulo", ""),
                    "subtitulo": m.get("subtitulo", ""),
                    "contemplacion": m.get("contemplacion", "")[:400],
                }
                for m in data.get("misterios", {}).get(b, [])
            ]
            for b in BLOQUES
        },
    }
    user_input = (
        f"ID del nivel: {nivel_id.strip().zfill(4)}\n"
        f"Nombre del nivel (mundo): {mundo}\n"
        f"Cuaderno: {cuaderno_name}\n"
        f"Tensión vertebral: {tension}\n\n"
        f"INTRODUCCIÓN DEL CUADERNO:\n{intro_text}\n\n"
        f"DATOS DEL NIVEL (JSON):\n{json.dumps(context, ensure_ascii=False, indent=2)}"
    )
    headers = {"Authorization": f"Bearer {OPENAI_API_KEY}", "Content-Type": "application/json"}
    payload = {"model": TEXT_MODEL, "instructions": _MICRO_SYSTEM, "input": user_input}
    try:
        r = requests.post(RESPONSES_API_URL, headers=headers, json=payload, timeout=300)
        r.raise_for_status()
        generated = extract_output_text_from_responses_api(r.json())
    except requests.HTTPError as e:
        try:
            detail = r.json()
        except Exception:
            detail = r.text
        return "", f"Error HTTP: {detail}"
    except Exception as e:
        return "", f"Error: {e}"
    if not generated.strip():
        return "", "La IA no devolvió texto."
    try:
        parsed = json.loads(generated)
        parsed.setdefault("id", nivel_id.strip().zfill(4))
        parsed.setdefault("nivel", mundo)
        parsed.setdefault("cuaderno", cuaderno_name)
        parsed.setdefault("tension_vertebral", tension)
        return json.dumps(parsed, indent=2, ensure_ascii=False), "Micro generado. Revisa y edita antes de guardar."
    except json.JSONDecodeError as e:
        return generated, f"JSON inválido de IA en línea {e.lineno}. Corrige manualmente."


def save_micro_preview(nivel_id: str, content: str):
    if not nivel_id.strip():
        return "Indica el ID del nivel."
    if not content.strip():
        return "El contenido está vacío."
    try:
        data = json.loads(content)
    except json.JSONDecodeError as e:
        return f"JSON inválido en línea {e.lineno}: {e.msg}\nArchivo NO guardado."
    filename = build_gestor_filename(nivel_id, "micro")
    with open(Path(filename), "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
    return f"Guardado: {filename}"


# -------------------------------------------------------------------
# Mejorar estilo con IA
# -------------------------------------------------------------------

_ESTILO_SYSTEM = (
    "Eres el corrector de estilo del P. César Ricardo Montijo Rivas, sacerdote mexicano y autor de CruzAndo. "
    "Recibirás un texto de audio para la app: puede ser una bienvenida, una despedida, una contemplación, "
    "una pregunta de meditación, una intercesión u otro guion de sesión de oración. "
    "Tu tarea es corregir ortografía, puntuación y fluidez oral, conservando íntegramente la voz y el estilo del autor. "
    "Reglas estrictas:\n"
    "- NO reescribas ni parafrasees: solo corrige errores reales y mejora levemente la fluidez donde sea necesario.\n"
    "- Conserva todas las elipsis (…), exclamaciones, preguntas retóricas y pausas dramáticas tal como están.\n"
    "- No añadas ni elimines ideas, frases ni párrafos.\n"
    "- No cambies el tono ni la estructura.\n"
    "- El texto es para ser leído en voz alta: prioriza el ritmo oral sobre las normas académicas.\n"
    "- Devuelve SOLO el texto corregido, sin explicaciones, sin comentarios, sin marcas de cambio."
)


def mejorar_estilo_con_ia(text: str):
    if not OPENAI_API_KEY:
        raise gr.Error("No encontré OPENAI_API_KEY en tu archivo .env")
    if not text or not text.strip():
        raise gr.Error("No hay texto en la caja para mejorar.")

    headers = {"Authorization": f"Bearer {OPENAI_API_KEY}", "Content-Type": "application/json"}
    payload = {
        "model": TEXT_MODEL,
        "instructions": _ESTILO_SYSTEM,
        "input": text.strip(),
    }

    try:
        r = requests.post(RESPONSES_API_URL, headers=headers, json=payload, timeout=180)
        r.raise_for_status()
        result = extract_output_text_from_responses_api(r.json())
    except requests.HTTPError as e:
        try:
            detail = r.json()
        except Exception:
            detail = r.text
        raise gr.Error(f"Error HTTP al mejorar texto:\n{detail}") from e
    except Exception as e:
        raise gr.Error(f"Error al mejorar texto: {e}") from e

    if not result.strip():
        raise gr.Error("La IA no devolvió texto.")

    return result, f"Texto mejorado con IA | Modelo: {TEXT_MODEL}"


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
    font-size: 18px !important;
    line-height: 1.6 !important;
}

#editor_content textarea {
    height: 500px !important;
    max-height: 500px !important;
    overflow-y: auto !important;
    font-family: monospace !important;
    font-size: 13px !important;
}

#gestor_block textarea {
    height: 320px !important;
    max-height: 320px !important;
    overflow-y: auto !important;
    font-family: monospace !important;
    font-size: 12px !important;
}

#gestor_bulk textarea,
#gestor_preview textarea,
#gestor_micro_intro textarea,
#gestor_micro_preview textarea,
#gestor_b_preview textarea {
    font-family: monospace !important;
    font-size: 13px !important;
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

    with gr.Tabs():

        # ============================================================
        # TAB 1 — TTS Maker (flujo original)
        # ============================================================
        with gr.Tab("TTS Maker"):
            with gr.Row():

                with gr.Column(scale=1):
                    gr.Markdown("### Fuente")
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

                with gr.Column(scale=2):
                    gr.Markdown("### Trabajo")
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
                    with gr.Row():
                        mejorar_btn = gr.Button("✨ Mejorar estilo", variant="secondary")
                        generate_btn = gr.Button("🎧 Generar audio", variant="primary")

                with gr.Column(scale=1):
                    gr.Markdown("### Resultado")
                    filename_preview = gr.Textbox(label="Nombre de archivo previsto")
                    voice_info = gr.Textbox(label="Información de voz / aviso", lines=3)
                    audio_output = gr.Audio(label="Vista previa", type="filepath")
                    next_section_btn = gr.Button("➡️ Siguiente sección")
                    result_output = gr.Textbox(label="Resultado", lines=8)
                    download_output = gr.File(label="Descargar MP3")

            with gr.Accordion("✏️ Editar misterio actual", open=False):
                gr.Markdown(
                    "Edita los campos del misterio cargado y guarda directamente al JSON. "
                    "Los campos se rellenan automáticamente al pulsar **📥 Cargar contexto JSON**."
                )
                with gr.Row():
                    ac_titulo        = gr.Textbox(label="Título", scale=2)
                    ac_subtitulo     = gr.Textbox(label="Subtítulo", scale=2)
                    ac_referencia    = gr.Textbox(label="Referencia bíblica", scale=1)
                ac_evangelio     = gr.Textbox(label="Evangelio", lines=6)
                ac_contemplacion = gr.Textbox(label="Contemplación", lines=6)
                ac_meditacion    = gr.Textbox(label="Meditación", lines=6)
                ac_intercesion   = gr.Textbox(label="Intercesión", lines=4)
                with gr.Row():
                    ac_save_btn   = gr.Button("💾 Guardar cambios en JSON", variant="primary")
                    ac_save_status = gr.Textbox(label="Estado", lines=2, scale=2)

        # ============================================================
        # TAB 2 — Editor de Contenido
        # ============================================================
        with gr.Tab("Editor de Contenido"):
            gr.Markdown("### Edita cualquier archivo JSON del proyecto")
            gr.Markdown(
                "Al guardar se aplican automáticamente dos transformaciones: "
                "las comillas dobles `\"texto\"` dentro de los valores se convierten a `«texto»`, "
                "y los saltos de línea `\\n` se preservan exactamente como están en el JSON."
            )
            with gr.Row():
                editor_json_file = gr.Dropdown(
                    choices=json_choices,
                    value=default_json,
                    label="Archivo JSON",
                )
                editor_reload_btn = gr.Button("🔄", scale=0)
                editor_load_btn = gr.Button("📂 Cargar", scale=0)
            editor_content = gr.Textbox(
                label="Contenido JSON (editable)",
                lines=28,
                elem_id="editor_content",
                placeholder="El contenido del archivo aparecerá aquí formateado con indentación.",
            )
            with gr.Row():
                editor_save_btn = gr.Button("💾 Guardar (convierte comillas)", variant="primary")
                editor_status = gr.Textbox(label="Estado", lines=2)

        # ============================================================
        # TAB 3 — Gestor JSON
        # ============================================================
        with gr.Tab("Gestor JSON"):
            with gr.Tabs():

                # --- Sub-tab A: Visor/Editor por misterio ---
                with gr.Tab("A — Visor/Editor"):
                    gestor_a_data = gr.State(None)

                    gr.Markdown("#### Paso 1 — Cargar archivo de datos")
                    with gr.Row():
                        gestor_a_id = gr.Textbox(label="ID del nivel", placeholder="0101", scale=2)
                        gestor_a_load_btn = gr.Button("📂 Cargar", scale=0)
                    gestor_a_status = gr.Textbox(label="Estado de carga", lines=1, interactive=False)

                    gr.Markdown("#### Paso 2 — Elegir bloque")
                    gestor_a_bloque = gr.Dropdown(
                        choices=["Gozosos", "Luminosos", "Dolorosos", "Gloriosos"],
                        value=None,
                        label="Bloque de misterios",
                    )

                    gr.Markdown("#### Paso 3 — Elegir misterio")
                    gestor_a_misterio = gr.Dropdown(
                        choices=[],
                        value=None,
                        label="Misterio",
                    )

                    gr.Markdown("#### Paso 4 — Editar campos")
                    gestor_a_titulo = gr.Textbox(label="Título", lines=1)
                    gestor_a_subtitulo = gr.Textbox(label="Subtítulo", lines=1)
                    gestor_a_referencia = gr.Textbox(label="Referencia bíblica", lines=1)
                    gestor_a_evangelio = gr.Textbox(label="Evangelio", lines=7)
                    gestor_a_contemplacion = gr.Textbox(label="Contemplación", lines=9)
                    gestor_a_meditacion = gr.Textbox(label="Meditación", lines=6)
                    gestor_a_intercesion = gr.Textbox(label="Intercesión", lines=4)

                    gestor_a_save_btn = gr.Button("💾 Guardar cambios", variant="primary")
                    gestor_a_save_status = gr.Textbox(label="Estado del guardado", lines=2, interactive=False)

                # --- Sub-tab B: Compilador ---
                with gr.Tab("B — Compilador"):
                    gr.Markdown("Crea la estructura vacía de un archivo nuevo con todas las claves presentes.")
                    with gr.Row():
                        gestor_b_type = gr.Radio(
                            choices=["data", "micro", "cantos"],
                            value="data",
                            label="Tipo de archivo",
                        )
                        gestor_b_id = gr.Textbox(label="ID del nivel (4 dígitos)", placeholder="0201")
                    with gr.Row():
                        gestor_b_mundo = gr.Textbox(label="Mundo / Nombre del nivel", placeholder="CruzAndo la Cruz")
                        gestor_b_cuaderno = gr.Textbox(label="Cuaderno / Elemento", placeholder="Males")
                        gestor_b_tension = gr.Textbox(label="Tensión vertebral (solo para micro)", placeholder="La verdad me libera")
                    gestor_b_create_btn = gr.Button("📄 Crear estructura vacía")
                    gestor_b_preview = gr.Textbox(
                        label="Vista previa del JSON generado",
                        lines=22,
                        elem_id="gestor_b_preview",
                    )
                    gestor_b_status = gr.Textbox(label="Estado", lines=2)

                # --- Sub-tab C: Bulk IA misterios ---
                with gr.Tab("C — Bulk IA (misterios)"):
                    gr.Markdown(
                        "Pega el texto de uno o varios misterios tal como viene del cuaderno. "
                        "La IA lo parseará al formato JSON exacto del proyecto."
                    )
                    with gr.Row():
                        gestor_c_id = gr.Textbox(label="ID del nivel destino", placeholder="0101", scale=1)
                        gestor_c_bloque = gr.Dropdown(
                            choices=BLOQUES,
                            value="gozosos",
                            label="Bloque destino",
                            scale=1,
                        )
                    gestor_c_raw = gr.Textbox(
                        label="Texto bulk de misterios (pegar tal como viene del cuaderno)",
                        lines=18,
                        elem_id="gestor_bulk",
                        placeholder="Primer Misterio Gozoso: La Anunciación\n...",
                    )
                    gestor_c_parse_btn = gr.Button("🤖 Parsear con IA", variant="primary")
                    gestor_c_status_parse = gr.Textbox(label="Estado del parseo", lines=2)
                    gestor_c_preview = gr.Textbox(
                        label="Resultado parseado (editable antes de guardar)",
                        lines=20,
                        elem_id="gestor_preview",
                    )
                    gestor_c_add_btn = gr.Button("➕ Agregar al archivo")
                    gestor_c_status_add = gr.Textbox(label="Estado del guardado", lines=2)

                # --- Sub-tab D: Micro IA ---
                with gr.Tab("D — Micro IA"):
                    gr.Markdown(
                        "Genera el archivo `{id}-micro.json` completo con IA a partir de la introducción del cuaderno "
                        "y los datos de misterios ya existentes."
                    )
                    with gr.Row():
                        gestor_d_id = gr.Textbox(label="ID del nivel (debe existir {id}.json)", placeholder="0101", scale=1)
                        gestor_d_cuaderno = gr.Textbox(label="Nombre del cuaderno", placeholder="Males", scale=1)
                        gestor_d_tension = gr.Textbox(label="Tensión vertebral", placeholder="La verdad me libera", scale=2)
                    gestor_d_intro = gr.Textbox(
                        label="Texto de introducción del cuaderno",
                        lines=12,
                        elem_id="gestor_micro_intro",
                        placeholder="Pega aquí el texto de introducción del cuaderno...",
                    )
                    gestor_d_generate_btn = gr.Button("🤖 Generar micro con IA", variant="primary")
                    gestor_d_status_gen = gr.Textbox(label="Estado de generación", lines=2)
                    gestor_d_preview = gr.Textbox(
                        label="Vista previa del micro generado (editable)",
                        lines=28,
                        elem_id="gestor_micro_preview",
                    )
                    gestor_d_save_btn = gr.Button("💾 Guardar como {id}-micro.json")
                    gestor_d_status_save = gr.Textbox(label="Estado del guardado", lines=2)

    # ----------------------------------------------------------------
    # Event handlers — TTS Maker
    # ----------------------------------------------------------------
    reload_json_btn.click(
        fn=reload_json_choices,
        inputs=[],
        outputs=[json_file],
    )

    load_context_btn.click(
        fn=load_context_and_text_with_fields,
        inputs=[json_file, bloque, misterio_en_bloque, section_name],
        outputs=[
            nivel, cuaderno, misterio, titulo_info, context_info, text, voice_info, filename_preview,
            ac_titulo, ac_subtitulo, ac_referencia,
            ac_evangelio, ac_contemplacion, ac_meditacion, ac_intercesion,
        ],
    )

    ac_save_btn.click(
        fn=save_misterio_from_accordion,
        inputs=[
            json_file, bloque, misterio_en_bloque,
            ac_titulo, ac_subtitulo, ac_referencia,
            ac_evangelio, ac_contemplacion, ac_meditacion, ac_intercesion,
        ],
        outputs=[ac_save_status],
    )

    generate_btn.click(
        fn=generate_audio,
        inputs=[text, section_name, nivel, cuaderno, misterio],
        outputs=[audio_output, result_output, filename_preview, download_output],
    )

    mejorar_btn.click(
        fn=mejorar_estilo_con_ia,
        inputs=[text],
        outputs=[text, voice_info],
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

    # ----------------------------------------------------------------
    # Event handlers — Editor de Contenido
    # ----------------------------------------------------------------
    editor_reload_btn.click(
        fn=reload_json_choices,
        inputs=[],
        outputs=[editor_json_file],
    )

    editor_load_btn.click(
        fn=load_json_for_editor,
        inputs=[editor_json_file],
        outputs=[editor_content, editor_status],
    )

    editor_save_btn.click(
        fn=save_json_from_editor,
        inputs=[editor_json_file, editor_content],
        outputs=[editor_status],
    )

    # ----------------------------------------------------------------
    # Event handlers — Gestor A
    # ----------------------------------------------------------------
    gestor_a_load_btn.click(
        fn=gestor_a_load_data,
        inputs=[gestor_a_id],
        outputs=[
            gestor_a_data, gestor_a_status, gestor_a_bloque, gestor_a_misterio,
            gestor_a_titulo, gestor_a_subtitulo, gestor_a_referencia,
            gestor_a_evangelio, gestor_a_contemplacion, gestor_a_meditacion, gestor_a_intercesion,
        ],
    )

    gestor_a_bloque.change(
        fn=gestor_a_update_misterios,
        inputs=[gestor_a_data, gestor_a_bloque],
        outputs=[
            gestor_a_misterio,
            gestor_a_titulo, gestor_a_subtitulo, gestor_a_referencia,
            gestor_a_evangelio, gestor_a_contemplacion, gestor_a_meditacion, gestor_a_intercesion,
        ],
    )

    gestor_a_misterio.change(
        fn=gestor_a_load_misterio_fields,
        inputs=[gestor_a_data, gestor_a_bloque, gestor_a_misterio],
        outputs=[
            gestor_a_titulo, gestor_a_subtitulo, gestor_a_referencia,
            gestor_a_evangelio, gestor_a_contemplacion, gestor_a_meditacion, gestor_a_intercesion,
        ],
    )

    gestor_a_save_btn.click(
        fn=gestor_a_save_misterio,
        inputs=[
            gestor_a_id, gestor_a_bloque, gestor_a_misterio, gestor_a_data,
            gestor_a_titulo, gestor_a_subtitulo, gestor_a_referencia,
            gestor_a_evangelio, gestor_a_contemplacion, gestor_a_meditacion, gestor_a_intercesion,
        ],
        outputs=[gestor_a_save_status, gestor_a_data],
    )

    # ----------------------------------------------------------------
    # Event handlers — Gestor B
    # ----------------------------------------------------------------
    gestor_b_create_btn.click(
        fn=create_empty_structure,
        inputs=[gestor_b_type, gestor_b_id, gestor_b_mundo, gestor_b_cuaderno, gestor_b_tension],
        outputs=[gestor_b_preview, gestor_b_status],
    )

    # ----------------------------------------------------------------
    # Event handlers — Gestor C
    # ----------------------------------------------------------------
    gestor_c_parse_btn.click(
        fn=parse_misterios_with_ai,
        inputs=[gestor_c_raw],
        outputs=[gestor_c_preview, gestor_c_status_parse],
    )

    gestor_c_add_btn.click(
        fn=add_misterios_to_block,
        inputs=[gestor_c_id, gestor_c_bloque, gestor_c_preview],
        outputs=[gestor_c_status_add],
    )

    # ----------------------------------------------------------------
    # Event handlers — Gestor D
    # ----------------------------------------------------------------
    gestor_d_generate_btn.click(
        fn=generate_micro_with_ai,
        inputs=[gestor_d_id, gestor_d_intro, gestor_d_tension, gestor_d_cuaderno],
        outputs=[gestor_d_preview, gestor_d_status_gen],
    )

    gestor_d_save_btn.click(
        fn=save_micro_preview,
        inputs=[gestor_d_id, gestor_d_preview],
        outputs=[gestor_d_status_save],
    )

if __name__ == "__main__":
    demo.launch(
        inbrowser=True,
        allowed_paths=[
            r"C:\R2\cruzando-audios",
            r"C:\R2\cruzando-music",
            r"C:\R2\cruzando-ilustraciones",
        ]
    )