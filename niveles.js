// ═══════════════════════════════════════════════════════════════════
// CruzAndo — el itinerario: orden, estado y nombre de los 28 cuadernos
// ═══════════════════════════════════════════════════════════════════
//
// UN SOLO LUGAR para las tres tablas que describen el camino. Estaban
// declaradas dentro de las páginas —`NIVELES_ORDER` y `NIVEL_STATUS` en
// index y crecer; `NIVEL_NAMES` además en audio y diario— y `audio.html`
// LEÍA las dos primeras sin que nadie se las diera:
//
//   const _NORDER = window.NIVELES_ORDER || [];   // → []
//   const _idx    = _NORDER.indexOf(curNivelId);  // → -1
//   for (let i = _idx + 1; i < _NORDER.length; i++)  // no entra nunca
//
// Efecto real: un usuario free que terminaba el Misterio 20 de su cuaderno
// se quedaba en el mismo cuaderno, porque el bucle que busca el siguiente
// nivel publicado no encontraba ninguno.
//
// Se carga como script síncrono, antes de quien las use.
(function () {
  'use strict';

  // Orden del itinerario: 7 Mundos x 4 cuadernos.
  var ORDEN = [
    '0101','0102','0103','0104',
    '0201','0202','0203','0204',
    '0301','0302','0303','0304',
    '0401','0402','0403','0404',
    '0501','0502','0503','0504',
    '0601','0602','0603','0604',
    '0701','0702','0703','0704'
  ];

  /* Estado de publicación. 'published' = tiene textos Y audio; 'dev' = los
     textos están en data/{nivelId}.json pero falta el audio en R2; 'empty' =
     ni lo uno ni lo otro. El developer entra a todos (ver § El developer
     recorre lo que su progreso desbloqueó, en CLAUDE.md). */
  var ESTADO = {
    '0101':'published','0102':'published','0103':'published','0104':'published',
    '0201':'dev','0202':'dev','0203':'dev','0204':'dev',
    '0301':'dev','0302':'dev','0303':'dev','0304':'dev',
    '0401':'dev','0402':'dev','0403':'dev','0404':'dev',
    '0501':'dev','0502':'dev','0503':'dev','0504':'dev',
    '0601':'dev','0602':'dev','0603':'dev','0604':'dev',
    '0701':'dev','0702':'empty','0703':'empty','0704':'empty'
  };

  /* El nombre corto de cada cuaderno. El selector de crecer parte por ': '
     para sacar el subtítulo, así que el formato importa.

     ⚠️ extras.html conserva SU PROPIA tabla, con otro formato ('Cruz · Males')
     y con subtítulos para los Mundos 2-7 que esta no tiene. Es una diferencia
     de contenido, no una copia desviada: unificarlas es decisión de producto. */
  var NOMBRES = {
    '0101':'Cruz 1-1: Males',      '0102':'Cruz 1-2: Pecado',
    '0103':'Cruz 1-3: Conversión', '0104':'Cruz 1-4: Gracia',
    '0201':'Emociones 2-1',        '0202':'Emociones 2-2',
    '0203':'Emociones 2-3',        '0204':'Emociones 2-4',
    '0301':'Mente 3-1',            '0302':'Mente 3-2',
    '0303':'Mente 3-3',            '0304':'Mente 3-4',
    '0401':'Corazón 4-1',          '0402':'Corazón 4-2',
    '0403':'Corazón 4-3',          '0404':'Corazón 4-4',
    '0501':'Relaciones 5-1',       '0502':'Relaciones 5-2',
    '0503':'Relaciones 5-3',       '0504':'Relaciones 5-4',
    '0601':'Amor 6-1',             '0602':'Amor 6-2',
    '0603':'Amor 6-3',             '0604':'Amor 6-4',
    '0701':'Tiempo 7-1',           '0702':'Tiempo 7-2',
    '0703':'Tiempo 7-3',           '0704':'Tiempo 7-4'
  };

  function publicado(id) { return ESTADO[id] === 'published'; }

  /* El siguiente cuaderno publicado después de `id`. Devuelve null si no hay
     ninguno — que hoy es el caso al terminar 0104, porque los Mundos 2 a 7
     están en 'dev'. Quien llame tiene que decidir qué hacer con ese null en
     vez de dejar al usuario clavado en el mismo cuaderno. */
  function siguientePublicado(id) {
    var i = ORDEN.indexOf(id);
    if (i === -1) return null;
    for (var k = i + 1; k < ORDEN.length; k++) {
      if (publicado(ORDEN[k])) return ORDEN[k];
    }
    return null;
  }

  function nombre(id) { return NOMBRES[id] || ('Nivel ' + id); }

  window.NIVELES_ORDER = ORDEN;
  window.NIVEL_STATUS  = ESTADO;
  window.NIVEL_NAMES   = NOMBRES;
  window.Niveles = {
    ORDEN:              ORDEN,
    ESTADO:             ESTADO,
    NOMBRES:            NOMBRES,
    publicado:          publicado,
    siguientePublicado: siguientePublicado,
    nombre:             nombre
  };
}());
