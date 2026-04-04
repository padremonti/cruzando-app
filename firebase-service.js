// ══════════════════════════════════════════════════════════════════
//  firebase-service.js  ·  CruzAndo App
//  Capa de persistencia: Firebase Auth + Firestore
//  Reemplaza el localStorage como almacén principal.
//  localStorage se mantiene como caché offline / fallback.
// ══════════════════════════════════════════════════════════════════

// ── 1. CONFIGURACIÓN ─────────────────────────────────────────────
//  Sustituye estos valores con los de tu proyecto en Firebase Console
//  (Project Settings → Your apps → SDK setup and configuration)

const FIREBASE_CONFIG = {
    apiKey: "AIzaSyCYCZi1LmFuqIis9yx3QF3McvGHlAGKRKY",
    authDomain: "cruzando-app.firebaseapp.com",
    projectId: "cruzando-app",
    storageBucket: "cruzando-app.firebasestorage.app",
    messagingSenderId: "408196948528",
    appId: "1:408196948528:web:de291e8afc969252e943f5"
};

// ── 2. INICIALIZACIÓN ─────────────────────────────────────────────

import { initializeApp }          from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import { getAuth,
         onAuthStateChanged,
         signInWithPopup,
         signInWithEmailAndPassword,
         createUserWithEmailAndPassword,
         signOut,
         GoogleAuthProvider }      from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';
import { getFirestore,
         doc, getDoc, setDoc,
         updateDoc, collection,
         getDocs, serverTimestamp,
         writeBatch }              from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

const app  = initializeApp(FIREBASE_CONFIG);
const auth = getAuth(app);
const db   = getFirestore(app);

// ── 3. ESTADO DEL SERVICIO ────────────────────────────────────────

let _currentUser = null;
let _onUserChange = null;

// ── 4. AUTENTICACIÓN ──────────────────────────────────────────────

export function onUserChange(callback) {
  _onUserChange = callback;
  onAuthStateChanged(auth, async (user) => {
    _currentUser = user;
    if (callback) callback(user);
  });
}

export function currentUser() {
  return _currentUser;
}

export async function loginWithGoogle() {
  const provider = new GoogleAuthProvider();
  const result   = await signInWithPopup(auth, provider);
  await _ensureUserDoc(result.user);
  return result.user;
}

export async function loginWithEmail(email, password) {
  const result = await signInWithEmailAndPassword(auth, email, password);
  await _ensureUserDoc(result.user);
  return result.user;
}

export async function registerWithEmail(email, password, displayName) {
  const result = await createUserWithEmailAndPassword(auth, email, password);
  await _ensureUserDoc(result.user, displayName);
  return result.user;
}

export async function logout() {
  await signOut(auth);
}

async function _ensureUserDoc(user, displayName) {
  const ref  = doc(db, 'users', user.uid);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    await setDoc(ref, {
      email:       user.email,
      displayName: displayName || user.displayName || '',
      photoURL:    user.photoURL || '',
      createdAt:   serverTimestamp(),
      plan:        'beta'
    });
    await setDoc(
      doc(db, 'users', user.uid, 'gamification', 'stats'),
      {
        totalMetros:        0,
        nivelesCompletados: [],
        bloquesCompletados: {},
        rewardsClaimed:     {},
        badgesPending:      [],
        lastActiveAt:       serverTimestamp()
      }
    );
  }
}

// ── 5. PROGRESO POR NIVEL ─────────────────────────────────────────

export async function loadProgressFromFirestore(nivelId) {
  if (!_currentUser) return null;
  try {
    const ref  = doc(db, 'users', _currentUser.uid, 'progress', nivelId);
    const snap = await getDoc(ref);
    if (!snap.exists()) return null;
    return snap.data();
  } catch(e) {
    console.warn('[CruzAndo] loadProgressFromFirestore error:', e);
    return null;
  }
}

export async function saveProgressToFirestore(nivelId, data) {
  if (!_currentUser) return;
  try {
    const batch = writeBatch(db);

    const progressRef = doc(db, 'users', _currentUser.uid, 'progress', nivelId);
    batch.set(progressRef, {
      nivelId,
      progress:          data.progress          || {},
      medConfirmed:      data.medConfirmed       || {},
      reflectionRewards: data.reflectionRewards  || {},
      audioRewards:      data.audioRewards       || {},
      totalMetros:       data.totalMeters        || 0,
      updatedAt:         serverTimestamp()
    }, { merge: true });

    const statsRef = doc(db, 'users', _currentUser.uid, 'gamification', 'stats');
    batch.set(statsRef, {
      lastActiveAt: serverTimestamp()
    }, { merge: true });

    await batch.commit();
  } catch(e) {
    console.warn('[CruzAndo] saveProgressToFirestore error:', e);
  }
}

// ── 6. REFLEXIONES ────────────────────────────────────────────────

export async function saveReflection(nivelId, bloque, misterioIdx, questionIdx, text) {
  if (!_currentUser || !text.trim()) return;
  try {
    const docId = nivelId + '_' + bloque + '_' + misterioIdx + '_q' + questionIdx;
    const ref   = doc(db, 'users', _currentUser.uid, 'reflections', docId);
    await setDoc(ref, {
      nivelId,
      bloque,
      misterioIdx,
      questionIdx,
      text,
      confirmedAt: serverTimestamp()
    }, { merge: true });
  } catch(e) {
    console.warn('[CruzAndo] saveReflection error:', e);
  }
}

export async function loadReflectionsForNivel(nivelId) {
  if (!_currentUser) return {};
  try {
    const colRef = collection(db, 'users', _currentUser.uid, 'reflections');
    const snap   = await getDocs(colRef);
    const journal = {};
    snap.forEach(d => {
      const r = d.data();
      if (r.nivelId !== nivelId) return;
      if (!journal[r.bloque]) journal[r.bloque] = {};
      if (!journal[r.bloque][r.misterioIdx]) journal[r.bloque][r.misterioIdx] = {};
      journal[r.bloque][r.misterioIdx]['q' + r.questionIdx] = r.text;
    });
    return journal;
  } catch(e) {
    console.warn('[CruzAndo] loadReflectionsForNivel error:', e);
    return {};
  }
}

// ── 7. MIGRACIÓN DESDE LOCALSTORAGE ───────────────────────────────

export async function migrateFromLocalStorage(nivelIds) {
  if (!_currentUser) return;

  const userRef  = doc(db, 'users', _currentUser.uid);
  const userSnap = await getDoc(userRef);
  if (userSnap.data()?.lsMigrated) return;

  let migrated = 0;
  const BLOQUES = ['gozosos','luminosos','dolorosos','gloriosos'];

  for (const nivelId of nivelIds) {
    const key = 'cruzando_nivel_' + nivelId;
    const raw = localStorage.getItem(key);
    if (!raw) continue;
    try {
      const data = JSON.parse(raw);
      await saveProgressToFirestore(nivelId, data);

      for (const bloque of BLOQUES) {
        const bloqueJournal = (data.journal && data.journal[bloque]) ? data.journal[bloque] : {};
        for (const miIdx of Object.keys(bloqueJournal)) {
          const misterio = bloqueJournal[miIdx];
          for (let qi = 0; qi <= 2; qi++) {
            const text = misterio ? misterio['q' + qi] : null;
            if (text) {
              await saveReflection(nivelId, bloque, parseInt(miIdx), qi, text);
            }
          }
        }
      }
      migrated++;
    } catch(e) {
      console.warn('[CruzAndo] Error migrando nivel', nivelId, e);
    }
  }

  await updateDoc(userRef, { lsMigrated: true, lsMigratedAt: serverTimestamp() });
  if (migrated > 0) {
    console.log('[CruzAndo] Migracion completada: ' + migrated + ' nivel(es) subidos a Firestore.');
  }
}

// ── 8. BADGES ─────────────────────────────────────────────────────

export async function getUserBadges() {
  if (!_currentUser) return [];
  try {
    const userBadgesSnap = await getDocs(
      collection(db, 'users', _currentUser.uid, 'badges')
    );
    const results = [];
    for (const d of userBadgesSnap.docs) {
      const userData    = d.data();
      const catalogSnap = await getDoc(doc(db, 'badges', d.id));
      const catalogData = catalogSnap.exists() ? catalogSnap.data() : {};
      results.push(Object.assign({ badgeId: d.id }, catalogData, userData));
    }
    return results.sort(function(a,b){ return (a.order||0)-(b.order||0); });
  } catch(e) {
    console.warn('[CruzAndo] getUserBadges error:', e);
    return [];
  }
}

export async function markBadgesAsSeen() {
  if (!_currentUser) return;
  try {
    const statsRef = doc(db, 'users', _currentUser.uid, 'gamification', 'stats');
    const snap     = await getDoc(statsRef);
    const pending  = (snap.data() && snap.data().badgesPending) ? snap.data().badgesPending : [];
    if (!pending.length) return;

    const batch = writeBatch(db);
    batch.update(statsRef, { badgesPending: [] });
    for (const badgeId of pending) {
      const ref = doc(db, 'users', _currentUser.uid, 'badges', badgeId);
      batch.set(ref, { seen: true }, { merge: true });
    }
    await batch.commit();
  } catch(e) {
    console.warn('[CruzAndo] markBadgesAsSeen error:', e);
  }
}

export async function getPendingBadges() {
  if (!_currentUser) return [];
  try {
    const snap = await getDoc(
      doc(db, 'users', _currentUser.uid, 'gamification', 'stats')
    );
    return (snap.data() && snap.data().badgesPending) ? snap.data().badgesPending : [];
  } catch(e) {
    return [];
  }
}
