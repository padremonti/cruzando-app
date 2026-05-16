import logging

import gradio as gr

from config import BLOQUES, OUTPUT_DIR, SECTION_SPEEDS
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

logger = logging.getLogger(__name__)

# Todas las secciones — usadas para checklist/estado del nivel
_ALL_SECTIONS = [
    ("START",  "Bienvenida"),
    ("UBIBLE", "Camino y Palabra"),
    ("CONT",   "Contemplacion"),
    ("QA",     "Pregunta A"),
    ("QB",     "Pregunta B"),
    ("QC",     "Pregunta C"),
    ("PRAY",   "Oracion final"),
    ("BYE",    "Despedida"),
]

# Solo las secciones que genera el batch (sin START ni BYE)
_BATCH_SECTIONS = [
    ("UBIBLE", "Camino y Palabra"),
    ("CONT",   "Contemplacion"),
    ("QA",     "Pregunta A"),
    ("QB",     "Pregunta B"),
    ("QC",     "Pregunta C"),
    ("PRAY",   "Oracion final"),
]
_BATCH_CODES_ORDER = [code for code, _ in _BATCH_SECTIONS]


def _format_cost(total: float, this_op: float) -> str:
    return f"Esta op: ${this_op:.4f} | Total sesión: ${total:.4f}"


def _batch_try_generate_audio(text, section_name, nivel, cuaderno, misterio, speed: float = 1.0):
    if not text or not text.strip():
        filename = build_standard_filename(section_name, nivel, cuaderno, misterio)
        return False, f"{filename} — texto vacío", None, 0.0
    try:
        full_path, _, filename, _, cost = generate_audio(
            text, section_name, nivel, cuaderno, misterio, speed
        )
        return True, filename, full_path, cost
    except Exception as e:
        filename = build_standard_filename(section_name, nivel, cuaderno, misterio)
        msg = e.message if hasattr(e, "message") else str(e)
        return False, f"{filename} — {msg}", None, 0.0


def build_checklist_html(data: dict) -> str:
    nivel, cuaderno = parse_tema_id_to_level_and_cuaderno(data)

    header = (
        '<tr style="background:#343a40;color:white;">'
        '<th style="padding:6px 10px;text-align:left;">Misterio</th>'
    )
    for code, _ in _ALL_SECTIONS:
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
            for code, section_name in _ALL_SECTIONS:
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
        f'<td colspan="{1 + len(_ALL_SECTIONS)}" style="padding:6px 10px;text-align:right;">'
        f"{total_present} / {total_possible} archivos presentes</td></tr>"
    )
    return (
        '<table style="border-collapse:collapse;width:100%;font-size:13px;">'
        + header + "".join(rows) + footer + "</table>"
    )


def _ver_estado_html(json_file: str) -> str:
    if not json_file:
        return "<p>Selecciona un archivo JSON.</p>"
    try:
        return build_checklist_html(load_json_file(json_file))
    except Exception as e:
        return f"<p>Error: {e}</p>"


# ── BATCH ────────────────────────────────────────────────────────────────────

def batch_ejecutar(json_file, bloque, desde, session_cost_val):
    if not json_file:
        return "", "<p>Selecciona un archivo JSON.</p>", None, gr.update(value="$0.0000"), session_cost_val or 0.0
    try:
        data = load_json_file(json_file)
    except Exception as e:
        return str(e), "", None, gr.update(), session_cost_val or 0.0

    nivel, cuaderno = parse_tema_id_to_level_and_cuaderno(data)
    bloques_queue = list(BLOQUES) if bloque == "Todos" else [bloque]
    desde = max(1, min(5, int(desde)))

    log_lines = []
    last_audio_path = None
    batch_cost_total = 0.0

    for blq in bloques_queue:
        misterios = get_misterios_for_block(data, blq)
        for i, rec in enumerate(misterios):
            meb = i + 1
            if blq == bloques_queue[0] and meb < desde:
                continue
            misterio_global = int(rec.get("numero", meb))
            titulo = rec.get("titulo", f"Misterio {misterio_global}")
            log_lines.append(f"── {blq} #{meb} — {titulo}")
            for code, section_name in _BATCH_SECTIONS:
                try:
                    text_val, *_ = load_base_text(json_file, blq, meb, section_name)
                except Exception as e:
                    logger.warning("batch_ejecutar: error cargando %s", section_name, exc_info=True)
                    fn = build_standard_filename(section_name, nivel, cuaderno, misterio_global)
                    log_lines.append(f"  ❌ {fn} — carga: {e}")
                    continue
                ok, fn, audio_path, op_cost = _batch_try_generate_audio(
                    text_val, section_name, nivel, cuaderno, misterio_global,
                    SECTION_SPEEDS.get(section_name, 1.0),
                )
                batch_cost_total += op_cost
                if ok:
                    last_audio_path = audio_path
                log_lines.append(f"  {'✅' if ok else '❌'} {fn}")

    checklist_html = build_checklist_html(data)
    new_total = (session_cost_val or 0.0) + batch_cost_total
    return (
        "\n".join(log_lines),
        checklist_html,
        last_audio_path,
        gr.update(value=_format_cost(new_total, batch_cost_total)),
        new_total,
    )


def build_tab_batch(json_choices):
    default_json = json_choices[0] if json_choices else None

    gr.Markdown("### Configuración")
    gr.Markdown(
        "_Genera UBIBLE, CONT, QA, QB, QC y PRAY para todos los misterios seleccionados. "
        "START y BYE se trabajan en la pestaña **START / BYE**._"
    )
    with gr.Row():
        batch_json_file = gr.Dropdown(choices=json_choices, value=default_json, label="Archivo JSON")
        batch_reload_btn = gr.Button("🔄", scale=0)
    with gr.Row():
        batch_bloque = gr.Radio(
            choices=["gozosos", "luminosos", "dolorosos", "gloriosos", "Todos"],
            value="gozosos",
            label="Bloque",
        )
        batch_start_desde = gr.Number(
            label="Comenzar desde misterio #", value=1, minimum=1, maximum=5, precision=0
        )
    batch_run_btn = gr.Button("▶ Ejecutar batch", variant="primary")

    gr.Markdown("### Estado del nivel")
    batch_checklist_btn = gr.Button("🔍 Ver estado del nivel")
    batch_checklist = gr.HTML()

    gr.Markdown("### Resultado")
    batch_audio_preview = gr.Audio(
        label="🔊 Último audio generado", type="filepath", autoplay=True, interactive=False
    )
    batch_log = gr.Textbox(label="Log de sesión", interactive=False, lines=20)
    batch_cost_display = gr.Textbox(
        label="💰 Costo estimado del batch", value="$0.0000", interactive=False, lines=1
    )

    return (
        batch_json_file, batch_reload_btn,
        batch_bloque, batch_start_desde,
        batch_run_btn, batch_checklist_btn, batch_checklist,
        batch_audio_preview, batch_log, batch_cost_display,
    )


def register_handlers_batch(
    batch_json_file, batch_reload_btn,
    batch_bloque, batch_start_desde,
    batch_run_btn, batch_checklist_btn, batch_checklist,
    batch_audio_preview, batch_log, batch_cost_display,
    session_cost,
):
    batch_reload_btn.click(fn=reload_json_choices, inputs=[], outputs=[batch_json_file])

    batch_run_btn.click(
        fn=batch_ejecutar,
        inputs=[batch_json_file, batch_bloque, batch_start_desde, session_cost],
        outputs=[batch_log, batch_checklist, batch_audio_preview, batch_cost_display, session_cost],
    )

    batch_checklist_btn.click(
        fn=_ver_estado_html,
        inputs=[batch_json_file],
        outputs=[batch_checklist],
    )


# ── START / BYE ──────────────────────────────────────────────────────────────

def _startbye_load_params(json_file: str, bloque: str, meb):
    data = load_json_file(json_file)
    nivel, cuaderno = parse_tema_id_to_level_and_cuaderno(data)
    misterios = get_misterios_for_block(data, bloque)
    meb = int(meb)
    rec = misterios[meb - 1] if misterios and 1 <= meb <= len(misterios) else {}
    misterio_global = int(rec.get("numero", meb))
    titulo_info = f"{rec.get('titulo', '')} — {rec.get('subtitulo', '')}"
    return nivel, cuaderno, misterio_global, titulo_info


def build_tab_startbye(json_choices):
    default_json = json_choices[0] if json_choices else None

    sb_history_start = gr.State([])
    sb_history_bye = gr.State([])

    gr.Markdown("### Selección")
    with gr.Row():
        sb_json_file = gr.Dropdown(choices=json_choices, value=default_json, label="Archivo JSON")
        sb_reload_btn = gr.Button("🔄", scale=0)
    with gr.Row():
        sb_bloque = gr.Dropdown(choices=BLOQUES, value="gozosos", label="Bloque")
        sb_meb = gr.Number(value=1, precision=0, label="Misterio en bloque (1–5)")
    sb_titulo_info = gr.Textbox(label="Misterio seleccionado", lines=1, interactive=False)

    with gr.Row():
        with gr.Column():
            gr.Markdown("#### START — Bienvenida")
            sb_gen_start_btn = gr.Button("🤖 Generar texto con IA", variant="secondary")
            sb_start_text = gr.Textbox(label="Texto START (editable)", lines=10)
            sb_mejorar_start_btn = gr.Button("✨ Mejorar ritmo oral", variant="secondary")
            sb_start_history_dd = gr.Dropdown(
                choices=[], value=None, label="↩ Versión anterior START",
                interactive=True, visible=False,
            )
            sb_tts_start_btn = gr.Button("🎧 Generar audio START", variant="primary")
            sb_start_audio = gr.Audio(
                label="🔊 START", type="filepath", autoplay=True, interactive=False
            )
            sb_start_info = gr.Textbox(label="", lines=2, interactive=False)

        with gr.Column():
            gr.Markdown("#### BYE — Despedida")
            sb_gen_bye_btn = gr.Button("🤖 Generar texto con IA", variant="secondary")
            sb_bye_text = gr.Textbox(label="Texto BYE (editable)", lines=10)
            sb_mejorar_bye_btn = gr.Button("✨ Mejorar ritmo oral", variant="secondary")
            sb_bye_history_dd = gr.Dropdown(
                choices=[], value=None, label="↩ Versión anterior BYE",
                interactive=True, visible=False,
            )
            sb_tts_bye_btn = gr.Button("🎧 Generar audio BYE", variant="primary")
            sb_bye_audio = gr.Audio(
                label="🔊 BYE", type="filepath", autoplay=True, interactive=False
            )
            sb_bye_info = gr.Textbox(label="", lines=2, interactive=False)

    gr.Markdown("### Estado del nivel")
    sb_checklist_btn = gr.Button("🔍 Ver estado del nivel")
    sb_checklist = gr.HTML()

    sb_cost_display = gr.Textbox(
        label="💰 Costo estimado", value="$0.0000", interactive=False, lines=1
    )

    return (
        sb_history_start, sb_history_bye,
        sb_json_file, sb_reload_btn,
        sb_bloque, sb_meb, sb_titulo_info,
        sb_gen_start_btn, sb_start_text, sb_mejorar_start_btn, sb_start_history_dd,
        sb_tts_start_btn, sb_start_audio, sb_start_info,
        sb_gen_bye_btn, sb_bye_text, sb_mejorar_bye_btn, sb_bye_history_dd,
        sb_tts_bye_btn, sb_bye_audio, sb_bye_info,
        sb_checklist_btn, sb_checklist, sb_cost_display,
    )


def register_handlers_startbye(
    sb_history_start, sb_history_bye,
    sb_json_file, sb_reload_btn,
    sb_bloque, sb_meb, sb_titulo_info,
    sb_gen_start_btn, sb_start_text, sb_mejorar_start_btn, sb_start_history_dd,
    sb_tts_start_btn, sb_start_audio, sb_start_info,
    sb_gen_bye_btn, sb_bye_text, sb_mejorar_bye_btn, sb_bye_history_dd,
    sb_tts_bye_btn, sb_bye_audio, sb_bye_info,
    sb_checklist_btn, sb_checklist, sb_cost_display,
    session_cost,
):
    sb_reload_btn.click(fn=reload_json_choices, inputs=[], outputs=[sb_json_file])

    def _gen_start(json_file, bloque, meb, session_cost_val):
        generated, _, _, _, _, titulo_info, _, cost = generate_ai_text(
            json_file, bloque, int(meb), "Bienvenida"
        )
        new_total = (session_cost_val or 0.0) + cost
        return generated, titulo_info, gr.update(value=_format_cost(new_total, cost)), new_total

    sb_gen_start_btn.click(
        fn=_gen_start,
        inputs=[sb_json_file, sb_bloque, sb_meb, session_cost],
        outputs=[sb_start_text, sb_titulo_info, sb_cost_display, session_cost],
    )

    def _gen_bye(json_file, bloque, meb, session_cost_val):
        generated, _, _, _, _, titulo_info, _, cost = generate_ai_text(
            json_file, bloque, int(meb), "Despedida"
        )
        new_total = (session_cost_val or 0.0) + cost
        return generated, titulo_info, gr.update(value=_format_cost(new_total, cost)), new_total

    sb_gen_bye_btn.click(
        fn=_gen_bye,
        inputs=[sb_json_file, sb_bloque, sb_meb, session_cost],
        outputs=[sb_bye_text, sb_titulo_info, sb_cost_display, session_cost],
    )

    def _tts_start(json_file, bloque, meb, text, session_cost_val):
        nivel, cuaderno, misterio_global, _ = _startbye_load_params(json_file, bloque, meb)
        full_path, _, filename, _, op_cost = generate_audio(
            text, "Bienvenida", nivel, cuaderno, misterio_global,
            SECTION_SPEEDS.get("Bienvenida", 1.0),
        )
        new_total = (session_cost_val or 0.0) + op_cost
        return str(full_path), f"Generado: {filename}", gr.update(value=_format_cost(new_total, op_cost)), new_total

    sb_tts_start_btn.click(
        fn=_tts_start,
        inputs=[sb_json_file, sb_bloque, sb_meb, sb_start_text, session_cost],
        outputs=[sb_start_audio, sb_start_info, sb_cost_display, session_cost],
    )

    def _tts_bye(json_file, bloque, meb, text, session_cost_val):
        nivel, cuaderno, misterio_global, _ = _startbye_load_params(json_file, bloque, meb)
        full_path, _, filename, _, op_cost = generate_audio(
            text, "Despedida", nivel, cuaderno, misterio_global,
            SECTION_SPEEDS.get("Despedida", 1.0),
        )
        new_total = (session_cost_val or 0.0) + op_cost
        return str(full_path), f"Generado: {filename}", gr.update(value=_format_cost(new_total, op_cost)), new_total

    sb_tts_bye_btn.click(
        fn=_tts_bye,
        inputs=[sb_json_file, sb_bloque, sb_meb, sb_bye_text, session_cost],
        outputs=[sb_bye_audio, sb_bye_info, sb_cost_display, session_cost],
    )

    def _mejorar_start(text, history, session_cost_val):
        updated_history = push_to_history(text, history)
        new_text, _, op_cost = mejorar_estilo_con_ia(text)
        new_total = (session_cost_val or 0.0) + op_cost
        choices = build_history_choices(updated_history)
        return (
            new_text, updated_history,
            gr.update(choices=choices, visible=len(updated_history) > 0),
            gr.update(value=_format_cost(new_total, op_cost)), new_total,
        )

    sb_mejorar_start_btn.click(
        fn=_mejorar_start,
        inputs=[sb_start_text, sb_history_start, session_cost],
        outputs=[sb_start_text, sb_history_start, sb_start_history_dd, sb_cost_display, session_cost],
    )

    def _mejorar_bye(text, history, session_cost_val):
        updated_history = push_to_history(text, history)
        new_text, _, op_cost = mejorar_estilo_con_ia(text)
        new_total = (session_cost_val or 0.0) + op_cost
        choices = build_history_choices(updated_history)
        return (
            new_text, updated_history,
            gr.update(choices=choices, visible=len(updated_history) > 0),
            gr.update(value=_format_cost(new_total, op_cost)), new_total,
        )

    sb_mejorar_bye_btn.click(
        fn=_mejorar_bye,
        inputs=[sb_bye_text, sb_history_bye, session_cost],
        outputs=[sb_bye_text, sb_history_bye, sb_bye_history_dd, sb_cost_display, session_cost],
    )

    sb_start_history_dd.change(
        fn=restore_version,
        inputs=[sb_start_history_dd, sb_history_start],
        outputs=[sb_start_text],
    )

    sb_bye_history_dd.change(
        fn=restore_version,
        inputs=[sb_bye_history_dd, sb_history_bye],
        outputs=[sb_bye_text],
    )

    sb_checklist_btn.click(
        fn=_ver_estado_html,
        inputs=[sb_json_file],
        outputs=[sb_checklist],
    )
