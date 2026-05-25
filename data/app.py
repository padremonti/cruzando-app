import logging
import gradio as gr
from gradio.themes import Soft

from styles import custom_css

logging.basicConfig(
    level=logging.WARNING,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%H:%M:%S",
)
from json_utils import discover_json_files, set_ai_text_generator
from tts_utils import generate_ai_text
from ui_tts import build_tab_tts, register_handlers_tts
from ui_gestor import build_tab_editor, register_handlers_editor, build_tab_gestor, register_handlers_gestor
from ui_batch import build_tab_batch, register_handlers_batch, build_tab_startbye, register_handlers_startbye
from ui_talleres import build_tab_talleres, register_handlers_talleres
from tts_talleres import discover_taller_json_files


def main():
    set_ai_text_generator(generate_ai_text)
    json_choices    = discover_json_files()
    taller_choices  = discover_taller_json_files()

    with gr.Blocks(
        title="CruzAndo TTS Maker",
        theme=Soft(primary_hue="blue", neutral_hue="slate"),
        css=custom_css,
    ) as demo:
        gr.Markdown("# CruzAndo TTS Maker")
        gr.Markdown(
            "Carga textos desde JSON, genera Bienvenida/Despedida con IA, edita y produce el MP3 final."
        )

        session_cost = gr.State(0.0)

        with gr.Tabs():
            with gr.Tab("TTS Maker"):
                tts_comps = build_tab_tts(json_choices)

            with gr.Tab("Editor de Contenido"):
                editor_comps = build_tab_editor(json_choices)

            with gr.Tab("Gestor JSON"):
                gestor_comps = build_tab_gestor()

            with gr.Tab("Batch"):
                batch_comps = build_tab_batch(json_choices)

            with gr.Tab("START / BYE"):
                startbye_comps = build_tab_startbye(json_choices)

            with gr.Tab("🏥 Talleres · Sanar"):
                talleres_comps = build_tab_talleres(taller_choices)

        register_handlers_tts(*tts_comps, session_cost)
        register_handlers_editor(*editor_comps)
        register_handlers_gestor(*gestor_comps)
        register_handlers_batch(*batch_comps, session_cost)
        register_handlers_startbye(*startbye_comps, session_cost)
        register_handlers_talleres(*talleres_comps, session_cost)

    demo.launch(
        inbrowser=True,
        allowed_paths=[
            r"C:\R2\cruzando-audios",
            r"C:\R2\cruzando-music",
            r"C:\R2\cruzando-ilustraciones",
        ]
    )


if __name__ == "__main__":
    main()
