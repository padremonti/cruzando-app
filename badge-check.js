// ══════════════════════════════════════════════════════════════════
//  badge-check.js  ·  CruzAndo — Cloud Function
//  Detecta umbrales de metros y escribe badges automáticamente.
//
//  Desplegar:
//    firebase deploy --only functions
//
//  Requiere:
//    npm install firebase-admin firebase-functions
// ══════════════════════════════════════════════════════════════════

const functions = require('firebase-functions');
const admin     = require('firebase-admin');

admin.initializeApp();
const db = admin.firestore();

// ── Catálogo de badges por metros ────────────────────────────────
// Estos badges deben existir en la colección /badges del Firestore.
// Aquí solo se usan los IDs y umbrales para la comparación.

const METRO_BADGES = [
  { badgeId: 'badge_01', threshold:   2000 },  // Primeros pasos
  { badgeId: 'badge_02', threshold:   5000 },  // Camino abierto
  { badgeId: 'badge_03', threshold:  12000 },  // Peregrino de la Cruz
  { badgeId: 'badge_04', threshold:  25000 },  // Mitad del camino
  { badgeId: 'badge_05', threshold:  50000 },  // Mundo completado
  { badgeId: 'badge_06', threshold: 100000 },  // Peregrino constante
  { badgeId: 'badge_07', threshold: 200000 },  // Corazón en camino
  { badgeId: 'badge_08', threshold: 400000 },  // Peregrino mayor
];

// ── Trigger: onWrite en gamification/stats ────────────────────────
exports.checkBadgesOnStatsWrite = functions.firestore
  .document('users/{uid}/gamification/stats')
  .onWrite(async (change, context) => {
    const uid     = context.params.uid;
    const after   = change.after.exists ? change.after.data() : null;
    const before  = change.before.exists ? change.before.data() : null;

    if (!after) return null;

    const metrosAfter  = after.totalMetros  || 0;
    const metrosBefore = (before && before.totalMetros) || 0;

    // Si los metros no cambiaron, nada que hacer
    if (metrosAfter <= metrosBefore) return null;

    // Revisar qué badges de metros se cruzan con este cambio
    const newBadges = [];
    for (const badge of METRO_BADGES) {
      if (metrosBefore < badge.threshold && metrosAfter >= badge.threshold) {
        // Checar si el usuario ya tiene este badge
        const badgeRef  = db.doc(`users/${uid}/badges/${badge.badgeId}`);
        const badgeSnap = await badgeRef.get();
        if (!badgeSnap.exists) {
          newBadges.push(badge.badgeId);
        }
      }
    }

    if (!newBadges.length) return null;

    // Escribir badges y actualizar badgesPending en un batch
    const batch = db.batch();

    for (const badgeId of newBadges) {
      const ref = db.doc(`users/${uid}/badges/${badgeId}`);
      batch.set(ref, {
        badgeId,
        unlockedAt: admin.firestore.FieldValue.serverTimestamp(),
        seen:       false
      });
    }

    // Añadir a badgesPending (arrayUnion para no sobreescribir otros pendientes)
    const statsRef = db.doc(`users/${uid}/gamification/stats`);
    batch.update(statsRef, {
      badgesPending: admin.firestore.FieldValue.arrayUnion(...newBadges)
    });

    await batch.commit();

    console.log(`[badges] Usuario ${uid}: nuevos badges ${newBadges.join(', ')}`);
    return null;
  });

// ── Trigger: onWrite en progress/{nivelId} ────────────────────────
// Detecta nivel completado y otorga badge correspondiente.

exports.checkBadgesOnLevelComplete = functions.firestore
  .document('users/{uid}/progress/{nivelId}')
  .onWrite(async (change, context) => {
    const uid     = context.params.uid;
    const nivelId = context.params.nivelId;
    const after   = change.after.exists ? change.after.data() : null;

    if (!after) return null;

    // Checar si el nivel está completo (los 4 bloques con 5 misterios cada uno)
    const BLOQUES = ['gozosos','luminosos','dolorosos','gloriosos'];
    const prog    = after.progress || {};
    const allDone = BLOQUES.every(b => {
      const arr = prog[b];
      return Array.isArray(arr) && arr.length === 5 && arr.every(v => v !== null);
    });

    if (!allDone) return null;

    // Badge por nivel completado: ID convenio "nivel_XXXX"
    const badgeId   = 'nivel_' + nivelId;
    const badgeRef  = db.doc(`users/${uid}/badges/${badgeId}`);
    const badgeSnap = await badgeRef.get();
    if (badgeSnap.exists) return null;  // ya tiene el badge

    // Checar que el badge existe en el catálogo
    const catalogSnap = await db.doc(`badges/${badgeId}`).get();
    if (!catalogSnap.exists) return null;  // no hay badge definido para este nivel

    const batch = db.batch();
    batch.set(badgeRef, {
      badgeId,
      unlockedAt: admin.firestore.FieldValue.serverTimestamp(),
      seen:       false
    });

    const statsRef = db.doc(`users/${uid}/gamification/stats`);
    batch.update(statsRef, {
      nivelesCompletados: admin.firestore.FieldValue.arrayUnion(nivelId),
      badgesPending:      admin.firestore.FieldValue.arrayUnion(badgeId)
    });

    await batch.commit();
    console.log(`[badges] Usuario ${uid}: nivel ${nivelId} completado, badge ${badgeId} otorgado.`);
    return null;
  });
