import shutil

import gradio as gr

from config import BLOQUES, MP3_FOLDER_MAP, OUTPUT_DIR
from json_utils import (
    reload_json_choices,
    load_json_for_editor,
    save_json_from_editor,
    gestor_a_load_data,
    gestor_a_update_misterios,
    gestor_a_load_misterio_fields,
    gestor_a_save_misterio,
    create_empty_structure,
    add_misterios_to_block,
    save_micro_preview,
    list_mp3_root,
    list_mp3_in_folder,
    rename_mp3,
    move_mp3_to_folder,
    delete_mp3,
    organizar_mp3s,
)
from tts_utils import parse_misterios_with_ai, generate_micro_with_ai

_MP3_FOLDERS = ["(raíz)"] + sorted(set(MP3_FOLDER_MAP.values()))


def build_tab_editor(json_choices):
    default_json = json_choices[0] if json_choices else None

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

    return (
        editor_json_file, editor_reload_btn, editor_load_btn,
        editor_content, editor_save_btn, editor_status,
    )


def register_handlers_editor(
    editor_json_file, editor_reload_btn, editor_load_btn,
    editor_content, editor_save_btn, editor_status,
):
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


def build_tab_gestor():
    with gr.Tabs():

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
            gestor_a_titulo        = gr.Textbox(label="Título", lines=1)
            gestor_a_subtitulo     = gr.Textbox(label="Subtítulo", lines=1)
            gestor_a_referencia    = gr.Textbox(label="Referencia bíblica", lines=1)
            gestor_a_evangelio     = gr.Textbox(label="Evangelio", lines=7)
            gestor_a_contemplacion = gr.Textbox(label="Contemplación", lines=9)
            gestor_a_meditacion    = gr.Textbox(label="Meditación", lines=6)
            gestor_a_intercesion   = gr.Textbox(label="Intercesión", lines=4)

            gestor_a_save_btn    = gr.Button("💾 Guardar cambios", variant="primary")
            gestor_a_save_status = gr.Textbox(label="Estado del guardado", lines=2, interactive=False)

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
                gestor_b_mundo    = gr.Textbox(label="Mundo / Nombre del nivel", placeholder="CruzAndo la Cruz")
                gestor_b_cuaderno = gr.Textbox(label="Cuaderno / Elemento", placeholder="Males")
                gestor_b_tension  = gr.Textbox(label="Tensión vertebral (solo para micro)", placeholder="La verdad me libera")
            gestor_b_create_btn = gr.Button("📄 Crear estructura vacía")
            gestor_b_preview = gr.Textbox(
                label="Vista previa del JSON generado",
                lines=22,
                elem_id="gestor_b_preview",
            )
            gestor_b_status = gr.Textbox(label="Estado", lines=2)

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
            gestor_c_parse_btn    = gr.Button("🤖 Parsear con IA", variant="primary")
            gestor_c_status_parse = gr.Textbox(label="Estado del parseo", lines=2)
            gestor_c_preview = gr.Textbox(
                label="Resultado parseado (editable antes de guardar)",
                lines=20,
                elem_id="gestor_preview",
            )
            gestor_c_add_btn    = gr.Button("➕ Agregar al archivo")
            gestor_c_status_add = gr.Textbox(label="Estado del guardado", lines=2)

        with gr.Tab("D — Micro IA"):
            gr.Markdown(
                "Genera el archivo `{id}-micro.json` completo con IA a partir de la introducción del cuaderno "
                "y los datos de misterios ya existentes."
            )
            with gr.Row():
                gestor_d_id       = gr.Textbox(label="ID del nivel (debe existir {id}.json)", placeholder="0101", scale=1)
                gestor_d_cuaderno = gr.Textbox(label="Nombre del cuaderno", placeholder="Males", scale=1)
                gestor_d_tension  = gr.Textbox(label="Tensión vertebral", placeholder="La verdad me libera", scale=2)
            gestor_d_intro = gr.Textbox(
                label="Texto de introducción del cuaderno",
                lines=12,
                elem_id="gestor_micro_intro",
                placeholder="Pega aquí el texto de introducción del cuaderno...",
            )
            gestor_d_generate_btn = gr.Button("🤖 Generar micro con IA", variant="primary")
            gestor_d_status_gen   = gr.Textbox(label="Estado de generación", lines=2)
            gestor_d_preview = gr.Textbox(
                label="Vista previa del micro generado (editable)",
                lines=28,
                elem_id="gestor_micro_preview",
            )
            gestor_d_save_btn    = gr.Button("💾 Guardar como {id}-micro.json")
            gestor_d_status_save = gr.Textbox(label="Estado del guardado", lines=2)

        with gr.Tab("E — Archivos MP3"):
            gr.Markdown("### 📦 Organizar archivos")
            gr.Markdown(
                "Mueve los MP3 de la raíz de OUTPUT_DIR a su carpeta correspondiente según su prefijo. "
                "Archivos sin prefijo reconocible se dejan en raíz. "
                "Carpetas protegidas (overview, nivel_1, global, extras, Mezcla) nunca se tocan."
            )
            with gr.Row():
                organizar_btn    = gr.Button("📦 Organizar ahora", variant="primary")
                organizar_status = gr.Textbox(label="Resultado", lines=1, interactive=False, scale=3)
            organizar_log = gr.Textbox(label="Log de organización", lines=12, interactive=False)

            gr.Markdown("---")
            gr.Markdown("### 🗂 Explorador de archivos")

            with gr.Row():
                mp3_folder_selector = gr.Dropdown(
                    choices=_MP3_FOLDERS,
                    value="(raíz)",
                    label="Carpeta",
                    scale=1,
                )
                mp3_refresh_btn = gr.Button("🔄 Refrescar", scale=0)

            mp3_file_list = gr.Dropdown(choices=[], value=None, label="Archivos MP3", interactive=True)
            mp3_count_info = gr.Textbox(label="", lines=1, interactive=False)
            mp3_preview = gr.Audio(label="🔊 Vista previa", type="filepath", interactive=False)

            gr.Markdown("#### Renombrar")
            with gr.Row():
                mp3_new_name   = gr.Textbox(label="Nuevo nombre (sin .mp3)", scale=3)
                mp3_rename_btn = gr.Button("✏️ Renombrar", scale=1)
            mp3_rename_status = gr.Textbox(label="", lines=1, interactive=False)

            gr.Markdown("#### Mover a carpeta")
            with gr.Row():
                mp3_dest_folder = gr.Dropdown(
                    choices=sorted(set(MP3_FOLDER_MAP.values())),
                    value=None,
                    label="Carpeta destino",
                    scale=2,
                )
                mp3_move_btn = gr.Button("📁 Mover", scale=1)
            mp3_move_status = gr.Textbox(label="", lines=1, interactive=False)

            gr.Markdown("#### Eliminar")
            gr.Markdown("⚠️ La eliminación es permanente. Marca la casilla de confirmación antes de eliminar.")
            with gr.Row():
                mp3_delete_confirm = gr.Checkbox(
                    label="Confirmo que quiero eliminar este archivo",
                    value=False,
                )
                mp3_delete_btn = gr.Button("🗑 Eliminar", variant="stop", interactive=False)
            mp3_delete_status = gr.Textbox(label="", lines=1, interactive=False)

    return (
        gestor_a_data, gestor_a_id, gestor_a_load_btn, gestor_a_status,
        gestor_a_bloque, gestor_a_misterio,
        gestor_a_titulo, gestor_a_subtitulo, gestor_a_referencia,
        gestor_a_evangelio, gestor_a_contemplacion, gestor_a_meditacion, gestor_a_intercesion,
        gestor_a_save_btn, gestor_a_save_status,
        gestor_b_type, gestor_b_id, gestor_b_mundo, gestor_b_cuaderno, gestor_b_tension,
        gestor_b_create_btn, gestor_b_preview, gestor_b_status,
        gestor_c_id, gestor_c_bloque, gestor_c_raw,
        gestor_c_parse_btn, gestor_c_status_parse, gestor_c_preview,
        gestor_c_add_btn, gestor_c_status_add,
        gestor_d_id, gestor_d_cuaderno, gestor_d_tension, gestor_d_intro,
        gestor_d_generate_btn, gestor_d_status_gen, gestor_d_preview,
        gestor_d_save_btn, gestor_d_status_save,
        organizar_btn, organizar_status, organizar_log,
        mp3_folder_selector, mp3_refresh_btn,
        mp3_file_list, mp3_count_info, mp3_preview,
        mp3_new_name, mp3_rename_btn, mp3_rename_status,
        mp3_dest_folder, mp3_move_btn, mp3_move_status,
        mp3_delete_confirm, mp3_delete_btn, mp3_delete_status,
    )


def register_handlers_gestor(
    gestor_a_data, gestor_a_id, gestor_a_load_btn, gestor_a_status,
    gestor_a_bloque, gestor_a_misterio,
    gestor_a_titulo, gestor_a_subtitulo, gestor_a_referencia,
    gestor_a_evangelio, gestor_a_contemplacion, gestor_a_meditacion, gestor_a_intercesion,
    gestor_a_save_btn, gestor_a_save_status,
    gestor_b_type, gestor_b_id, gestor_b_mundo, gestor_b_cuaderno, gestor_b_tension,
    gestor_b_create_btn, gestor_b_preview, gestor_b_status,
    gestor_c_id, gestor_c_bloque, gestor_c_raw,
    gestor_c_parse_btn, gestor_c_status_parse, gestor_c_preview,
    gestor_c_add_btn, gestor_c_status_add,
    gestor_d_id, gestor_d_cuaderno, gestor_d_tension, gestor_d_intro,
    gestor_d_generate_btn, gestor_d_status_gen, gestor_d_preview,
    gestor_d_save_btn, gestor_d_status_save,
    organizar_btn, organizar_status, organizar_log,
    mp3_folder_selector, mp3_refresh_btn,
    mp3_file_list, mp3_count_info, mp3_preview,
    mp3_new_name, mp3_rename_btn, mp3_rename_status,
    mp3_dest_folder, mp3_move_btn, mp3_move_status,
    mp3_delete_confirm, mp3_delete_btn, mp3_delete_status,
):
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

    gestor_b_create_btn.click(
        fn=create_empty_structure,
        inputs=[gestor_b_type, gestor_b_id, gestor_b_mundo, gestor_b_cuaderno, gestor_b_tension],
        outputs=[gestor_b_preview, gestor_b_status],
    )

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

    # ── E — Archivos MP3 ────────────────────────────────────────────

    def _organizar_handler():
        resumen, log_lines = organizar_mp3s()
        return resumen, "\n".join(log_lines)

    organizar_btn.click(
        fn=_organizar_handler,
        outputs=[organizar_status, organizar_log],
    )

    def _refresh_mp3_list(folder):
        subfolder = None if folder == "(raíz)" else folder
        files = list_mp3_root() if subfolder is None else list_mp3_in_folder(subfolder)
        return gr.update(choices=files, value=None), f"{len(files)} archivo(s)", None

    mp3_folder_selector.change(
        fn=_refresh_mp3_list,
        inputs=[mp3_folder_selector],
        outputs=[mp3_file_list, mp3_count_info, mp3_preview],
    )

    mp3_refresh_btn.click(
        fn=_refresh_mp3_list,
        inputs=[mp3_folder_selector],
        outputs=[mp3_file_list, mp3_count_info, mp3_preview],
    )

    def _load_mp3_preview(filename, folder):
        if not filename:
            return None
        subfolder = None if folder == "(raíz)" else folder
        base = OUTPUT_DIR / subfolder if subfolder else OUTPUT_DIR
        path = base / filename
        return str(path) if path.exists() else None

    mp3_file_list.change(
        fn=_load_mp3_preview,
        inputs=[mp3_file_list, mp3_folder_selector],
        outputs=[mp3_preview],
    )

    mp3_delete_confirm.change(
        fn=lambda checked: gr.update(interactive=checked),
        inputs=[mp3_delete_confirm],
        outputs=[mp3_delete_btn],
    )

    def _rename_handler(filename, new_name, folder):
        if not filename:
            return "❌ Selecciona un archivo primero.", gr.update(), ""
        subfolder = None if folder == "(raíz)" else folder
        status = rename_mp3(filename, new_name, subfolder)
        files = list_mp3_root() if subfolder is None else list_mp3_in_folder(subfolder)
        return status, gr.update(choices=files, value=None), ""

    mp3_rename_btn.click(
        fn=_rename_handler,
        inputs=[mp3_file_list, mp3_new_name, mp3_folder_selector],
        outputs=[mp3_rename_status, mp3_file_list, mp3_new_name],
    )

    def _move_handler(filename, dest_folder, current_folder):
        if not filename:
            return "❌ Selecciona un archivo primero.", gr.update()
        if not dest_folder:
            return "❌ Selecciona carpeta destino.", gr.update()
        subfolder = None if current_folder == "(raíz)" else current_folder
        if subfolder is not None:
            src = OUTPUT_DIR / subfolder / filename
            dest_dir = OUTPUT_DIR / dest_folder
            dest_dir.mkdir(exist_ok=True)
            dest = dest_dir / filename
            if dest.exists():
                return f"⚠️ Ya existe en destino: {dest_folder}/{filename}", gr.update()
            try:
                shutil.move(str(src), str(dest))
                status = f"✅ Movido: {subfolder}/{filename} → {dest_folder}/"
            except Exception as e:
                status = f"❌ Error: {e}"
        else:
            status = move_mp3_to_folder(filename, dest_folder)
        files = list_mp3_root() if subfolder is None else list_mp3_in_folder(subfolder)
        return status, gr.update(choices=files, value=None)

    mp3_move_btn.click(
        fn=_move_handler,
        inputs=[mp3_file_list, mp3_dest_folder, mp3_folder_selector],
        outputs=[mp3_move_status, mp3_file_list],
    )

    def _delete_handler(filename, folder, confirmed):
        if not confirmed:
            return "❌ Marca la casilla de confirmación primero.", gr.update(), False
        if not filename:
            return "❌ Selecciona un archivo primero.", gr.update(), False
        subfolder = None if folder == "(raíz)" else folder
        status = delete_mp3(filename, subfolder)
        files = list_mp3_root() if subfolder is None else list_mp3_in_folder(subfolder)
        return status, gr.update(choices=files, value=None), False

    mp3_delete_btn.click(
        fn=_delete_handler,
        inputs=[mp3_file_list, mp3_folder_selector, mp3_delete_confirm],
        outputs=[mp3_delete_status, mp3_file_list, mp3_delete_confirm],
    )
