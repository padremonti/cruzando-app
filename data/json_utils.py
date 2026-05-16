import json
import logging
import re
import shutil
import threading
from pathlib import Path

import gradio as gr

logger = logging.getLogger(__name__)

from config import (
    AUDIO_FORMAT,
    BLOQUES,
    LIBROS_LITURGICOS,
    MP3_FOLDER_MAP,
    MP3_PROTECTED_FOLDERS,
    NOMBRES_OFICIALES,
    NOTAS_FILE,
    SECTION_CODES,
    SECTION_SPEEDS,
    SECTION_VOICES,
    TTS_MODEL,
    OUTPUT_DIR,
    _SECTION_ORDER,
)

_json_cache: dict = {}
_cache_lock = threading.Lock()


def discover_json_files():
    return sorted([p.name for p in Path(".").glob("*.json")])


def reload_json_choices():
    clear_cache()
    files = discover_json_files()
    value = files[0] if files else None
    return gr.update(choices=files, value=value)


def load_json_file(filename: str) -> dict:
    if not filename:
        raise gr.Error("No seleccionaste un archivo JSON.")
    with _cache_lock:
        if filename in _json_cache:
            return json.loads(json.dumps(_json_cache[filename]))
        path = Path(filename)
        if not path.exists():
            raise gr.Error(f"No encontré el archivo: {filename}")
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
        _json_cache[filename] = data
        return data


def invalidate_cache(filename: str) -> None:
    with _cache_lock:
        _json_cache.pop(filename, None)


def clear_cache() -> None:
    with _cache_lock:
        _json_cache.clear()


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


def prepare_contemplacion_text(text: str) -> str:
    if not text or not text.strip():
        return text
    lines = text.split("\n")
    for i, line in enumerate(lines):
        stripped = line.strip()
        if not stripped:
            continue
        if stripped[-1] not in ".!?…:;" and len(stripped) < 80:
            lines[i] = stripped + ":"
        break
    return "\n".join(lines)


def _load_camino(rec, bloque, idx):
    titulo_oficial = NOMBRES_OFICIALES.get((bloque, int(idx)), "")
    return build_ubible_text(rec, titulo_oficial), "Texto litúrgico armado desde JSON (sin IA)"


def _load_contemplacion(rec, bloque, idx):
    return (
        prepare_contemplacion_text(rec.get("contemplacion", "")),
        "Texto base cargado desde JSON: contemplacion",
    )


def _load_pregunta_a(rec, bloque, idx):
    qa, _, _ = split_meditacion_into_questions(rec.get("meditacion", ""))
    return qa, "Texto base cargado desde JSON: meditacion → Pregunta A"


def _load_pregunta_b(rec, bloque, idx):
    _, qb, _ = split_meditacion_into_questions(rec.get("meditacion", ""))
    return qb, "Texto base cargado desde JSON: meditacion → Pregunta B"


def _load_pregunta_c(rec, bloque, idx):
    _, _, qc = split_meditacion_into_questions(rec.get("meditacion", ""))
    return qc, "Texto base cargado desde JSON: meditacion → Pregunta C"


def _load_oracion_final(rec, bloque, idx):
    raw = prepare_contemplacion_text(rec.get("intercesion", "").strip())
    if raw and not re.search(r'am[eé]n\.?\s*$', raw, re.IGNORECASE):
        raw += "\n\nAmén."
    return raw, "Texto base cargado desde JSON: intercesion"


_SECTION_LOADER: dict = {
    "Camino y Palabra": _load_camino,
    "Contemplacion":    _load_contemplacion,
    "Pregunta A":       _load_pregunta_a,
    "Pregunta B":       _load_pregunta_b,
    "Pregunta C":       _load_pregunta_c,
    "Oracion final":    _load_oracion_final,
}


def load_base_text(json_file: str, bloque: str, misterio_en_bloque: int, section_name: str):
    data = load_json_file(json_file)
    misterio_record = get_misterio_record(data, bloque, int(misterio_en_bloque))
    nivel, cuaderno = parse_tema_id_to_level_and_cuaderno(data)
    misterio_numero = int(misterio_record.get("numero", misterio_en_bloque))

    loader = _SECTION_LOADER.get(section_name)
    if loader:
        text, info = loader(misterio_record, bloque, misterio_en_bloque)
    elif section_name in ("Bienvenida", "Despedida"):
        text, info = "", "Esta sección no se carga desde JSON. Usa ✨ Generar texto con IA."
    else:
        text, info = "", "No hay texto base para esta sección."

    summary = build_context_summary(data, bloque, misterio_record)
    titulo_info = f"{misterio_record.get('titulo', '')} — {misterio_record.get('subtitulo', '')}"

    return text, info, nivel, cuaderno, misterio_numero, titulo_info, summary


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


_ai_text_generator = None


def set_ai_text_generator(fn):
    global _ai_text_generator
    _ai_text_generator = fn


def _auto_load_text(json_file, bloque, misterio_en_bloque, section_name):
    if section_name in ["Bienvenida", "Despedida"]:
        if _ai_text_generator is None:
            raise gr.Error("Generador de texto IA no inicializado.")
        text, info, nivel, cuaderno, misterio, titulo_info, summary, *_ = (
            _ai_text_generator(json_file, bloque, int(misterio_en_bloque), section_name)
        )
        return text, info, nivel, cuaderno, misterio, titulo_info, summary
    return load_base_text(json_file, bloque, int(misterio_en_bloque), section_name)


def load_context_and_text(json_file, bloque, misterio_en_bloque, section_name):
    text, info, nivel, cuaderno, misterio, titulo_info, summary = _auto_load_text(
        json_file, bloque, misterio_en_bloque, section_name
    )
    filename, _ = preview_filename(section_name, int(nivel), int(cuaderno), int(misterio))
    return nivel, cuaderno, misterio, titulo_info, summary, text, info, filename


def load_context_and_text_with_fields(json_file, bloque, misterio_en_bloque, section_name):
    text, info, nivel, cuaderno, misterio, titulo_info, summary = _auto_load_text(
        json_file, bloque, misterio_en_bloque, section_name
    )
    filename, _ = preview_filename(section_name, int(nivel), int(cuaderno), int(misterio))

    try:
        data = load_json_file(json_file)
        rec = get_misterio_record(data, bloque, int(misterio_en_bloque))
        ac_titulo        = rec.get("titulo", "")
        ac_subtitulo     = rec.get("subtitulo", "")
        ac_referencia    = rec.get("referencia", "")
        ac_evangelio     = rec.get("evangelio", "")
        ac_contemplacion = rec.get("contemplacion", "")
        ac_meditacion    = rec.get("meditacion", "")
        ac_intercesion   = rec.get("intercesion", "")
    except Exception:
        logger.warning("load_context_and_text_with_fields: no se pudieron leer campos del misterio", exc_info=True)
        ac_titulo = ac_subtitulo = ac_referencia = ""
        ac_evangelio = ac_contemplacion = ac_meditacion = ac_intercesion = ""

    return (
        nivel, cuaderno, misterio, titulo_info, summary, text, info, filename,
        ac_titulo, ac_subtitulo, ac_referencia,
        ac_evangelio, ac_contemplacion, ac_meditacion, ac_intercesion,
        SECTION_SPEEDS.get(section_name, 1.0),
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


def convert_quotes_in_strings(obj):
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
    invalidate_cache(filename)
    return f"Guardado: {path.name}  (transformación de comillas aplicada)"


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
    invalidate_cache(filename)
    return f"Guardado: {filename}"


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


def _build_misterio_campos(titulo, subtitulo, referencia,
                            evangelio, contemplacion, meditacion, intercesion) -> dict:
    return {
        "titulo":        titulo.strip()        if titulo        else "",
        "subtitulo":     subtitulo.strip()     if subtitulo     else "",
        "referencia":    referencia.strip()    if referencia    else "",
        "evangelio":     evangelio             if evangelio     else "",
        "contemplacion": contemplacion         if contemplacion else "",
        "meditacion":    meditacion            if meditacion    else "",
        "intercesion":   intercesion           if intercesion   else "",
    }


def _write_json(path: Path, data: dict, cache_key: str) -> None:
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
    invalidate_cache(cache_key)


def save_misterio_from_accordion(json_file, bloque, misterio_en_bloque,
                                  titulo, subtitulo, referencia,
                                  evangelio, contemplacion, meditacion, intercesion):
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

    data["misterios"][bloque][idx_en_bloque].update(
        _build_misterio_campos(titulo, subtitulo, referencia,
                               evangelio, contemplacion, meditacion, intercesion)
    )

    try:
        path = Path(json_file)
        _write_json(path, data, json_file)
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

    data["misterios"][bloque][idx].update(
        _build_misterio_campos(titulo, subtitulo, referencia,
                               evangelio, contemplacion, meditacion, intercesion)
    )

    filename = build_gestor_filename(nivel_id, "data")
    try:
        _write_json(Path(filename), data, filename)
        return f"Misterio {num} guardado correctamente en {filename}.", data
    except Exception as e:
        return f"Error al guardar: {e}", data


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
    invalidate_cache(filename)
    return preview, f"Archivo creado: {filename}"


_BLOQUE_OFFSET = {"gozosos": 0, "luminosos": 5, "dolorosos": 10, "gloriosos": 15}


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

    # El parser devuelve números locales 1-5; convertir a globales según bloque
    offset = _BLOQUE_OFFSET.get(bloque, 0)
    for m in new_items:
        if "numero" in m:
            local = int(m["numero"])
            m["numero"] = local + offset

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
    invalidate_cache(filename)
    return f"Agregados {len(new_items)} misterio(s) al bloque '{bloque}' en {filename}"


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
    invalidate_cache(filename)
    return f"Guardado: {filename}"


def push_to_history(new_text: str, history: list) -> list:
    if not new_text or not new_text.strip():
        return history
    if history and history[0] == new_text.strip():
        return history
    return ([new_text.strip()] + history)[:3]


def build_history_choices(history: list) -> list:
    labels = ["Versión 1 (más reciente)", "Versión 2", "Versión 3"]
    return [labels[i] for i in range(len(history))]


def restore_version(selected_label: str, history: list) -> str:
    if not selected_label or not history:
        return ""
    labels = ["Versión 1 (más reciente)", "Versión 2", "Versión 3"]
    try:
        return history[labels.index(selected_label)]
    except (ValueError, IndexError):
        return ""


def _nota_key(json_file: str, bloque: str, misterio_en_bloque: int) -> str:
    base = Path(json_file).stem
    return f"{base}_{bloque}_{misterio_en_bloque}"


def load_nota(json_file: str, bloque: str, misterio_en_bloque: int) -> str:
    if not NOTAS_FILE.exists():
        return ""
    try:
        with open(NOTAS_FILE, "r", encoding="utf-8") as f:
            notas = json.load(f)
        return notas.get(_nota_key(json_file, bloque, misterio_en_bloque), "")
    except Exception:
        logger.warning("load_nota: error al leer %s", NOTAS_FILE, exc_info=True)
        return ""


def save_nota(json_file: str, bloque: str, misterio_en_bloque: int, texto: str) -> str:
    try:
        notas = {}
        if NOTAS_FILE.exists():
            with open(NOTAS_FILE, "r", encoding="utf-8") as f:
                notas = json.load(f)
        key = _nota_key(json_file, bloque, misterio_en_bloque)
        if texto and texto.strip():
            notas[key] = texto.strip()
        else:
            notas.pop(key, None)
        with open(NOTAS_FILE, "w", encoding="utf-8") as f:
            json.dump(notas, f, indent=2, ensure_ascii=False)
        return "✅ Nota guardada." if texto.strip() else "🗑 Nota eliminada."
    except Exception as e:
        return f"Error al guardar nota: {e}"


def load_all_notas_for_level(json_file: str) -> str:
    if not NOTAS_FILE.exists():
        return "Sin notas registradas para este nivel."
    try:
        with open(NOTAS_FILE, "r", encoding="utf-8") as f:
            notas = json.load(f)
        base = Path(json_file).stem
        level_notas = {k: v for k, v in notas.items() if k.startswith(base + "_")}
        if not level_notas:
            return "Sin notas registradas para este nivel."
        lines = []
        for key, nota in sorted(level_notas.items()):
            parts = key.split("_", 1)
            lines.append(f"[{parts[1]}]\n{nota}")
        return "\n\n".join(lines)
    except Exception:
        return "Error al leer notas."


def list_mp3_root() -> list:
    if not OUTPUT_DIR.exists():
        return []
    return sorted(
        f.name for f in OUTPUT_DIR.iterdir()
        if f.is_file() and f.suffix.lower() == ".mp3"
    )


def list_mp3_in_folder(subfolder: str) -> list:
    folder = OUTPUT_DIR / subfolder
    if not folder.exists():
        return []
    return sorted(
        f.name for f in folder.iterdir()
        if f.is_file() and f.suffix.lower() == ".mp3"
    )


def get_prefix(filename: str):
    prefix = Path(filename).stem.split("_")[0].upper()
    return prefix if prefix in MP3_FOLDER_MAP else None


def rename_mp3(old_name: str, new_name: str, subfolder=None) -> str:
    if ".." in old_name or ".." in new_name:
        return "❌ Nombre inválido."
    if not new_name.strip():
        return "❌ El nuevo nombre no puede estar vacío."
    if not new_name.lower().endswith(".mp3"):
        new_name = new_name.strip() + ".mp3"
    base = OUTPUT_DIR / subfolder if subfolder else OUTPUT_DIR
    old_path = base / old_name
    new_path = base / new_name.strip()
    if not old_path.exists():
        return f"❌ No encontré: {old_name}"
    if new_path.exists():
        return f"❌ Ya existe un archivo con ese nombre: {new_name}"
    try:
        old_path.rename(new_path)
        return f"✅ Renombrado: {old_name} → {new_name}"
    except Exception as e:
        return f"❌ Error al renombrar: {e}"


def move_mp3_to_folder(filename: str, dest_subfolder: str) -> str:
    if ".." in filename or ".." in dest_subfolder:
        return "❌ Ruta inválida."
    if dest_subfolder in MP3_PROTECTED_FOLDERS:
        return f"❌ Carpeta protegida: {dest_subfolder}"
    src = OUTPUT_DIR / filename
    dest_dir = OUTPUT_DIR / dest_subfolder
    dest_dir.mkdir(exist_ok=True)
    dest = dest_dir / filename
    if not src.exists():
        return f"❌ No encontré: {filename}"
    if dest.exists():
        return f"⚠️ Ya existe en destino: {dest_subfolder}/{filename}"
    try:
        shutil.move(str(src), str(dest))
        return f"✅ Movido: {filename} → {dest_subfolder}/"
    except Exception as e:
        return f"❌ Error al mover: {e}"


def delete_mp3(filename: str, subfolder=None) -> str:
    if ".." in filename:
        return "❌ Nombre inválido."
    base = OUTPUT_DIR / subfolder if subfolder else OUTPUT_DIR
    path = base / filename
    if not path.exists():
        return f"❌ No encontré: {filename}"
    try:
        path.unlink()
        return f"🗑 Eliminado: {filename}"
    except Exception as e:
        return f"❌ Error al eliminar: {e}"


def organizar_mp3s() -> tuple:
    archivos = list_mp3_root()
    if not archivos:
        return "Sin archivos MP3 en la raíz de OUTPUT_DIR.", []

    movidos = 0
    omitidos = 0
    sin_carpeta = 0
    log = []

    for filename in archivos:
        prefix = get_prefix(filename)
        if prefix is None:
            log.append(f"⚠️ Sin carpeta asignada: {filename}")
            sin_carpeta += 1
            continue

        dest_folder = MP3_FOLDER_MAP[prefix]
        dest_dir = OUTPUT_DIR / dest_folder
        dest_dir.mkdir(exist_ok=True)
        src = OUTPUT_DIR / filename
        dest = dest_dir / filename

        if dest.exists():
            log.append(f"⚠️ Ya existe en destino, omitido: {filename}")
            omitidos += 1
            continue

        try:
            shutil.move(str(src), str(dest))
            log.append(f"✅ {filename} → {dest_folder}/")
            movidos += 1
        except Exception as e:
            log.append(f"❌ Error moviendo {filename}: {e}")
            omitidos += 1

    resumen = (
        f"Organización completada — "
        f"{movidos} movidos, {omitidos} omitidos, "
        f"{sin_carpeta} sin carpeta asignada."
    )
    return resumen, log
