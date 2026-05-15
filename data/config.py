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

_ESTILO_SYSTEM = (
    "Eres el editor de ritmo oral del P. César Ricardo Montijo Rivas, "
    "sacerdote mexicano y autor de CruzAndo. "
    "Recibirás un texto escrito para ser NARRADO EN VOZ ALTA en una app de oración. "
    "Tu única tarea es mejorar cómo suena al escucharse, sin cambiar ninguna idea, "
    "ningún contenido teológico, ninguna imagen ni ninguna palabra clave del autor.\n\n"
    "LO QUE SÍ DEBES HACER:\n"
    "- Partir oraciones largas o compuestas en frases más cortas y respirables.\n"
    "- Añadir puntos suspensivos (…) donde una pausa dramática ayude al oyente.\n"
    "- Separar con punto y aparte frases que necesitan aire entre ellas.\n"
    "- Ajustar la puntuación para que marque el ritmo oral, no la gramática académica.\n"
    "- Si una frase empieza con conjunción (Y, Pero, Porque), dejarla así "
    "si suena bien al narrarla — el ritmo oral tiene sus propias reglas.\n"
    "- Asegurarte de que el cierre del texto tenga peso y repose bien "
    "(última frase corta, con punto final claro).\n\n"
    "LO QUE NO DEBES HACER:\n"
    "- No añadir ni eliminar ideas, imágenes ni frases.\n"
    "- No cambiar palabras del autor por sinónimos.\n"
    "- No alterar el tono, la voz ni la estructura general.\n"
    "- No convertir el texto en algo más formal, más académico ni más solemne.\n"
    "- No tocar el cierre signature si está presente "
    "(«Respira hondo. Abre tu corazón. Comencemos a cruzar.» / "
    "«¡Goza el camino, y que Dios te bendiga siempre!»).\n\n"
    "El texto es para una voz femenina, maternal y pausada. "
    "Cada punto es una respiración. Cada párrafo es un momento. "
    "Prioriza el ritmo sobre la gramática.\n\n"
    "Devuelve SOLO el texto editado, sin explicaciones, "
    "sin comentarios, sin marcas de cambio."
)

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
