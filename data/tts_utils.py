import json
import logging
from pathlib import Path

import gradio as gr
import requests

logger = logging.getLogger(__name__)

from config import (
    OPENAI_API_KEY,
    AUDIO_API_URL,
    RESPONSES_API_URL,
    TTS_MODEL,
    TEXT_MODEL,
    AUDIO_FORMAT,
    OUTPUT_DIR,
    SECTION_VOICES,
    SECTION_INSTRUCTIONS,
    SECTION_CODES,
    SECTION_SPEEDS,
    BLOQUES,
    TTS_COST_PER_CHAR,
    AI_COST_PER_TOKEN,
)
from prompts import _PARSER_SYSTEM, _MICRO_SYSTEM, _ESTILO_SYSTEM
from json_utils import (
    load_json_file,
    get_misterio_record,
    parse_tema_id_to_level_and_cuaderno,
    build_context_summary,
    build_standard_filename,
    ensure_terminal_punctuation,
    build_gestor_filename,
    get_misterios_for_block,
    load_base_text,
)


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


def _call_responses_api(input_text: str, instructions: str = "", timeout: int = 180) -> tuple:
    """Llama a la Responses API. Devuelve (text, cost_usd). Lanza gr.Error en fallo."""
    if not OPENAI_API_KEY:
        raise gr.Error("No encontré OPENAI_API_KEY en tu archivo .env")
    headers = {"Authorization": f"Bearer {OPENAI_API_KEY}", "Content-Type": "application/json"}
    payload: dict = {"model": TEXT_MODEL, "input": input_text}
    if instructions:
        payload["instructions"] = instructions
    try:
        r = requests.post(RESPONSES_API_URL, headers=headers, json=payload, timeout=timeout)
        r.raise_for_status()
        resp_json = r.json()
        text = extract_output_text_from_responses_api(resp_json)
    except requests.HTTPError as e:
        try:
            detail = r.json()
        except Exception:
            detail = r.text
        logger.warning("_call_responses_api HTTP error: %s", detail)
        raise gr.Error(f"Error HTTP: {detail}") from e
    except Exception as e:
        logger.warning("_call_responses_api connection error: %s", e, exc_info=True)
        raise gr.Error(f"Error de conexión: {e}") from e
    if not text.strip():
        raise gr.Error("La IA no devolvió texto útil.")
    usage = resp_json.get("usage", {})
    rates = AI_COST_PER_TOKEN.get(TEXT_MODEL, {"input": 0.0, "output": 0.0})
    cost = (usage.get("input_tokens", 0) * rates["input"]
            + usage.get("output_tokens", 0) * rates["output"])
    return text, cost


def _build_bienvenida_prompt(titulo, subtitulo, bloque, subtitulo_bloque, referencia) -> str:
    return f"""
Eres el asistente de redacción del P. César Ricardo Montijo Rivas, sacerdote mexicano
y creador de CruzAndo, una peregrinación espiritual gamificada basada en el Santo Rosario.
Escribe un borrador de Bienvenida (START) que él revisará y editará.

CONTEXTO DEL MISTERIO:
- Misterio: {titulo}
- Subtítulo: {subtitulo}
- Bloque: {bloque} — {subtitulo_bloque}
- Cita bíblica que se leerá en esta sesión: {referencia}

ESTRUCTURA OBLIGATORIA (en este orden exacto, sin añadir secciones extra):

1. SALUDO INICIAL — una sola frase coloquial, cálida y variada.
   Puede ser una bienvenida directa, una pregunta que crea tensión espiritual,
   una invitación a soltar el ruido del día, una metáfora del camino,
   o una frase de complicidad pastoral.
   Ejemplos de tono (no copiar literalmente):
   "Bienvenido otra vez. Hoy el camino se abre un poco más."
   "¿Y si hoy Dios quisiera hablarte desde algo muy sencillo?"
   "Antes de seguir, suelta un poco el ruido del día."
   "Hoy damos otro paso, aunque sea pequeño. También eso cuenta."
   "Ven como estás. Dios sabe leer incluso tu cansancio."

2. FRASE INTRODUCTORIA — una o dos frases inspiradas en el subtítulo del misterio
   ("{subtitulo}"), que generen tensión espiritual o curiosidad contemplativa.
   Debe hacer referencia explícita a la cita bíblica que se leerá,
   indicando libro, capítulo y versículos en forma oral
   (ej: "Lucas uno, versículos veintiséis al treinta y uno").

3. CIERRE SIGNATURE — estas tres líneas exactas, sin modificar ni añadir nada después:
Respira hondo.
Abre tu corazón.
Comencemos a cruzar.

ESTILO:
- Voz femenina, maternal y cercana. No predica: acompaña.
- Segunda persona singular (tú), directa y personal.
- Frases cortas. Párrafos cortos. Espacio entre ideas.
- Sin academicismos, sin solemnidad, sin teatralidad.
- Máximo 4-5 frases entre el saludo y el cierre signature.
- El texto es para ser leído en voz alta: prioriza el ritmo oral.

Devuelve SOLO el texto de la Bienvenida, sin títulos, sin explicaciones,
sin comillas envolventes.
"""


def _build_despedida_prompt(titulo, subtitulo, bloque, subtitulo_bloque, misterio_numero) -> str:
    return f"""
Eres el asistente de redacción del P. César Ricardo Montijo Rivas, sacerdote mexicano
y creador de CruzAndo, una peregrinación espiritual gamificada basada en el Santo Rosario.
Escribe un borrador de Despedida (BYE) que él revisará y editará.

CONTEXTO DEL MISTERIO:
- Misterio: {titulo}
- Subtítulo: {subtitulo}
- Bloque: {bloque} — {subtitulo_bloque}
- Número global del misterio en este nivel: {misterio_numero} de 20

ESTRUCTURA OBLIGATORIA (en este orden exacto):

1. REMATE CONTEMPLATIVO — una o dos frases que recogen el fruto espiritual
   del misterio recién rezado ("{titulo} — {subtitulo}").
   Debe sonar como un eco de lo que el peregrino acaba de contemplar,
   no como un resumen ni una conclusión moral.

2. ALUSIÓN AL DIARIO PERSONAL — incluir ÚNICAMENTE si {misterio_numero} == {misterio_numero}
   y este es el número donde narrativamente encaja mejor entre 1 y 20.
   La lógica: incluir esta alusión solo una vez en los 20 misterios del nivel,
   en el misterio donde el remate contemplativo la haga fluir con naturalidad.
   Si decides incluirla, una sola frase, ej:
   "Si algo de este misterio tocó tu corazón, puedes escribirlo en tu diario."
   Si no corresponde incluirla en este misterio, omite esta sección completamente.

3. DESPEDIDA COLOQUIAL — una frase cálida de hasta pronto, variada,
   que no suene genérica ni comercial.
   Ejemplos de tono (no copiar literalmente):
   "Que sigas caminando con esa misma presencia."
   "Te espero en la próxima estación del camino."
   "Hasta pronto, peregrino."
   "Cuídate mucho, y nos vemos pronto."

4. CIERRE FIJO — esta línea exacta, sin modificar:
¡Goza el camino, y que Dios te bendiga siempre!

ESTILO:
- Voz femenina, maternal y cercana. Alegre pero no eufórica.
- Segunda persona singular (tú).
- Frases cortas. Sin solemnidad. Sin alusiones al siguiente misterio o nivel.
- El texto es para ser leído en voz alta: prioriza el ritmo oral.
- Máximo 4-5 frases en total (sin contar el cierre fijo).

Devuelve SOLO el texto de la Despedida, sin títulos, sin explicaciones,
sin comillas envolventes.
"""


def generate_ai_text(json_file: str, bloque: str, misterio_en_bloque: int, section_name: str):
    if section_name not in ["Bienvenida", "Despedida"]:
        raise gr.Error("La IA de texto en este flujo está pensada para Bienvenida y Despedida.")

    data = load_json_file(json_file)
    misterio_record = get_misterio_record(data, bloque, int(misterio_en_bloque))
    nivel, cuaderno = parse_tema_id_to_level_and_cuaderno(data)
    misterio_numero = int(misterio_record.get("numero", misterio_en_bloque))

    subtitulo_bloque = data.get("subtitulos_bloque", {}).get(bloque, "")
    titulo = misterio_record.get("titulo", "")
    subtitulo = misterio_record.get("subtitulo", "")
    referencia = misterio_record.get("referencia", "")

    if section_name == "Bienvenida":
        prompt = _build_bienvenida_prompt(titulo, subtitulo, bloque, subtitulo_bloque, referencia)
    else:
        prompt = _build_despedida_prompt(titulo, subtitulo, bloque, subtitulo_bloque, misterio_numero)

    generated, cost = _call_responses_api(prompt)

    info = f"Texto generado con IA para: {section_name} | Modelo texto: {TEXT_MODEL}"
    titulo_info = f"{titulo} — {subtitulo}"
    summary = build_context_summary(data, bloque, misterio_record)

    return generated, info, nivel, cuaderno, misterio_numero, titulo_info, summary, cost


def generate_audio(text: str, section_name: str, nivel: int, cuaderno: int, misterio: int, speed: float = 1.0):
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
        "speed": round(speed, 2),
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

    cost = len(prepared_text) * TTS_COST_PER_CHAR.get(TTS_MODEL, 15 / 1_000_000)

    result = (
        f"Archivo generado: {out_file.name}\n"
        f"Sección: {section_name}\n"
        f"Prefijo: {SECTION_CODES[section_name]}\n"
        f"Modelo TTS: {TTS_MODEL}\n"
        f"Voz canónica: {voice}\n"
        f"Velocidad: {round(speed, 2)}\n"
        f"Nivel: {nivel}\n"
        f"Cuaderno: {cuaderno}\n"
        f"Misterio: {misterio}\n"
        f"Costo estimado: ${cost:.4f}"
    )

    return str(out_file), result, out_file.name, str(out_file), cost


def mejorar_estilo_con_ia(text: str):
    if not text or not text.strip():
        raise gr.Error("No hay texto en la caja para mejorar.")
    result, cost = _call_responses_api(text.strip(), instructions=_ESTILO_SYSTEM)
    return result, f"Texto mejorado con IA | Modelo: {TEXT_MODEL}", cost


def parse_misterios_with_ai(raw_text: str):
    if not raw_text.strip():
        return "", "Pega el texto a parsear."
    try:
        generated, _ = _call_responses_api(raw_text, instructions=_PARSER_SYSTEM)
    except gr.Error as e:
        return "", str(e)
    try:
        parsed = json.loads(generated)
        return json.dumps(parsed, indent=2, ensure_ascii=False), f"{len(parsed)} misterio(s) parseados. Revisa antes de agregar."
    except json.JSONDecodeError as e:
        return generated, f"Aviso: JSON inválido de IA en línea {e.lineno}. Corrige manualmente."


def generate_micro_with_ai(nivel_id: str, intro_text: str, tension: str, cuaderno_name: str):
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
    try:
        generated, _ = _call_responses_api(user_input, instructions=_MICRO_SYSTEM, timeout=300)
    except gr.Error as e:
        return "", str(e)
    try:
        parsed = json.loads(generated)
        parsed.setdefault("id", nivel_id.strip().zfill(4))
        parsed.setdefault("nivel", mundo)
        parsed.setdefault("cuaderno", cuaderno_name)
        parsed.setdefault("tension_vertebral", tension)
        return json.dumps(parsed, indent=2, ensure_ascii=False), "Micro generado. Revisa y edita antes de guardar."
    except json.JSONDecodeError as e:
        return generated, f"JSON inválido de IA en línea {e.lineno}. Corrige manualmente."
