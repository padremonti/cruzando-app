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
