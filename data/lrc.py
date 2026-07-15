# -*- coding: utf-8 -*-
# =============================================================================
#  CruzAndo — LRC Sync Maker  (tap-to-sync)
#  Crea archivos .lrc marcando cada verso con la barra ESPACIO mientras suena
#  el canto. Alimenta el visualizador de cantos (karaoke).
#
#  ---------------------------------------------------------------------------
#  INSTALACION
#  ---------------------------------------------------------------------------
#  1) Python 3.8+  (tkinter viene incluido en los instaladores oficiales)
#  2) Reproductor VLC de escritorio instalado:
#        Windows / Mac:  https://www.videolan.org/vlc/
#        (python-vlc usa la libreria libVLC que trae el VLC de escritorio)
#  3) Binding de Python:
#        pip install python-vlc
#
#  EJECUTAR
#        python data/lrc_sync_maker.py
#
#  NOTA Windows: instala VLC de la MISMA arquitectura que tu Python (64-bit
#  con Python 64-bit). Si python-vlc no encuentra libVLC, reinstala VLC 64-bit.
# =============================================================================

import os
import sys
import tkinter as tk
from tkinter import ttk, filedialog, messagebox

try:
    import vlc
except Exception as e:  # pragma: no cover
    print("ERROR: no se pudo importar 'vlc' (python-vlc).")
    print("Instala con:  pip install python-vlc")
    print("Y asegurate de tener el reproductor VLC de escritorio instalado.")
    print("Detalle:", e)
    sys.exit(1)


# =============================================================================
#  HELPERS DE TIEMPO  (precision de centesimas, 2 decimales)
# =============================================================================

def fmt_time(seconds):
    """segundos (float) -> 'mm:ss.xx'. Minutos sin tope (00..99+)."""
    if seconds is None or seconds < 0:
        return "--:--.--"
    seconds = round(seconds, 2)
    m = int(seconds // 60)
    s = seconds - m * 60
    return "{:02d}:{:05.2f}".format(m, s)


def parse_time(text):
    """'mm:ss.xx' o 'ss.xx' o 'ss' -> segundos (float). None si invalido."""
    text = (text or "").strip()
    if not text:
        return None
    try:
        if ":" in text:
            mm, ss = text.split(":", 1)
            return max(0.0, int(mm) * 60 + float(ss))
        return max(0.0, float(text))
    except (ValueError, TypeError):
        return None


# =============================================================================
#  MODELO DE DATOS
# =============================================================================

class Line:
    """Un verso de la letra.
       is_sep=True  -> linea en blanco (separador de estrofa, nunca lleva tiempo)
       time         -> tiempo MARCADO crudo en segundos (sin offset) o None
    """
    __slots__ = ("text", "is_sep", "time")

    def __init__(self, text, is_sep=False, time=None):
        self.text = text
        self.is_sep = is_sep
        self.time = time


# =============================================================================
#  CAPA DE AUDIO  (aisla VLC del resto: load / play / pause / get_time / seek)
# =============================================================================

class AudioPlayer:
    def __init__(self):
        self._instance = vlc.Instance("--no-video", "--quiet")
        self._player = self._instance.media_player_new()
        self.path = None

    def load(self, path):
        media = self._instance.media_new(path)
        self._player.set_media(media)
        self.path = path
        # parsea para conocer la duracion (no bloqueante imprescindible aqui)

    def play(self):
        self._player.play()

    def pause(self):
        self._player.set_pause(1)

    def stop(self):
        self._player.stop()

    def get_time_seconds(self):
        """Posicion REAL leida del motor VLC (ms -> s). None si aun no valida."""
        ms = self._player.get_time()
        if ms is None or ms < 0:
            return None
        return ms / 1000.0

    def seek_seconds(self, seconds):
        seconds = max(0.0, seconds)
        self._player.set_time(int(seconds * 1000))

    def is_ended(self):
        return self._player.get_state() == vlc.State.Ended

    def duration_seconds(self):
        ms = self._player.get_length()
        return (ms / 1000.0) if ms and ms > 0 else None


# =============================================================================
#  APLICACION  (GUI)
# =============================================================================

class App(tk.Tk):

    REFRESH_MS = 50  # bucle de refresco del indicador de tiempo

    def __init__(self):
        super().__init__()
        self.title("CruzAndo — LRC Sync Maker")
        self.geometry("1080x720")
        self.minsize(960, 640)

        # --- Estado ---
        self.player = AudioPlayer()
        self.lines = []            # list[Line] en orden
        self.pointer = None        # indice de la proxima linea PENDIENTE (o None)
        self.remark_index = None   # indice de linea a re-marcar (modo B) o None
        self.undo_stack = []       # list[(index, prev_time, prev_pointer)]
        self.is_playing = False

        # --- Variables tk ---
        self.offset_var = tk.DoubleVar(value=0.0)
        self.ti_var = tk.StringVar(value="")
        self.ar_var = tk.StringVar(value="")
        self.time_edit_var = tk.StringVar(value="")
        self.status_var = tk.StringVar(value="Abre un audio y pega la letra.")
        self.cur_time_var = tk.StringVar(value="--:--.--")
        self.last_marked_var = tk.StringVar(value="—")
        self.next_line_var = tk.StringVar(value="—")

        self._build_ui()
        self._bind_keys()

        # bucle de refresco
        self.after(self.REFRESH_MS, self._tick)

    # ----------------------------------------------------------------- UI ---
    def _build_ui(self):
        pad = dict(padx=6, pady=4)

        # ====== Barra superior: archivo + transporte + cabecera ======
        top = ttk.Frame(self)
        top.pack(side="top", fill="x", **pad)

        ttk.Button(top, text="Abrir audio…", command=self.open_audio).pack(side="left", padx=3)
        self.play_btn = ttk.Button(top, text="▶ Reproducir", command=self.toggle_play)
        self.play_btn.pack(side="left", padx=3)
        ttk.Button(top, text="⟲ Reiniciar", command=self.restart).pack(side="left", padx=3)
        ttk.Button(top, text="💾 Guardar .lrc", command=self.save_lrc).pack(side="left", padx=3)

        ttk.Label(top, text="  [ti:]").pack(side="left")
        ttk.Entry(top, textvariable=self.ti_var, width=18).pack(side="left", padx=2)
        ttk.Label(top, text="[ar:]").pack(side="left")
        ttk.Entry(top, textvariable=self.ar_var, width=16).pack(side="left", padx=2)

        self.audio_lbl = ttk.Label(top, text="(sin audio)", foreground="#888")
        self.audio_lbl.pack(side="right", padx=6)

        # ====== Cuerpo: izquierda (letra) | derecha (indicadores + tabla) ======
        body = ttk.Frame(self)
        body.pack(side="top", fill="both", expand=True, **pad)

        # ---- Izquierda: letra ----
        left = ttk.Frame(body)
        left.pack(side="left", fill="both", expand=False)

        ttk.Label(left, text="Letra (una línea por verso · líneas en blanco = separador):").pack(anchor="w")
        self.text = tk.Text(left, width=42, height=28, wrap="word",
                            font=("Consolas", 11), undo=True)
        self.text.pack(side="left", fill="both", expand=True)
        tscroll = ttk.Scrollbar(left, command=self.text.yview)
        tscroll.pack(side="right", fill="y")
        self.text.config(yscrollcommand=tscroll.set)

        ttk.Button(left, text="↻ Aplicar letra (re-parsear, conserva marcas)",
                   command=self.apply_lyrics).pack(side="bottom", fill="x", pady=(4, 0))

        # ---- Derecha: indicadores + offset + tabla + Funcion B ----
        right = ttk.Frame(body)
        right.pack(side="left", fill="both", expand=True, padx=(10, 0))

        # Indicadores en vivo
        ind = ttk.LabelFrame(right, text="En vivo")
        ind.pack(side="top", fill="x")
        ttk.Label(ind, text="Tiempo actual:").grid(row=0, column=0, sticky="w", padx=6, pady=2)
        ttk.Label(ind, textvariable=self.cur_time_var, font=("Consolas", 20, "bold"),
                  foreground="#2a7").grid(row=0, column=1, sticky="w")
        ttk.Label(ind, text="Última marcada:").grid(row=1, column=0, sticky="w", padx=6)
        ttk.Label(ind, textvariable=self.last_marked_var, foreground="#888").grid(row=1, column=1, sticky="w")
        ttk.Label(ind, text="PRÓXIMA a marcar:").grid(row=2, column=0, sticky="w", padx=6, pady=(2, 6))
        ttk.Label(ind, textvariable=self.next_line_var, font=("Segoe UI", 13, "bold"),
                  foreground="#d36").grid(row=2, column=1, sticky="w", pady=(2, 6))

        # Offset global (Funcion A)
        off = ttk.LabelFrame(right, text="Función A — Offset global (s)  ·  marcas tarde → usa negativo")
        off.pack(side="top", fill="x", pady=(8, 0))
        self.off_scale = ttk.Scale(off, from_=-1.0, to=1.0, orient="horizontal",
                                   variable=self.offset_var, command=self._on_offset_scale)
        self.off_scale.pack(side="left", fill="x", expand=True, padx=6, pady=6)
        self.off_spin = tk.Spinbox(off, from_=-1.0, to=1.0, increment=0.05, width=7,
                                   textvariable=self.offset_var, command=self._on_offset_change,
                                   format="%.2f")
        self.off_spin.pack(side="left", padx=4)
        self.off_spin.bind("<Return>", lambda e: self._on_offset_change())
        self.off_spin.bind("<FocusOut>", lambda e: self._on_offset_change())
        ttk.Button(off, text="0", width=3, command=lambda: self._set_offset(0.0)).pack(side="left", padx=4)

        # Tabla de lineas (Funcion B)
        tbl_frame = ttk.LabelFrame(right, text="Función B — Líneas (selecciona para re-marcar / saltar / editar)")
        tbl_frame.pack(side="top", fill="both", expand=True, pady=(8, 0))

        cols = ("n", "marca", "final", "texto")
        self.tree = ttk.Treeview(tbl_frame, columns=cols, show="headings", selectmode="browse")
        self.tree.heading("n", text="#")
        self.tree.heading("marca", text="Marca")
        self.tree.heading("final", text="Final (±off)")
        self.tree.heading("texto", text="Texto")
        self.tree.column("n", width=40, anchor="e", stretch=False)
        self.tree.column("marca", width=85, anchor="center", stretch=False)
        self.tree.column("final", width=85, anchor="center", stretch=False)
        self.tree.column("texto", width=320, anchor="w")
        self.tree.pack(side="left", fill="both", expand=True)
        tbscroll = ttk.Scrollbar(tbl_frame, command=self.tree.yview)
        tbscroll.pack(side="right", fill="y")
        self.tree.config(yscrollcommand=tbscroll.set)
        self.tree.tag_configure("pending", background="#fff4f6")
        self.tree.tag_configure("next", background="#ffe0e8")
        self.tree.tag_configure("sep", foreground="#aaa")
        self.tree.tag_configure("remark", background="#fff2cc")
        self.tree.bind("<<TreeviewSelect>>", self._on_tree_select)

        # Controles Funcion B
        bctl = ttk.Frame(right)
        bctl.pack(side="top", fill="x", pady=(6, 0))
        ttk.Button(bctl, text="↩ Deshacer", command=self.do_undo).pack(side="left", padx=3)
        ttk.Button(bctl, text="🎯 Re-marcar", command=self.arm_remark).pack(side="left", padx=3)
        ttk.Button(bctl, text="⏮ Saltar a (−2s)", command=self.jump_to).pack(side="left", padx=3)
        ttk.Label(bctl, text="  Tiempo manual:").pack(side="left")
        self.time_entry = ttk.Entry(bctl, textvariable=self.time_edit_var, width=10)
        self.time_entry.pack(side="left", padx=2)
        ttk.Button(bctl, text="Aplicar tiempo", command=self.apply_manual_time).pack(side="left", padx=3)

        # Barra de estado
        ttk.Label(self, textvariable=self.status_var, relief="sunken", anchor="w",
                  foreground="#444").pack(side="bottom", fill="x")

    # --------------------------------------------------------- KEYBINDINGS ---
    def _bind_keys(self):
        # ESPACIO = marcar / BACKSPACE = deshacer  (solo mientras SUENA el audio).
        # Mientras NO suena, ambas teclas funcionan normal para editar la letra.
        # bind_all cubre foco en botones/tabla. Las instancias de campos de texto
        # se enlazan aparte: corren ANTES de la clase, asi 'break' evita que se
        # inserte/borre texto durante la sincronizacion.
        self.bind_all("<space>", self._on_space)
        self.bind_all("<BackSpace>", self._on_backspace)
        for w in (self.text, self.time_entry, self.off_spin):
            w.bind("<space>", self._on_space)
            w.bind("<BackSpace>", self._on_backspace)

    def _on_space(self, event):
        if self.is_playing:
            self.do_mark()
            return "break"   # no insertar espacio durante la sincronizacion
        return None          # tecleo normal cuando no se esta sincronizando

    def _on_backspace(self, event):
        if self.is_playing:
            self.do_undo()
            return "break"
        return None

    # =====================================================================
    #  AUDIO
    # =====================================================================
    def open_audio(self):
        path = filedialog.askopenfilename(
            title="Abrir audio",
            filetypes=[("Audio", "*.mp3 *.m4a *.wav"), ("MP3", "*.mp3"),
                       ("M4A / AAC", "*.m4a"), ("WAV", "*.wav"),
                       ("Todos", "*.*")])
        if not path:
            return
        self.player.stop()
        self.is_playing = False
        self.player.load(path)
        self.audio_lbl.config(text=os.path.basename(path), foreground="#2a7")
        self._update_play_btn()
        self.status_var.set("Audio cargado: {}".format(os.path.basename(path)))

    def toggle_play(self):
        if not self.player.path:
            self.status_var.set("Primero abre un audio.")
            return
        if self.is_playing:
            self.player.pause()
            self.is_playing = False
        else:
            self.player.play()
            self.is_playing = True
            self.play_btn.focus_set()  # quita el foco de la caja de texto
        self._update_play_btn()

    def _update_play_btn(self):
        self.play_btn.config(text="⏸ Pausa" if self.is_playing else "▶ Reproducir")

    def restart(self):
        """Borra TODAS las marcas y vuelve la cancion al inicio. Conserva letra y offset."""
        if self.lines and any(l.time is not None for l in self.lines):
            if not messagebox.askyesno("Reiniciar", "Esto borra todas las marcas. ¿Continuar?"):
                return
        for l in self.lines:
            l.time = None
        self.undo_stack.clear()
        self.remark_index = None
        self.pointer = self._first_pending()
        self.player.stop()
        self.is_playing = False
        self._update_play_btn()
        self.cur_time_var.set("--:--.--")
        self.last_marked_var.set("—")
        self._refresh_table()
        self._update_indicators()
        self.status_var.set("Reiniciado: marcas borradas, audio al inicio.")

    # =====================================================================
    #  LETRA  (parseo / re-parseo conservando marcas por POSICION)
    # =====================================================================
    def _parse_text_lines(self):
        raw = self.text.get("1.0", "end-1c")
        out = []
        for t in raw.split("\n"):
            if t.strip() == "":
                out.append(Line("", is_sep=True, time=None))
            else:
                out.append(Line(t.strip(), is_sep=False, time=None))
        return out

    def apply_lyrics(self):
        """Re-parsea la letra. Empareja por POSICION (indice) con el estado previo:
           - texto identico en esa posicion -> conserva su tiempo_marcado
           - texto cambiado / insertado / borrado -> queda pendiente (sin marca)
           Recoloca el puntero en la primera pendiente. Avisa N conservadas / M perdidas.
        """
        old = self.lines
        new = self._parse_text_lines()

        prev_marked = sum(1 for l in old if (not l.is_sep) and l.time is not None)
        kept = 0
        for i, nl in enumerate(new):
            if nl.is_sep:
                continue
            if i < len(old):
                ol = old[i]
                if (not ol.is_sep) and ol.text == nl.text and ol.time is not None:
                    nl.time = ol.time
                    kept += 1
        lost = prev_marked - kept

        self.lines = new
        self.undo_stack.clear()       # los indices cambiaron: invalidamos el undo
        self.remark_index = None
        self.pointer = self._first_pending()
        self._refresh_table()
        self._update_indicators()
        self.status_var.set("Letra aplicada · conservadas {} marcas, perdidas {}.".format(kept, lost))

    # =====================================================================
    #  MARCAR / DESHACER  (nucleo del tap-to-sync)
    # =====================================================================
    def _first_pending(self):
        return self._next_pending(0)

    def _next_pending(self, start):
        for i in range(start, len(self.lines)):
            l = self.lines[i]
            if (not l.is_sep) and l.time is None:
                return i
        return None

    def do_mark(self):
        """Asigna el tiempo REAL actual del audio. ESPACIO mientras suena."""
        if not self.is_playing:
            return
        t = self.player.get_time_seconds()
        if t is None:
            return

        # --- Modo B: re-marcar UNA sola linea, sin tocar el puntero general ---
        if self.remark_index is not None:
            idx = self.remark_index
            self.undo_stack.append((idx, self.lines[idx].time, self.pointer))
            self.lines[idx].time = t
            self.last_marked_var.set(self._line_label(idx))
            self.remark_index = None
            self._refresh_table()
            self._update_indicators()
            self.status_var.set("Re-marcada línea {} → {}".format(idx + 1, fmt_time(t)))
            return

        # --- Modo normal: marca secuencial y avanza el puntero ---
        p = self.pointer
        if p is None:
            self.status_var.set("No hay líneas pendientes.")
            return
        self.undo_stack.append((p, self.lines[p].time, p))
        self.lines[p].time = t
        self.last_marked_var.set(self._line_label(p))
        self.pointer = self._next_pending(p + 1)
        self._refresh_table()
        self._update_indicators()

    def do_undo(self):
        """Quita la ultima marca y retrocede el puntero. Repetible."""
        if not self.undo_stack:
            self.status_var.set("Nada que deshacer.")
            return
        idx, prev_time, prev_pointer = self.undo_stack.pop()
        if 0 <= idx < len(self.lines):
            self.lines[idx].time = prev_time
        self.pointer = prev_pointer
        # actualiza "ultima marcada" segun lo que quede en la pila
        if self.undo_stack:
            self.last_marked_var.set(self._line_label(self.undo_stack[-1][0]))
        else:
            self.last_marked_var.set("—")
        self._refresh_table()
        self._update_indicators()
        self.status_var.set("Deshecho. Marca en línea {} retirada.".format(idx + 1))

    # =====================================================================
    #  FUNCION A — OFFSET GLOBAL
    # =====================================================================
    def _final_time(self, t):
        """Tiempo exportado/previsualizado = marcado + offset, acotado a >= 0."""
        if t is None:
            return None
        return max(0.0, t + round(self.offset_var.get(), 2))

    def _set_offset(self, val):
        self.offset_var.set(round(val, 2))
        self._on_offset_change()

    def _on_offset_scale(self, _val):
        # el Scale es continuo; lo cuantizamos a pasos de 0.05
        q = round(self.offset_var.get() / 0.05) * 0.05
        if abs(q - self.offset_var.get()) > 1e-9:
            self.offset_var.set(round(q, 2))
        self._on_offset_change()

    def _on_offset_change(self):
        self._refresh_table()       # la columna "Final" muestra el efecto del offset
        self._update_indicators()

    # =====================================================================
    #  FUNCION B — RE-MARCAR / SALTAR / EDITAR
    # =====================================================================
    def _selected_index(self):
        sel = self.tree.selection()
        if not sel:
            return None
        try:
            return int(sel[0])
        except ValueError:
            return None

    def _on_tree_select(self, _e):
        idx = self._selected_index()
        if idx is None:
            return
        l = self.lines[idx]
        # precarga el campo de tiempo manual con la MARCA cruda
        self.time_edit_var.set(fmt_time(l.time) if l.time is not None else "")

    def arm_remark(self):
        idx = self._selected_index()
        if idx is None:
            self.status_var.set("Selecciona una línea en la tabla primero.")
            return
        if self.lines[idx].is_sep:
            self.status_var.set("Esa línea es un separador; no se marca.")
            return
        self.remark_index = idx
        self._refresh_table()
        self._update_indicators()
        self.status_var.set("MODO RE-MARCAR línea {}: reproduce y pulsa ESPACIO en el punto.".format(idx + 1))

    def jump_to(self):
        idx = self._selected_index()
        if idx is None:
            self.status_var.set("Selecciona una línea en la tabla primero.")
            return
        l = self.lines[idx]
        if l.is_sep:
            self.status_var.set("Esa línea es un separador.")
            return
        if l.time is None:
            self.status_var.set("Esa línea aún no tiene tiempo para saltar.")
            return
        if not self.player.path:
            return
        target = max(0.0, l.time - 2.0)
        # Para hacer seek hace falta que el media este activo:
        if not self.is_playing:
            self.player.play()
            self.is_playing = True
            self._update_play_btn()
        self.player.seek_seconds(target)
        self.play_btn.focus_set()
        self.status_var.set("Saltando a {} (línea {}).".format(fmt_time(target), idx + 1))

    def apply_manual_time(self):
        idx = self._selected_index()
        if idx is None:
            self.status_var.set("Selecciona una línea primero.")
            return
        if self.lines[idx].is_sep:
            self.status_var.set("Esa línea es un separador; no lleva tiempo.")
            return
        secs = parse_time(self.time_edit_var.get())
        if secs is None:
            self.status_var.set("Tiempo inválido. Usa mm:ss.xx (p.ej. 01:23.45) o segundos.")
            return
        self.lines[idx].time = secs
        # si estaba pendiente y ahora tiene tiempo, recolocamos el puntero
        self.pointer = self._first_pending() if self.pointer is None else self.pointer
        if self.pointer is not None and self.lines[self.pointer].time is not None:
            self.pointer = self._next_pending(self.pointer)
        self._refresh_table()
        self._update_indicators()
        self.status_var.set("Línea {} fijada a {}.".format(idx + 1, fmt_time(secs)))

    # =====================================================================
    #  RENDER  (tabla + indicadores + bucle)
    # =====================================================================
    def _line_label(self, idx):
        if idx is None or not (0 <= idx < len(self.lines)):
            return "—"
        t = self.lines[idx].text
        return (t[:48] + "…") if len(t) > 49 else t

    def _refresh_table(self):
        # reconstruccion completa: simple y siempre consistente
        self.tree.delete(*self.tree.get_children())
        for i, l in enumerate(self.lines):
            if l.is_sep:
                self.tree.insert("", "end", iid=str(i),
                                 values=(i + 1, "", "", "· · · (separador)"),
                                 tags=("sep",))
                continue
            marca = fmt_time(l.time) if l.time is not None else "—"
            final = fmt_time(self._final_time(l.time)) if l.time is not None else "—"
            tags = []
            if i == self.remark_index:
                tags.append("remark")
            elif i == self.pointer:
                tags.append("next")
            elif l.time is None:
                tags.append("pending")
            txt = (l.text[:60] + "…") if len(l.text) > 61 else l.text
            self.tree.insert("", "end", iid=str(i),
                             values=(i + 1, marca, final, txt), tags=tuple(tags))

    def _update_indicators(self):
        if self.remark_index is not None:
            self.next_line_var.set("🎯 RE-MARCAR: " + self._line_label(self.remark_index))
        elif self.pointer is not None:
            self.next_line_var.set(self._line_label(self.pointer))
            # mantener visible la proxima en la tabla
            try:
                self.tree.see(str(self.pointer))
            except tk.TclError:
                pass
        else:
            done = self.lines and all(l.is_sep or l.time is not None for l in self.lines)
            self.next_line_var.set("✓ Todas marcadas" if done else "—")

    def _tick(self):
        if self.is_playing:
            if self.player.is_ended():
                self.is_playing = False
                self._update_play_btn()
            else:
                t = self.player.get_time_seconds()
                if t is not None:
                    self.cur_time_var.set(fmt_time(t))
        self.after(self.REFRESH_MS, self._tick)

    # =====================================================================
    #  EXPORTAR  .lrc
    # =====================================================================
    def save_lrc(self):
        if not self.lines:
            self.status_var.set("No hay letra para exportar. Pulsa 'Aplicar letra'.")
            return
        # nombre = mismo del audio con extension .lrc
        if self.player.path:
            base = os.path.splitext(self.player.path)[0] + ".lrc"
        else:
            base = "canto.lrc"

        path = filedialog.asksaveasfilename(
            title="Guardar .lrc",
            defaultextension=".lrc",
            initialfile=os.path.basename(base),
            initialdir=os.path.dirname(base) if self.player.path else None,
            filetypes=[("LRC", "*.lrc")])
        if not path:
            return

        out = []
        ti = self.ti_var.get().strip()
        ar = self.ar_var.get().strip()
        if ti:
            out.append("[ti:{}]".format(ti))
        if ar:
            out.append("[ar:{}]".format(ar))

        # Karaoke: [mm:ss.xx] Texto  (offset ya aplicado).
        # Lineas en blanco de la letra -> linea vacia (separador de estrofa).
        # TODO: segundo "tap-track" para [cut:N] de imagenes. El modelo de marcas
        #       (Line.time + pointer + undo) es reutilizable: bastaria una segunda
        #       lista de tiempos y exportar etiquetas [cut:N] intercaladas aqui.
        for l in self.lines:
            if l.is_sep:
                out.append("")
            elif l.time is not None:
                ft = self._final_time(l.time)
                out.append("[{}] {}".format(fmt_time(ft), l.text))
            else:
                # verso sin marcar: lo dejamos sin tiempo para no perder el texto
                out.append(l.text)

        try:
            with open(path, "w", encoding="utf-8") as f:
                f.write("\n".join(out) + "\n")
        except OSError as e:
            messagebox.showerror("Error al guardar", str(e))
            return

        n_marked = sum(1 for l in self.lines if (not l.is_sep) and l.time is not None)
        n_pending = sum(1 for l in self.lines if (not l.is_sep) and l.time is None)
        self.status_var.set("Guardado: {}  ({} versos con tiempo, {} sin marcar).".format(
            os.path.basename(path), n_marked, n_pending))


# =============================================================================
if __name__ == "__main__":
    App().mainloop()
