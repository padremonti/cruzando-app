// rezar_taller.js — Modal de oración · CruzAndo
(function () {
  'use strict';

  var params = new URLSearchParams(location.search);
  var nombre = params.get('nombre') || 'Oración';
  var texto  = params.get('texto')  || '';
  var audio  = params.get('audio')  || '';

  // Poblar HTML
  var elNombre = document.getElementById('oracion-nombre');
  var elTexto  = document.getElementById('oracion-texto');
  if (elNombre) elNombre.textContent = nombre;
  if (elTexto)  elTexto.textContent  = texto;

  // ── Audio ─────────────────────────────────────────

  var _audio         = null;
  var _reproduciendo = false;

  if (audio) {
    _audio = new Audio(audio);

    _audio.addEventListener('timeupdate', function () {
      if (!_audio.duration) return;
      var pct  = (_audio.currentTime / _audio.duration) * 100;
      var fill = document.getElementById('oracion-progreso-fill');
      if (fill) fill.style.width = pct + '%';
    });

    _audio.addEventListener('ended', function () {
      _reproduciendo = false;
      _actualizarBoton(false);
    });
  }

  function _actualizarBoton(reprod) {
    var btn = document.getElementById('btn-audio-oracion');
    if (btn) btn.textContent = reprod ? '⏸' : '▶';
  }

  window.toggleAudioOracion = function () {
    if (!_audio) return;
    if (_reproduciendo) {
      _audio.pause();
      _reproduciendo = false;
      _actualizarBoton(false);
    } else {
      _audio.play()
        .then(function () {
          _reproduciendo = true;
          _actualizarBoton(true);
        })
        .catch(function (e) {
          console.warn('[Oración] Audio no disponible:', e);
        });
    }
  };

  window.seekAudio = function (event) {
    if (!_audio || !_audio.duration) return;
    var barra = event.currentTarget;
    var rect  = barra.getBoundingClientRect();
    var pct   = (event.clientX - rect.left) / rect.width;
    _audio.currentTime = pct * _audio.duration;
  };

  // ── Completar ──────────────────────────────────────

  window.completarOracion = function () {
    if (_audio) { _audio.pause(); _audio.currentTime = 0; }

    if (window.opener && !window.opener.closed) {
      window.opener.postMessage({ tipo: 'oracion_completada' }, location.origin);
      window.close();
    } else {
      history.back();
    }
  };

})();
