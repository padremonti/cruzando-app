import gradio as gr

from config import BLOQUES, SECTION_CODES, SECTION_SPEEDS
from json_utils import (
    reload_json_choices,
    load_context_and_text_with_fields,
    save_misterio_from_accordion,
    siguiente_seccion_y_carga,
    load_nota,
    save_nota,
    load_all_notas_for_level,
    push_to_history,
    build_history_choices,
    restore_version,
)
from tts_utils import generate_audio, mejorar_estilo_con_ia


def build_tab_tts(json_choices):
    default_json = json_choices[0] if json_choices else None

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
            speed_slider = gr.Slider(
                minimum=0.85,
                maximum=1.15,
                value=1.0,
                step=0.01,
                label="⏱ Velocidad de lectura",
                info="0.92–0.95 recomendado para Contemplación y Preguntas",
            )
            text = gr.Textbox(
                label="Texto editable",
                lines=12,
                elem_id="text_editable",
                placeholder="Aquí se cargará o generará el texto. Luego puedes corregirlo antes de crear el TTS.",
            )
            tts_history = gr.State([])
            with gr.Accordion("🕐 Versiones anteriores", open=False):
                history_dropdown = gr.Dropdown(
                    choices=[],
                    value=None,
                    label="Recuperar versión anterior",
                    interactive=True,
                )
                history_restore_btn = gr.Button("↩ Restaurar esta versión", variant="secondary")
            with gr.Row():
                mejorar_btn = gr.Button("✨ Mejorar estilo", variant="secondary")
                fin_texto_toggle = gr.Checkbox(
                    label='Añadir "Fin del texto." al final',
                    value=True,
                    info='Evita que la TTS corte el audio antes de terminar. Desactiva para probar.',
                )
            generate_btn = gr.Button("🎧 Generar audio", variant="primary")

        with gr.Column(scale=1):
            gr.Markdown("### Resultado")
            filename_preview = gr.Textbox(label="Nombre de archivo previsto")
            voice_info = gr.Textbox(label="Información de voz / aviso", lines=3)
            audio_output = gr.Audio(
                label="🔊 Vista previa",
                type="filepath",
                autoplay=True,
            )
            next_section_btn = gr.Button("➡️ Siguiente sección")
            result_output = gr.Textbox(label="Resultado", lines=8)
            download_output = gr.File(label="Descargar MP3")
            cost_display = gr.Textbox(
                label="💰 Costo estimado",
                value="$0.0000",
                interactive=False,
                lines=1,
            )
            cost_reset_btn = gr.Button("🔄 Reiniciar contador", variant="secondary")

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
            ac_save_btn    = gr.Button("💾 Guardar cambios en JSON", variant="primary")
            ac_save_status = gr.Textbox(label="Estado", lines=2, scale=2)
        gr.Markdown("---")
        gr.Markdown("#### 📝 Notas de producción")
        nota_text = gr.Textbox(
            label="Nota para este misterio",
            placeholder='ej: "Revisar pronunciación de «Getsemaní»" / "Regenerar CONT — sonó forzado"',
            lines=3,
            max_lines=5,
        )
        with gr.Row():
            nota_save_btn = gr.Button("💾 Guardar nota", variant="secondary")
            nota_status   = gr.Textbox(label="", lines=1, scale=2, interactive=False)

    with gr.Accordion("📋 Todas las notas del nivel", open=False):
        notas_all_display = gr.Textbox(label="", lines=10, interactive=False)
        notas_reload_btn  = gr.Button("🔄 Actualizar notas del nivel")

    return (
        json_file, reload_json_btn, bloque, misterio_en_bloque,
        nivel, cuaderno, misterio, load_context_btn, titulo_info, context_info,
        section_name, speed_slider, text, tts_history, history_dropdown, history_restore_btn,
        mejorar_btn, fin_texto_toggle, generate_btn,
        filename_preview, voice_info, audio_output, next_section_btn,
        result_output, download_output,
        ac_titulo, ac_subtitulo, ac_referencia,
        ac_evangelio, ac_contemplacion, ac_meditacion, ac_intercesion,
        ac_save_btn, ac_save_status,
        nota_text, nota_save_btn, nota_status,
        notas_all_display, notas_reload_btn,
        cost_display, cost_reset_btn,
    )


def format_cost(total: float, this_op: float) -> str:
    return f"Esta op: ${this_op:.4f} | Total sesión: ${total:.4f}"


def register_handlers_tts(
    json_file, reload_json_btn, bloque, misterio_en_bloque,
    nivel, cuaderno, misterio, load_context_btn, titulo_info, context_info,
    section_name, speed_slider, text, tts_history, history_dropdown, history_restore_btn,
    mejorar_btn, fin_texto_toggle, generate_btn,
    filename_preview, voice_info, audio_output, next_section_btn,
    result_output, download_output,
    ac_titulo, ac_subtitulo, ac_referencia,
    ac_evangelio, ac_contemplacion, ac_meditacion, ac_intercesion,
    ac_save_btn, ac_save_status,
    nota_text, nota_save_btn, nota_status,
    notas_all_display, notas_reload_btn,
    cost_display, cost_reset_btn,
    session_cost,
):
    def update_speed_for_section(section):
        return SECTION_SPEEDS.get(section, 1.0)

    reload_json_btn.click(
        fn=reload_json_choices,
        inputs=[],
        outputs=[json_file],
    )

    section_name.change(
        fn=update_speed_for_section,
        inputs=[section_name],
        outputs=[speed_slider],
    )

    def _load_context_with_nota(json_file, bloque, misterio_en_bloque, section_name):
        results = load_context_and_text_with_fields(json_file, bloque, misterio_en_bloque, section_name)
        nota = load_nota(json_file, bloque, misterio_en_bloque)
        all_notas = load_all_notas_for_level(json_file)
        return (*results, nota, all_notas, [], gr.update(choices=[], value=None))

    load_context_btn.click(
        fn=_load_context_with_nota,
        inputs=[json_file, bloque, misterio_en_bloque, section_name],
        outputs=[
            nivel, cuaderno, misterio, titulo_info, context_info, text, voice_info, filename_preview,
            ac_titulo, ac_subtitulo, ac_referencia,
            ac_evangelio, ac_contemplacion, ac_meditacion, ac_intercesion,
            speed_slider,
            nota_text, notas_all_display, tts_history, history_dropdown,
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

    def _generate_and_track(text_input, section, nivel, cuaderno, misterio, fin_texto, speed, history, session_cost_val):
        updated_history = push_to_history(text_input, history)
        audio, result, filename, download, op_cost = generate_audio(
            text_input, section, nivel, cuaderno, misterio, fin_texto, speed
        )
        new_total = session_cost_val + op_cost
        choices = build_history_choices(updated_history)
        return (
            audio, result, filename, download,
            updated_history, gr.update(choices=choices, value=None),
            gr.update(value=format_cost(new_total, op_cost)), new_total,
        )

    generate_btn.click(
        fn=_generate_and_track,
        inputs=[text, section_name, nivel, cuaderno, misterio, fin_texto_toggle, speed_slider, tts_history, session_cost],
        outputs=[audio_output, result_output, filename_preview, download_output, tts_history, history_dropdown, cost_display, session_cost],
    )

    cost_reset_btn.click(
        fn=lambda: (0.0, gr.update(value="$0.0000")),
        inputs=[],
        outputs=[session_cost, cost_display],
    )

    def _mejorar_and_track(text_input, history, session_cost_val):
        updated_history = push_to_history(text_input, history)
        new_text, info, op_cost = mejorar_estilo_con_ia(text_input)
        new_total = session_cost_val + op_cost
        choices = build_history_choices(updated_history)
        return (
            new_text, info, updated_history, gr.update(choices=choices, value=None),
            gr.update(value=format_cost(new_total, op_cost)), new_total,
        )

    mejorar_btn.click(
        fn=_mejorar_and_track,
        inputs=[text, tts_history, session_cost],
        outputs=[text, voice_info, tts_history, history_dropdown, cost_display, session_cost],
    )

    history_restore_btn.click(
        fn=restore_version,
        inputs=[history_dropdown, tts_history],
        outputs=[text],
    )

    nota_save_btn.click(
        fn=save_nota,
        inputs=[json_file, bloque, misterio_en_bloque, nota_text],
        outputs=[nota_status],
    )

    notas_reload_btn.click(
        fn=load_all_notas_for_level,
        inputs=[json_file],
        outputs=[notas_all_display],
    )

    def _siguiente_y_limpiar_audio(section_name, json_file, bloque, misterio_en_bloque, nivel, cuaderno, misterio):
        result = siguiente_seccion_y_carga(section_name, json_file, bloque, misterio_en_bloque, nivel, cuaderno, misterio)
        return (*result, None)

    next_section_btn.click(
        fn=_siguiente_y_limpiar_audio,
        inputs=[section_name, json_file, bloque, misterio_en_bloque, nivel, cuaderno, misterio],
        outputs=[
            section_name, text, voice_info, filename_preview,
            nivel, cuaderno, misterio,
            misterio_en_bloque, bloque,
            titulo_info, context_info,
            audio_output,
        ],
    )
