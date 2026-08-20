/* AUDITORÍA — pegar en la consola del navegador con sesión iniciada en cruzando.app
   (o en diario.html, que ya tiene `db` y la sesión resuelta).
   Es SOLO LECTURA: cuenta, no escribe ni borra nada. */
(async () => {
  const uid = (window.auth?.currentUser || window._auth?.currentUser || firebase.auth().currentUser)?.uid;
  if (!uid) { console.error('Sin sesión iniciada.'); return; }
  const _db = window.db || firebase.firestore();

  const leer = async (col) => (await _db.collection('users').doc(uid).collection(col).get()).docs;

  const refs   = await leer('reflections');
  const diario = await leer('diario');

  const sinFecha = (ds, campo) => ds.filter(d => {
    const v = d.data()[campo];
    return v === undefined || v === null;
  });

  // Formato antiguo de audio.html: un solo doc por Misterio con q0/q1/q2
  const legacy = refs.filter(d => {
    const x = d.data();
    return x.text === undefined && (x.q0 !== undefined || x.q1 !== undefined || x.q2 !== undefined);
  });

  const rSin = sinFecha(refs, 'confirmedAt');
  const dSin = sinFecha(diario, 'fecha');

  console.log('%c── AUDITORÍA DE FECHAS ──', 'font-weight:bold');
  console.table([
    { coleccion: 'reflections', total: refs.length,   sinCampoFecha: rSin.length, campo: 'confirmedAt' },
    { coleccion: 'diario',      total: diario.length, sinCampoFecha: dSin.length, campo: 'fecha' }
  ]);
  console.log('Formato ANTIGUO de audio (q0/q1/q2, sin `text`):', legacy.length);
  if (rSin.length)   console.log('  ids sin confirmedAt:', rSin.map(d => d.id));
  if (dSin.length)   console.log('  ids sin fecha:',       dSin.map(d => d.id));
  if (legacy.length) console.log('  ids en formato antiguo:', legacy.map(d => d.id));

  const problemas = rSin.length + dSin.length;
  console.log(problemas
    ? `%c⚠ ${problemas} documento(s) desaparecerían con orderBy — hay que rellenarlos antes de paginar.`
    : '%c✓ Todos tienen fecha: la paginación puede usar orderBy sin perder nada.',
    'font-weight:bold');
})();
