"""Tab 'Talleres (Sanar)' para CruzAndo TTS Maker."""

import logging
import gradio as gr

from tts_talleres import (
    discover_taller_json_files,
    load_taller_json,
    get_intro_text,
    get_misterio_text,
    misterio_choices,
    build_taller_filename,
    generate_taller_audio,
    save_taller_field,
    check_audio_status,
)

logger = logging.getLogger(__name__)


def _fmt_cost(total: float, this_op: float) -> str:
    return f"Esta op: ${this_op:.4f} | Total sesión: ${total:.4f}"


def build_tab_talleres(taller_choices):
    default = taller_choices[0] if taller_choices else None

    with gr.Row():
        # ── Columna izquierda: selección ──────────────────────────────
        with gr.Column(scale=1):
            gr.Markdown("### Taller")
            with gr.Row():
                json_file  = gr.Dropdown(choices=taller_choices, value=default, label="Archivo JSON")
                reload_btn = gr.Button("🔄", scale=0)
            load_btn    = gr.Button("📥 Cargar taller")
            taller_info = gr.Textbox(label="Taller cargado", lines=3, interactive=False)
            audio_status = gr.Textbox(label="Estado de audios", lines=12, interactive=False)

        # ── Columna central: edición y generación ─────────────────────
        with gr.Column(scale=2):
            gr.Markdown("### Sección")
            section_type = gr.Radio(
                choices=["bienvenida", "contemplacion", "oracion"],
                value="bienvenida",
                label="Tipo de sección",
            )
            misterio_dd = gr.Dropdown(
                choices=[], value=None, label="Misterio (para contemplación y oración)",
                visible=False,
            )
            load_text_btn = gr.Button("📄 Cargar texto")
            text = gr.Textbox(
                label="Texto editable",
                lines=14,
                placeholder="Aquí se cargará el texto del JSON. Edítalo antes de generar el audio.",
            )
            with gr.Row():
                save_text_btn = gr.Button("💾 Guardar texto en JSON", variant="secondary")
                save_status   = gr.Textbox(label="", lines=1, scale=2, interactive=False)
            speed_slider = gr.Slider(
                minimum=0.85, maximum=1.15, value=1.0, step=0.01,
                label="⏱ Velocidad de lectura",
            )
            generate_btn = gr.Button("🎧 Generar audio", variant="primary")

        # ── Columna derecha: resultado ─────────────────────────────────
        with gr.Column(scale=1):
            gr.Markdown("### Resultado")
            filename_preview = gr.Textbox(label="Nombre de archivo", interactive=False)
            audio_output     = gr.Audio(label="🔊 Vista previa", type="filepath", autoplay=True)
            result_output    = gr.Textbox(label="Resultado", lines=5, interactive=False)
            download_output  = gr.File(label="Descargar MP3")
            cost_display     = gr.Textbox(
                label="💰 Costo estimado", value="$0.0000",
                interactive=False, lines=1,
            )
            cost_reset_btn = gr.Button("🔄 Reiniciar contador", variant="secondary")

    # State interno
    taller_data_state  = gr.State({})
    misterio_idx_state = gr.State(0)

    return (
        json_file, reload_btn, load_btn, taller_info, audio_status,
        section_type, misterio_dd, load_text_btn,
        text, save_text_btn, save_status,
        speed_slider, generate_btn,
        filename_preview, audio_output, result_output, download_output,
        cost_display, cost_reset_btn,
        taller_data_state, misterio_idx_state,
    )


def register_handlers_talleres(
    json_file, reload_btn, load_btn, taller_info, audio_status,
    section_type, misterio_dd, load_text_btn,
    text, save_text_btn, save_status,
    speed_slider, generate_btn,
    filename_preview, audio_output, result_output, download_output,
    cost_display, cost_reset_btn,
    taller_data_state, misterio_idx_state,
    session_cost,
):
    # ── Recargar lista de JSONs ───────────────────────────────────────
    def _reload():
        files = discover_taller_json_files()
        return gr.update(choices=files, value=files[0] if files else None)

    reload_btn.click(fn=_reload, inputs=[], outputs=[json_file])

    # ── Cargar taller ─────────────────────────────────────────────────
    def _load_taller(filename):
        data    = load_taller_json(filename)
        nombre  = data.get("nombre", "Sin nombre")
        mundo   = data.get("mundoNombre", "")
        n_mist  = len(data.get("misterios", []))
        info    = f"{nombre}\nMundo: {mundo}\n{n_mist} misterios"
        choices = misterio_choices(data)
        status  = check_audio_status(filename, data)
        return (
            info, status, data,
            gr.update(choices=choices, value=choices[0] if choices else None),
        )

    load_btn.click(
        fn=_load_taller,
        inputs=[json_file],
        outputs=[taller_info, audio_status, taller_data_state, misterio_dd],
    )

    # ── Mostrar/ocultar dropdown de misterio ──────────────────────────
    def _toggle_misterio_dd(section):
        return gr.update(visible=(section != "bienvenida"))

    section_type.change(
        fn=_toggle_misterio_dd,
        inputs=[section_type],
        outputs=[misterio_dd],
    )

    # ── Cargar texto según sección ────────────────────────────────────
    def _load_text(filename, section, misterio_choice, data):
        idx = 0
        if misterio_choice and section != "bienvenida":
            try:
                idx = int(misterio_choice.split(" — ")[0]) - 1
            except Exception:
                idx = 0

        if section == "bienvenida":
            loaded_text = get_intro_text(data)
            fname = build_taller_filename(filename, "bienvenida")
        else:
            loaded_text = get_misterio_text(data, idx, section)
            fname = build_taller_filename(filename, section, idx + 1)

        return loaded_text, fname, idx

    load_text_btn.click(
        fn=_load_text,
        inputs=[json_file, section_type, misterio_dd, taller_data_state],
        outputs=[text, filename_preview, misterio_idx_state],
    )

    # ── Guardar texto en JSON ─────────────────────────────────────────
    def _save_text(filename, section, idx, new_text):
        return save_taller_field(filename, section, idx, new_text)

    save_text_btn.click(
        fn=_save_text,
        inputs=[json_file, section_type, misterio_idx_state, text],
        outputs=[save_status],
    )

    # ── Generar audio ─────────────────────────────────────────────────
    def _generate(filename, section, idx, text_input, speed, session_cost_val):
        if section == "bienvenida":
            out_fname = build_taller_filename(filename, "bienvenida")
        else:
            out_fname = build_taller_filename(filename, section, idx + 1)

        audio_path, op_cost = generate_taller_audio(text_input, out_fname, section, speed)
        new_total = session_cost_val + op_cost
        result = (
            f"Archivo: {out_fname}\n"
            f"Sección: {section}\n"
            f"Voz: nova\n"
            f"Velocidad: {round(speed, 2)}\n"
            f"Costo: ${op_cost:.4f}"
        )
        return (
            audio_path, result, out_fname, audio_path,
            gr.update(value=_fmt_cost(new_total, op_cost)),
            new_total,
        )

    generate_btn.click(
        fn=_generate,
        inputs=[json_file, section_type, misterio_idx_state, text, speed_slider, session_cost],
        outputs=[audio_output, result_output, filename_preview, download_output,
                 cost_display, session_cost],
    )

    # ── Reiniciar costo ───────────────────────────────────────────────
    cost_reset_btn.click(
        fn=lambda: (0.0, gr.update(value="$0.0000")),
        inputs=[],
        outputs=[session_cost, cost_display],
    )

    # ── Actualizar estado de audios al cambiar JSON ───────────────────
    def _refresh_status(filename, data):
        if not data:
            return ""
        return check_audio_status(filename, data)

    json_file.change(
        fn=_refresh_status,
        inputs=[json_file, taller_data_state],
        outputs=[audio_status],
    )
