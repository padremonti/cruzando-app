import os
import re
import json
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()

OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")

AUDIO_API_URL = "https://api.openai.com/v1/audio/speech"
RESPONSES_API_URL = "https://api.openai.com/v1/responses"

TTS_MODEL = "tts-1"
TEXT_MODEL = "gpt-4o-mini"
AUDIO_FORMAT = "mp3"

OUTPUT_DIR = Path(r"C:\R2\cruzando-audios")
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

NOTAS_FILE = Path("notas_produccion.json")

TTS_COST_PER_CHAR: dict = {
    "tts-1": 15 / 1_000_000,
    "tts-1-hd": 30 / 1_000_000,
}

AI_COST_PER_TOKEN: dict = {
    "gpt-4o-mini": {"input": 0.150 / 1_000_000, "output": 0.600 / 1_000_000},
    "gpt-4o":      {"input": 2.50  / 1_000_000, "output": 10.00 / 1_000_000},
}

MP3_FOLDER_MAP: dict = {
    "START":  "start",
    "UBIBLE": "ubible",
    "CONT":   "cont",
    "QA":     "q",
    "QB":     "q",
    "QC":     "q",
    "PRAY":   "pray",
    "BYE":    "bye",
    "CANTO":  "cantos",
    "BGM":    "BGM",
}

MP3_PROTECTED_FOLDERS: set = {
    "overview", "nivel_1", "global", "extras", "Mezcla"
}

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

SECTION_SPEEDS: dict = {
    "Bienvenida":       1.0,
    "Camino y Palabra": 0.95,
    "Contemplacion":    0.92,
    "Pregunta A":       0.93,
    "Pregunta B":       0.93,
    "Pregunta C":       0.93,
    "Oracion final":    0.95,
    "Despedida":        1.0,
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

from prompts import _PARSER_SYSTEM, _MICRO_SYSTEM, _ESTILO_SYSTEM
from styles import custom_css

__all__ = [
    "_PARSER_SYSTEM", "_MICRO_SYSTEM", "_ESTILO_SYSTEM", "custom_css",
]
