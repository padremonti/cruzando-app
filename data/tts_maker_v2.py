# =========================
# CRUZANDO TTS MAKER FINAL
# =========================

import json
import os
from pathlib import Path
import requests
import gradio as gr
from dotenv import load_dotenv

load_dotenv()
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")

AUDIO_API_URL = "https://api.openai.com/v1/audio/speech"
TEXT_API_URL = "https://api.openai.com/v1/responses"

TTS_MODEL = "gpt-4o-mini-tts"
TEXT_MODEL = "gpt-4o-mini"

OUTPUT_DIR = Path("tts_outputs")
OUTPUT_DIR.mkdir(exist_ok=True)

# -------------------------
# CONFIG SECCIONES
# -------------------------

SECTION_CODES = {
    "Bienvenida": "START",
    "Camino y Palabra": "UBIBLE",
    "Contemplacion": "CONT",
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
    "Pregunta A": "alloy",
    "Pregunta B": "alloy",
    "Pregunta C": "alloy",
    "Oracion final": "onyx",
    "Despedida": "nova",
}

MISTERIOS_OFICIALES = {
    1: "Primer Misterio Gozoso: La encarnación del Hijo de Dios.",
    2: "Segundo Misterio Gozoso: La visitación de Nuestra Señora a su prima Santa Isabel.",
    3: "Tercer Misterio Gozoso: El nacimiento del Hijo de Dios.",
    4: "Cuarto Misterio Gozoso: La Presentación de Jesús en el templo.",
    5: "Quinto Misterio Gozoso: El Niño Jesús perdido y hallado en el templo.",
    6: "Primer Misterio Luminoso: El Bautismo de Jesús en el Jordán.",
    7: "Segundo Misterio Luminoso: La autorrevelación de Jesús en las bodas de Caná.",
    8: "Tercer Misterio Luminoso: El anuncio del Reino de Dios invitando a la conversión.",
    9: "Cuarto Misterio Luminoso: La Transfiguración.",
    10: "Quinto Misterio Luminoso: La Institución de la Eucaristía.",
    11: "Primer Misterio Doloroso: La Oración de Jesús en el Huerto.",
    12: "Segundo Misterio Doloroso: La Flagelación del Señor.",
    13: "Tercer Misterio Doloroso: La Coronación de espinas.",
    14: "Cuarto Misterio Doloroso: Jesús con la Cruz a cuestas camino del Calvario.",
    15: "Quinto Misterio Doloroso: La Crucifixión y Muerte de Nuestro Señor.",
    16: "Primer Misterio Glorioso: La Resurrección del Hijo de Dios.",
    17: "Segundo Misterio Glorioso: La Ascensión del Señor a los Cielos.",
    18: "Tercer Misterio Glorioso: La Venida del Espíritu Santo sobre los Apóstoles.",
    19: "Cuarto Misterio Glorioso: La Asunción de Nuestra Señora a los Cielos.",
    20: "Quinto Misterio Glorioso: La Coronación de la Santísima Virgen como Reina de Cielos y Tierra.",
}
# -------------------------
# UTILIDADES
# -------------------------

def build_filename(section, n, c, m):
    return f"{SECTION_CODES[section]}_{n}_{c}_{m}.mp3"

def abrir_carpeta():
    os.startfile(OUTPUT_DIR.resolve())

def siguiente_seccion(actual):
    orden = list(SECTION_CODES.keys())
    i = orden.index(actual)
    return orden[(i+1)%len(orden)]

# -------------------------
# JSON
# -------------------------

def cargar_json(file):
    with open(file, encoding="utf-8") as f:
        return json.load(f)

def split_preguntas(texto):
    partes = texto.split("\n")
    return partes[0], partes[1] if len(partes)>1 else "", partes[2] if len(partes)>2 else ""

# -------------------------
# IA TEXTO
# -------------------------

def generar_texto_ia(section, referencia, evangelio, contexto, misterio):
    prompt = ""

    if section == "Camino y Palabra":
        misterio_oficial = MISTERIOS_OFICIALES.get(int(misterio), "")

        prompt = f"""
Genera el texto final para la sección "Camino y Palabra" de CruzAndo.

REGLAS OBLIGATORIAS:

1. Comienza EXACTAMENTE con el nombre del misterio:
{misterio_oficial}

2. Luego escribe el encabezado según el tipo de texto:

- Evangelio:
  "Del Santo Evangelio según San [autor], capítulo [ordinal]."

- Epístola o carta:
  "De la Epístola o Carta de [autor], capítulo [ordinal]."

- Otro libro bíblico:
  "Del Libro de [nombre], capítulo [ordinal]."

- Catecismo:
  "Del Catecismo de la Iglesia Católica, número [número]."

3. Convierte el capítulo a ordinal en español.

4. Luego escribe el texto íntegro:

{evangelio}

5. Cierre:

- Evangelio → Palabra del Señor
- Otro texto bíblico → Palabra de Dios
- Catecismo → sin cierre

6. No agregues explicaciones.
7. No modifiques el contenido del texto.

Devuelve SOLO el texto final.
"""

    elif section == "Bienvenida":
        prompt = f"""
Genera una bienvenida breve para CruzAndo.

Contexto:
{contexto}

Debe terminar EXACTAMENTE así:

Respira hondo…
Abre tu corazón…
Comencemos a cruzar…
"""

    elif section == "Despedida":
        prompt = """
Genera una despedida breve, cálida, motivadora y esperanzadora para CruzAndo.
Debe sonar cercana, luminosa y con impulso para seguir caminando.
"""

    else:
        return ""

    headers = {
        "Authorization": f"Bearer {OPENAI_API_KEY}",
        "Content-Type": "application/json",
    }

    r = requests.post(
        TEXT_API_URL,
        headers=headers,
        json={
            "model": TEXT_MODEL,
            "input": prompt
        }
    )

    r.raise_for_status()
    data = r.json()

    try:
        return data["output"][0]["content"][0]["text"]
    except Exception:
        return str(data)

# -------------------------
# TTS
# -------------------------

def generar_audio(texto, section, n, c, m):
    texto = texto.strip() + "\n\nFin del texto."

    headers = {
        "Authorization": f"Bearer {OPENAI_API_KEY}",
        "Content-Type": "application/json",
    }

    filename = build_filename(section, n, c, m)
    path = OUTPUT_DIR / filename

    r = requests.post(AUDIO_API_URL, headers=headers, json={
        "model": TTS_MODEL,
        "voice": SECTION_VOICES[section],
        "input": texto
    })

    with open(path, "wb") as f:
        f.write(r.content)

    return str(path), filename

# -------------------------
# ORACION FINAL (sin IA)
# -------------------------

def formatear_oracion(texto):
    return f"Oración Final\n\n{texto.strip()}"

# -------------------------
# UI
# -------------------------

with gr.Blocks() as app:

    json_file = gr.Dropdown(choices=[f.name for f in Path(".").glob("*.json")])

    bloque = gr.Dropdown(["gozosos","luminosos","dolorosos","gloriosos"])
    misterio = gr.Number(value=1)

    nivel = gr.Number(value=1)
    cuaderno = gr.Number(value=1)

    section = gr.Dropdown(list(SECTION_CODES.keys()))

    texto = gr.Textbox(lines=10)

    preview = gr.Textbox()
    audio = gr.Audio()
    archivo = gr.File()

    with gr.Row():
        btn_load = gr.Button("Cargar base")
        btn_ia = gr.Button("Generar IA")
        btn_tts = gr.Button("Generar audio")

    btn_next = gr.Button("Siguiente sección")
    btn_open = gr.Button("Abrir carpeta")

    # LOAD BASE
    def load_base(file, bloque, m, section):
        data = cargar_json(file)
        rec = data["misterios"][bloque][int(m)-1]

        if section == "Camino y Palabra":
            return rec["evangelio"]

        if section == "Contemplacion":
            return rec["contemplacion"]

        if section.startswith("Pregunta"):
            a,b,c = split_preguntas(rec["meditacion"])
            return {"Pregunta A":a,"Pregunta B":b,"Pregunta C":c}[section]

        if section == "Oracion final":
            return formatear_oracion(rec["intercesion"])

        return ""

    btn_load.click(load_base, [json_file,bloque,misterio,section], texto)

    # IA
def run_ia(file, bloque, m, section):
    try:
        m = int(m)
    except:
        return "Error: el número de misterio no es válido"

    data = cargar_json(file)

    try:
        rec = data["misterios"][bloque][m - 1]
    except Exception as e:
        return f"Error accediendo al misterio: {e}"

    contexto = rec.get("titulo", "")

    return generar_texto_ia(
        section,
        rec.get("referencia", ""),
        rec.get("evangelio", ""),
        contexto,
        m
    )

    btn_ia.click(run_ia, [json_file,bloque,misterio,section], texto)

    # TTS
    def run_tts(texto,section,n,c,m):
        path, name = generar_audio(texto,section,n,c,m)
        return path, name, path

    btn_tts.click(run_tts, [texto,section,nivel,cuaderno,misterio],
                  [audio,preview,archivo])

    btn_next.click(siguiente_seccion, section, section)
    btn_open.click(lambda: abrir_carpeta(), None, None)

app.launch()