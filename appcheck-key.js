// ═══════════════════════════════════════════════════════════════════
// CruzAndo — clave de sitio de reCAPTCHA v3 para Firebase App Check
// ═══════════════════════════════════════════════════════════════════
//
// UN SOLO LUGAR para la clave. Todas las páginas que arrancan Firebase
// (modulares y compat) leen window.RECAPTCHA_SITE_KEY de aquí.
//
// Mientras esté vacía, App Check NO se inicializa en ninguna página:
// el guardia `if (!key) return;` de cada página lo deja en no-op. Eso
// permite desplegar este código ANTES de registrar la clave sin tocar
// nada del funcionamiento actual.
//
// Para encenderlo: registra el sitio en la consola de Firebase
// (App Check → Apps → Web → reCAPTCHA v3, dominio cruzando.app),
// pega aquí la CLAVE DE SITIO (la pública, no la secreta) y despliega.
// El bloqueo (enforcement) se activa aparte, desde la consola.
//
// Es pública por diseño — va en el HTML del cliente. La clave SECRETA
// se pega solo en la consola de Firebase y nunca vive en este repo.
window.RECAPTCHA_SITE_KEY = '6LdXM5ItAAAAANuekuAJC7kEHanJWm96NjY4raSq';
