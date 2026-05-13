/**
 * Inicialización de Firebase Admin SDK.
 *
 * Orden de carga de credenciales:
 *   1. Variable de entorno FIREBASE_SERVICE_ACCOUNT (JSON en base64) → Railway/Render
 *   2. Archivo local serviceAccountKey.json → desarrollo local
 */

const admin = require('firebase-admin');

let db = null;

try {
    let credential;

    if (process.env.FIREBASE_SERVICE_ACCOUNT) {
        // 1) Variable de entorno: JSON del service account en base64
        const json = Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT, 'base64').toString('utf8');
        const serviceAccount = JSON.parse(json);
        credential = admin.credential.cert(serviceAccount);
    } else {
        // 2) Archivo local (desarrollo)
        const serviceAccount = require('./serviceAccountKey.json');
        credential = admin.credential.cert(serviceAccount);
    }

    admin.initializeApp({ credential });
    db = admin.firestore();
    db.settings({ ignoreUndefinedProperties: true });
    console.log('[Firebase] ✓ Firestore conectado');
} catch (e) {
    console.warn(
        '[Firebase] Firestore no disponible.',
        '\n  Detalle:', e.message
    );
}

module.exports = { db };
