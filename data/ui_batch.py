import logging

import gradio as gr

from config import BLOQUES, OUTPUT_DIR, SECTION_SPEEDS

logger = logging.getLogger(__name__)
from json_utils import (
    load_json_file,
    reload_json_choices,
    parse_tema_id_to_level_and_cuaderno,
    get_misterios_for_block,
    build_standard_filename,
    load_base_text,
    push_to_history,
    build_history_choices,
    restore_version,
)
from tts_utils import generate_audio, generate_ai_text, mejorar_estilo_con_ia


_BATCH_SECTIONS = [
    ("START", "Bienvenida"),
    ("UBIBLE", "Camino y Palabra"),
    ("CONT",   "Contemplacion"),
    ("QA",     "Pregunta A"),
    ("QB",     "Pregunta B"),
    ("QC",     "Pregunta C"),
    ("PRAY",   "Oracion final"),
    ("BYE",    "Despedida"),
]
_BATCH_CODES_ORDER = [code for code, _ in _BATCH_SECTIONS]


def _format_cost(total: float, this_op: float) -> str:
    return f"Esta op: ${this_op:.4f} | Total sesión: ${total:.4f}"


def _batch_try_generate_audio(text, section_name, nivel, cuaderno, misterio, fin_texto, speed: float = 1.0):
    if not text or not text.strip():
        filename = build_standard_filename(section_name, nivel, cuaderno, misterio)
        return False, f"{filename} — texto vacío", None, 0.0
    try:
        full_path, _, filename, _, cost = generate_audio(text, section_name, nivel, cuaderno, misterio, fin_texto, speed)
        return True, filename, full_path, cost
    except Exception as e:
        filename = build_standard_filename(section_name, nivel, cuaderno, misterio)
        msg = e.message if hasattr(e, "message") else str(e)
        return False, f"{filename} — {msg}", None, 0.0


def build_progress_html(progress_dict: dict, data: dict, bloque: str, misterio_en_bloque: int) -> str:
    nivel, cuaderno = parse_tema_id_to_level_and_cuaderno(data)
    misterios = get_misterios_for_block(data, bloque)
    if misterios and 1 <= misterio_en_bloque <= len(misterios):
        rec = misterios[misterio_en_bloque - 1]
        misterio_global = int(rec.get("numero", misterio_en_bloque))
    else:
        misterio_global = misterio_en_bloque

    parts = []
    for code, section_name in _BATCH_SECTIONS:
        status = progress_dict.get(code)
        if status is None:
            color, icon = "#e9ecef", "⬜"
        elif status:
            color, icon = "#d4edda", "✅"
        else:
            color, icon = "#f8d7da", "❌"
        filename = build_standard_filename(section_name, nivel, cuaderno, misterio_global)
        parts.append(
            f'<span style="background:{color};padding:4px 8px;margin:3px;border-radius:4px;'
            f'font-size:13px;display:inline-block;" title="{filename}">'
            f'{icon} {code}</span>'
        )
    return "<div style='padding:8px 0;'>" + "".join(parts) + "</div>"


def build_checklist_html(data: dict) -> str:
    nivel, cuaderno = parse_tema_id_to_level_and_cuaderno(data)

    header = (
        '<tr style="background:#343a40;color:white;">'
        '<th style="padding:6px 10px;text-align:left;">Misterio</th>'
    )
    for code, _ in _BATCH_SECTIONS:
        header += f'<th style="padding:6px 8px;">{code}</th>'
    header += "</tr>"

    rows = []
    total_present = 0
    total_possible = 0

    for bloque in BLOQUES:
        misterios = get_misterios_for_block(data, bloque)
        for i, rec in enumerate(misterios):
            misterio_global = int(rec.get("numero", i + 1))
            titulo = rec.get("titulo", f"Misterio {misterio_global}")
            titulo_short = (titulo[:30] + "…") if len(titulo) > 30 else titulo
            row_bg = "#f8f9fa" if misterio_global % 2 == 0 else "white"
            cells = (
                f'<td style="padding:5px 10px;white-space:nowrap;background:{row_bg};">'
                f'#{misterio_global} {titulo_short}</td>'
            )
            for code, section_name in _BATCH_SECTIONS:
                filename = build_standard_filename(section_name, nivel, cuaderno, misterio_global)
                exists = (OUTPUT_DIR / filename).exists()
                total_possible += 1
                if exists:
                    total_present += 1
                    bg, icon = "#d4edda", "✅"
                else:
                    bg, icon = "#f8d7da", "❌"
                cells += (
                    f'<td style="background:{bg};text-align:center;padding:4px 8px;" '
                    f'title="{filename}">{icon}</td>'
                )
            rows.append(f"<tr>{cells}</tr>")

    footer = (
        f'<tr style="font-weight:bold;background:#e9ecef;">'
        f'<td colspan="{1 + len(_BATCH_SECTIONS)}" style="padding:6px 10px;text-align:right;">'
        f"{total_present} / {total_possible} archivos presentes</td></tr>"
    )
    return (
        '<table style="border-collapse:collapse;width:100%;font-size:13px;">'
        + header + "".join(rows) + footer + "</table>"
    )


def _batch_misterio_info_str(state: dict) -> str:
    data = state["data"]
    bloque = state["bloque_actual"]
    meb = state["misterio_en_bloque"]
    misterios = get_misterios_for_block(data, bloque)
    if misterios and 1 <= meb <= len(misterios):
        rec = misterios[meb - 1]
        titulo = rec.get("titulo", "")
        subtitulo = rec.get("subtitulo", "")
        misterio_global = int(rec.get("numero", meb))
    else:
        titulo = subtitulo = ""
        misterio_global = meb
    return (
        f"📍 Bloque: {bloque} | Misterio {meb}/5 | Global #{misterio_global} | {titulo} — {subtitulo}\n"
        f"🎵 Audios esta sesión: {state['audios_sesion']}/{state['total_posible_sesion']}"
    )


def _batch_advance_and_prepare_next(state: dict):
    bloques_queue = state["bloques_queue"]
    bloque_actual = state["bloque_actual"]
    meb = state["misterio_en_bloque"]

    if meb < 5:
        state["misterio_en_bloque"] = meb + 1
    else:
        idx = bloques_queue.index(bloque_actual)
        if idx + 1 < len(bloques_queue):
            state["bloque_actual"] = bloques_queue[idx + 1]
            state["misterio_en_bloque"] = 1
        else:
            state["activo"] = False
            return True, state, None, None, None

    state["progress_misterio"] = {c: None for c in _BATCH_CODES_ORDER}

    data = state["data"]
    json_file = state["json_file"]
    bloque = state["bloque_actual"]
    meb = state["misterio_en_bloque"]

    misterio_info = _batch_misterio_info_str(state)
    progress_html = build_progress_html(state["progress_misterio"], data, bloque, meb)

    try:
        start_text, *_ = generate_ai_text(json_file, bloque, meb, "Bienvenida")
    except Exception as e:
        logger.warning("_batch_advance_and_prepare_next: START generation failed", exc_info=True)
        start_text = f"[Error generando START: {e}]"

    return False, state, misterio_info, progress_html, start_text


def _batch_log_line(state: dict, misterio_global: int) -> str:
    bloque = state["bloque_actual"]
    meb = state["misterio_en_bloque"]
    data = state["data"]
    nivel = state["nivel"]
    cuaderno = state["cuaderno"]
    misterios = get_misterios_for_block(data, bloque)
    rec = misterios[meb - 1] if misterios and 1 <= meb <= len(misterios) else {}
    titulo = rec.get("titulo", "")

    gen_count = sum(1 for v in state["progress_misterio"].values() if v is True)
    err_count = sum(1 for v in state["progress_misterio"].values() if v is False)
    err_names = [
        build_standard_filename(sname, nivel, cuaderno, misterio_global)
        for code, sname in _BATCH_SECTIONS
        if state["progress_misterio"].get(code) is False
    ]
    err_suffix = (" ❌ " + " ".join(err_names)) if err_names else ""
    return f"✔ {bloque} #{meb} — {titulo}: {gen_count} gen, {err_count} err{err_suffix}"


def batch_iniciar(json_file, bloque, desde, fin_texto, state):
    _dd_reset = gr.update(choices=[], visible=False)
    _fail = ("", "", "", "", "", "", "", state or {}, gr.update(interactive=False), gr.update(interactive=False), gr.update(interactive=False), gr.update(interactive=False), None, [], [], _dd_reset, _dd_reset, gr.update(value="$0.0000"))
    if not json_file:
        return _fail
    try:
        data = load_json_file(json_file)
    except Exception as e:
        return (f"Error: {e}",) + _fail[1:]

    nivel, cuaderno = parse_tema_id_to_level_and_cuaderno(data)

    bloques_queue = list(BLOQUES) if bloque == "Todos" else [bloque]
    desde = max(1, min(5, int(desde)))
    bloque_actual = bloques_queue[0]

    total_misterios = (6 - desde) + (len(bloques_queue) - 1) * 5
    total_posible_sesion = total_misterios * 8

    new_state = {
        "activo": True,
        "bloques_queue": bloques_queue,
        "bloque_actual": bloque_actual,
        "misterio_en_bloque": desde,
        "total_misterios": total_misterios,
        "audios_sesion": 0,
        "total_posible_sesion": total_posible_sesion,
        "errores": [],
        "progress_misterio": {c: None for c in _BATCH_CODES_ORDER},
        "data": data,
        "fin_texto": fin_texto,
        "json_file": json_file,
        "nivel": nivel,
        "cuaderno": cuaderno,
        "log": "",
    }

    misterio_info = _batch_misterio_info_str(new_state)
    progress_html = build_progress_html(new_state["progress_misterio"], data, bloque_actual, desde)
    checklist_html = build_checklist_html(data)

    try:
        start_text, *_ = generate_ai_text(json_file, bloque_actual, desde, "Bienvenida")
    except Exception as e:
        logger.warning("batch_iniciar: START generation failed", exc_info=True)
        start_text = f"[Error generando START: {e}]"

    _dd_reset = gr.update(choices=[], visible=False)
    return (
        misterio_info, progress_html, start_text, "", "", "",
        checklist_html, new_state,
        gr.update(interactive=True),
        gr.update(interactive=False),
        gr.update(interactive=True),
        gr.update(interactive=False),
        None,
        [], [], _dd_reset, _dd_reset,
        gr.update(value="$0.0000"),
    )


def _generate_all_sections(state: dict, start_text: str):
    """Genera TTS para START + secciones centrales y texto IA para BYE.
    Muta state (progress_misterio, audios_sesion, errores).
    Devuelve (tts_lines, last_audio_path, batch_cost_total, bye_text).
    """
    data = state["data"]
    bloque = state["bloque_actual"]
    meb = state["misterio_en_bloque"]
    nivel = state["nivel"]
    cuaderno = state["cuaderno"]
    fin_texto = state["fin_texto"]
    json_file = state["json_file"]

    misterios = get_misterios_for_block(data, bloque)
    rec = misterios[meb - 1] if misterios and 1 <= meb <= len(misterios) else {}
    misterio_global = int(rec.get("numero", meb))

    tts_lines = []
    last_audio_path = None
    batch_cost_total = 0.0

    ok, fn, audio_path, op_cost = _batch_try_generate_audio(
        start_text, "Bienvenida", nivel, cuaderno, misterio_global,
        fin_texto, SECTION_SPEEDS.get("Bienvenida", 1.0),
    )
    batch_cost_total += op_cost
    state["progress_misterio"]["START"] = ok
    if ok:
        state["audios_sesion"] += 1
        last_audio_path = audio_path
    else:
        state["errores"].append(fn)
    tts_lines.append(("✅" if ok else "❌") + f" {fn}")

    for code, section_name in _BATCH_SECTIONS[1:-1]:
        try:
            text_val, *_ = load_base_text(json_file, bloque, meb, section_name)
        except Exception as e:
            logger.warning("_generate_all_sections: error cargando %s", section_name, exc_info=True)
            state["progress_misterio"][code] = False
            fn = build_standard_filename(section_name, nivel, cuaderno, misterio_global)
            state["errores"].append(f"{fn} — load: {e}")
            tts_lines.append(f"❌ {fn} — carga: {e}")
            continue
        ok, fn, audio_path, op_cost = _batch_try_generate_audio(
            text_val, section_name, nivel, cuaderno, misterio_global,
            fin_texto, SECTION_SPEEDS.get(section_name, 1.0),
        )
        batch_cost_total += op_cost
        state["progress_misterio"][code] = ok
        if ok:
            state["audios_sesion"] += 1
            last_audio_path = audio_path
        else:
            state["errores"].append(fn)
        tts_lines.append(("✅" if ok else "❌") + f" {fn}")

    try:
        bye_text, _, _, _, _, _, _, bye_cost = generate_ai_text(json_file, bloque, meb, "Despedida")
        batch_cost_total += bye_cost
    except Exception as e:
        logger.warning("_generate_all_sections: BYE generation failed", exc_info=True)
        bye_text = f"[Error generando BYE: {e}]"

    return tts_lines, last_audio_path, batch_cost_total, bye_text


def batch_aprobar_start(start_text, state, session_cost_val):
    _fail = ("", "", "", "", "", state or {}, gr.update(), gr.update(), gr.update(), gr.update(), None, gr.update(), session_cost_val or 0.0)
    if not state or not state.get("activo"):
        return _fail

    data = state["data"]
    bloque = state["bloque_actual"]
    meb = state["misterio_en_bloque"]

    tts_lines, last_audio_path, batch_cost_total, bye_text = _generate_all_sections(state, start_text)

    progress_html = build_progress_html(state["progress_misterio"], data, bloque, meb)
    checklist_html = build_checklist_html(data)
    new_total = (session_cost_val or 0.0) + batch_cost_total

    return (
        "\n".join(tts_lines), progress_html, bye_text, state.get("log", ""), checklist_html, state,
        gr.update(interactive=False),
        gr.update(interactive=True),
        gr.update(interactive=False),
        gr.update(interactive=True),
        last_audio_path,
        gr.update(value=_format_cost(new_total, batch_cost_total)),
        new_total,
    )


def batch_aprobar_bye(bye_text, state, session_cost_val):
    _empty_log = state.get("log", "") if state else ""
    _dd_reset = gr.update(choices=[], visible=False)
    _fail = ("", "", "", "", "", _empty_log, "", state or {}, gr.update(), gr.update(), gr.update(), gr.update(), None, [], [], _dd_reset, _dd_reset, gr.update(), session_cost_val or 0.0)
    if not state or not state.get("activo"):
        return _fail

    data = state["data"]
    bloque = state["bloque_actual"]
    meb = state["misterio_en_bloque"]
    nivel = state["nivel"]
    cuaderno = state["cuaderno"]
    fin_texto = state["fin_texto"]

    misterios = get_misterios_for_block(data, bloque)
    rec = misterios[meb - 1] if misterios and 1 <= meb <= len(misterios) else {}
    misterio_global = int(rec.get("numero", meb))

    ok, fn, audio_path, op_cost = _batch_try_generate_audio(bye_text, "Despedida", nivel, cuaderno, misterio_global, fin_texto, SECTION_SPEEDS.get("Despedida", 1.0))
    state["progress_misterio"]["BYE"] = ok
    if ok:
        state["audios_sesion"] += 1
    else:
        state["errores"].append(fn)
        audio_path = None

    new_total = (session_cost_val or 0.0) + op_cost
    state["log"] = state.get("log", "") + _batch_log_line(state, misterio_global) + "\n"
    checklist_html = build_checklist_html(data)

    completed, state, next_info, next_progress, next_start = _batch_advance_and_prepare_next(state)

    _dd_reset = gr.update(choices=[], visible=False)
    if completed:
        total = state["audios_sesion"]
        n_err = len(state["errores"])
        return (
            f"🏁 Batch completado — {total} audios generados, {n_err} errores",
            "<div>Batch completado.</div>",
            "", "", "",
            state["log"], checklist_html, state,
            gr.update(interactive=False),
            gr.update(interactive=False),
            gr.update(interactive=False),
            gr.update(interactive=False),
            audio_path,
            [], [], _dd_reset, _dd_reset,
            gr.update(value=_format_cost(new_total, op_cost)),
            new_total,
        )
    return (
        next_info, next_progress, next_start, "", "",
        state["log"], checklist_html, state,
        gr.update(interactive=True),
        gr.update(interactive=False),
        gr.update(interactive=True),
        gr.update(interactive=False),
        audio_path,
        [], [], _dd_reset, _dd_reset,
        gr.update(value=_format_cost(new_total, op_cost)),
        new_total,
    )


def batch_saltar(state):
    _empty_log = state.get("log", "") if state else ""
    _dd_reset = gr.update(choices=[], visible=False)
    _fail = ("", "", "", "", "", _empty_log, "", state or {}, gr.update(), gr.update(), gr.update(), gr.update(), None, [], [], _dd_reset, _dd_reset)
    if not state or not state.get("activo"):
        return _fail

    data = state["data"]
    bloque = state["bloque_actual"]
    meb = state["misterio_en_bloque"]
    misterios = get_misterios_for_block(data, bloque)
    rec = misterios[meb - 1] if misterios and 1 <= meb <= len(misterios) else {}
    titulo = rec.get("titulo", "")

    state["log"] = state.get("log", "") + f"⏭ Saltado: {bloque} #{meb} — {titulo}\n"
    checklist_html = build_checklist_html(data)

    completed, state, next_info, next_progress, next_start = _batch_advance_and_prepare_next(state)

    if completed:
        total = state["audios_sesion"]
        n_err = len(state["errores"])
        return (
            f"🏁 Batch completado — {total} audios generados, {n_err} errores",
            "<div>Batch completado.</div>",
            "", "", "",
            state["log"], checklist_html, state,
            gr.update(interactive=False),
            gr.update(interactive=False),
            gr.update(interactive=False),
            gr.update(interactive=False),
            None,
            [], [], _dd_reset, _dd_reset,
        )
    return (
        next_info, next_progress, next_start, "", "",
        state["log"], checklist_html, state,
        gr.update(interactive=True),
        gr.update(interactive=False),
        gr.update(interactive=True),
        gr.update(interactive=False),
        None,
        [], [], _dd_reset, _dd_reset,
    )


def batch_ver_estado(json_file, state):
    data = (state or {}).get("data")
    if not data:
        if not json_file:
            return ("<p>Selecciona un archivo JSON.</p>",)
        try:
            data = load_json_file(json_file)
        except Exception as e:
            return (f"<p>Error: {e}</p>",)
    return (build_checklist_html(data),)


def build_tab_batch(json_choices):
    default_json = json_choices[0] if json_choices else None

    batch_state = gr.State({})
    batch_history_start = gr.State([])
    batch_history_bye = gr.State([])

    gr.Markdown("### Configuración")
    gr.Markdown(
        "_Velocidad: se aplican los valores por defecto de cada sección "
        "(configurables en `config.py` → `SECTION_SPEEDS`)._"
    )
    with gr.Row():
        batch_json_file = gr.Dropdown(
            choices=json_choices,
            value=default_json,
            label="Archivo JSON",
        )
        batch_reload_btn = gr.Button("🔄", scale=0)
    with gr.Row():
        batch_bloque = gr.Radio(
            choices=["gozosos", "luminosos", "dolorosos", "gloriosos", "Todos"],
            value="gozosos",
            label="Bloque",
        )
        batch_fin_texto = gr.Checkbox(label='Añadir "Fin del texto."', value=True)
        batch_start_desde = gr.Number(
            label="Comenzar desde misterio #",
            value=1,
            minimum=1,
            maximum=5,
            precision=0,
        )
    batch_start_config_btn = gr.Button("▶ Iniciar batch", variant="primary")

    gr.Markdown("### Estado del nivel")
    batch_checklist_btn = gr.Button("🔍 Ver estado del nivel")
    batch_checklist = gr.HTML()

    gr.Markdown("### Trabajo")
    batch_misterio_info = gr.Textbox(
        label="Misterio actual", interactive=False, lines=2
    )
    batch_progress_html = gr.HTML()
    batch_start_text = gr.Textbox(label="Texto START (editable)", lines=10)
    batch_mejorar_start_btn = gr.Button(
        "✨ Mejorar ritmo oral",
        variant="secondary",
        interactive=False,
    )
    batch_history_start_dd = gr.Dropdown(
        choices=[], value=None, label="↩ Versión anterior de START",
        interactive=True, visible=False,
    )
    batch_start_btn = gr.Button(
        "✅ Aprobar START y generar TTS central",
        variant="primary",
        interactive=False,
    )
    batch_tts_status = gr.Textbox(
        label="TTS central", interactive=False, lines=4
    )
    batch_audio_preview = gr.Audio(
        label="🔊 Último audio generado",
        type="filepath",
        autoplay=True,
        interactive=False,
    )
    batch_bye_text = gr.Textbox(label="Texto BYE (editable)", lines=8)
    batch_mejorar_bye_btn = gr.Button(
        "✨ Mejorar ritmo oral",
        variant="secondary",
        interactive=False,
    )
    batch_history_bye_dd = gr.Dropdown(
        choices=[], value=None, label="↩ Versión anterior de BYE",
        interactive=True, visible=False,
    )
    batch_bye_btn = gr.Button(
        "✅ Aprobar BYE y continuar",
        variant="primary",
        interactive=False,
    )
    batch_skip_btn = gr.Button("⏭ Saltar este misterio")

    gr.Markdown("### Log de sesión")
    batch_log = gr.Textbox(label="Log de sesión", interactive=False, lines=15)
    batch_cost_display = gr.Textbox(
        label="💰 Costo estimado del batch",
        value="$0.0000",
        interactive=False,
        lines=1,
    )

    return (
        batch_state, batch_history_start, batch_history_bye,
        batch_json_file, batch_reload_btn,
        batch_bloque, batch_fin_texto, batch_start_desde,
        batch_start_config_btn, batch_checklist_btn, batch_checklist,
        batch_misterio_info, batch_progress_html,
        batch_start_text, batch_mejorar_start_btn, batch_history_start_dd,
        batch_start_btn, batch_tts_status, batch_audio_preview,
        batch_bye_text, batch_mejorar_bye_btn, batch_history_bye_dd,
        batch_bye_btn, batch_skip_btn, batch_log, batch_cost_display,
    )


def register_handlers_batch(
    batch_state, batch_history_start, batch_history_bye,
    batch_json_file, batch_reload_btn,
    batch_bloque, batch_fin_texto, batch_start_desde,
    batch_start_config_btn, batch_checklist_btn, batch_checklist,
    batch_misterio_info, batch_progress_html,
    batch_start_text, batch_mejorar_start_btn, batch_history_start_dd,
    batch_start_btn, batch_tts_status, batch_audio_preview,
    batch_bye_text, batch_mejorar_bye_btn, batch_history_bye_dd,
    batch_bye_btn, batch_skip_btn, batch_log, batch_cost_display,
    session_cost,
):
    batch_reload_btn.click(
        fn=reload_json_choices,
        inputs=[],
        outputs=[batch_json_file],
    )

    batch_start_config_btn.click(
        fn=batch_iniciar,
        inputs=[batch_json_file, batch_bloque, batch_start_desde, batch_fin_texto, batch_state],
        outputs=[
            batch_misterio_info, batch_progress_html, batch_start_text, batch_tts_status,
            batch_bye_text, batch_log, batch_checklist, batch_state,
            batch_start_btn, batch_bye_btn,
            batch_mejorar_start_btn, batch_mejorar_bye_btn,
            batch_audio_preview,
            batch_history_start, batch_history_bye,
            batch_history_start_dd, batch_history_bye_dd,
            batch_cost_display,
        ],
    )

    batch_start_btn.click(
        fn=batch_aprobar_start,
        inputs=[batch_start_text, batch_state, session_cost],
        outputs=[
            batch_tts_status, batch_progress_html, batch_bye_text, batch_log,
            batch_checklist, batch_state,
            batch_start_btn, batch_bye_btn,
            batch_mejorar_start_btn, batch_mejorar_bye_btn,
            batch_audio_preview,
            batch_cost_display, session_cost,
        ],
    )

    batch_bye_btn.click(
        fn=batch_aprobar_bye,
        inputs=[batch_bye_text, batch_state, session_cost],
        outputs=[
            batch_misterio_info, batch_progress_html, batch_start_text, batch_tts_status,
            batch_bye_text, batch_log, batch_checklist, batch_state,
            batch_start_btn, batch_bye_btn,
            batch_mejorar_start_btn, batch_mejorar_bye_btn,
            batch_audio_preview,
            batch_history_start, batch_history_bye,
            batch_history_start_dd, batch_history_bye_dd,
            batch_cost_display, session_cost,
        ],
    )

    batch_skip_btn.click(
        fn=batch_saltar,
        inputs=[batch_state],
        outputs=[
            batch_misterio_info, batch_progress_html, batch_start_text, batch_tts_status,
            batch_bye_text, batch_log, batch_checklist, batch_state,
            batch_start_btn, batch_bye_btn,
            batch_mejorar_start_btn, batch_mejorar_bye_btn,
            batch_audio_preview,
            batch_history_start, batch_history_bye,
            batch_history_start_dd, batch_history_bye_dd,
        ],
    )

    def _batch_mejorar_start(text, history, session_cost_val):
        updated_history = push_to_history(text, history)
        new_text, info, op_cost = mejorar_estilo_con_ia(text)
        new_total = (session_cost_val or 0.0) + op_cost
        choices = build_history_choices(updated_history)
        return (
            new_text, info, updated_history,
            gr.update(choices=choices, visible=len(updated_history) > 0),
            gr.update(value=_format_cost(new_total, op_cost)), new_total,
        )

    batch_mejorar_start_btn.click(
        fn=_batch_mejorar_start,
        inputs=[batch_start_text, batch_history_start, session_cost],
        outputs=[batch_start_text, batch_misterio_info, batch_history_start, batch_history_start_dd,
                 batch_cost_display, session_cost],
    )

    def _batch_mejorar_bye(text, history, session_cost_val):
        updated_history = push_to_history(text, history)
        new_text, info, op_cost = mejorar_estilo_con_ia(text)
        new_total = (session_cost_val or 0.0) + op_cost
        choices = build_history_choices(updated_history)
        return (
            new_text, info, updated_history,
            gr.update(choices=choices, visible=len(updated_history) > 0),
            gr.update(value=_format_cost(new_total, op_cost)), new_total,
        )

    batch_mejorar_bye_btn.click(
        fn=_batch_mejorar_bye,
        inputs=[batch_bye_text, batch_history_bye, session_cost],
        outputs=[batch_bye_text, batch_misterio_info, batch_history_bye, batch_history_bye_dd,
                 batch_cost_display, session_cost],
    )

    batch_history_start_dd.change(
        fn=restore_version,
        inputs=[batch_history_start_dd, batch_history_start],
        outputs=[batch_start_text],
    )

    batch_history_bye_dd.change(
        fn=restore_version,
        inputs=[batch_history_bye_dd, batch_history_bye],
        outputs=[batch_bye_text],
    )

    batch_checklist_btn.click(
        fn=batch_ver_estado,
        inputs=[batch_json_file, batch_state],
        outputs=[batch_checklist],
    )
