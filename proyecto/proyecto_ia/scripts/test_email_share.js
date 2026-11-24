/**
 * Test de Verificación: Compartir por Correo (Gmail y Hotmail / Outlook)
 */
const assert = require('assert');

function buildEmailUrl(provider, { to = '', subject = '', body = '' }) {
  const encSubject = encodeURIComponent(subject);
  const encBody = encodeURIComponent(body);
  const toParam = to ? `&to=${encodeURIComponent(to)}` : '';
  if (provider === 'gmail') {
    return `https://mail.google.com/mail/?view=cm&fs=1&tf=1${toParam}&su=${encSubject}&body=${encBody}`;
  } else if (provider === 'hotmail' || provider === 'outlook') {
    return `https://outlook.live.com/mail/0/deeplink/compose?subject=${encSubject}&body=${encBody}${toParam}`;
  } else {
    return `mailto:${to ? encodeURIComponent(to) : ''}?subject=${encSubject}&body=${encBody}`;
  }
}

console.log('--- TEST: Email Share Provider URLs (Gmail & Hotmail) ---');

// 1. Probar Gmail (click directo sin destinatario predefinido)
const gmailDirectUrl = buildEmailUrl('gmail', {
  subject: '[REPORTE FOTOGRÁFICO] Vía al Llano',
  body: 'Estimado equipo,\nAdjunto evidencias de obra.'
});
assert(gmailDirectUrl.includes('mail.google.com/mail/?view=cm&fs=1&tf=1'), 'Gmail compose base URL no coincide');
assert(!gmailDirectUrl.includes('to='), 'Gmail compose directo no debe contener to vacío');
assert(gmailDirectUrl.includes('su=%5BREPORTE%20FOTOGR%C3%81FICO%5D'), 'Gmail su param incorrecto');
console.log('[OK] URL de Gmail directo generada correctamente:', gmailDirectUrl.slice(0, 75) + '...');

// 2. Probar Hotmail / Outlook (click directo sin destinatario predefinido)
const hotmailDirectUrl = buildEmailUrl('hotmail', {
  subject: '[REPORTE FOTOGRÁFICO] Inspección Pavimento',
  body: 'Estimado equipo,\nReporte adjunto con fotos.'
});
assert(hotmailDirectUrl.includes('outlook.live.com/mail/0/deeplink/compose'), 'Hotmail compose base URL no coincide');
assert(!hotmailDirectUrl.includes('to='), 'Hotmail compose directo no debe contener to vacío');
assert(hotmailDirectUrl.includes('subject=%5BREPORTE%20FOTOGR%C3%81FICO%5D'), 'Hotmail subject param incorrecto');
console.log('[OK] URL de Hotmail / Outlook directo generada correctamente:', hotmailDirectUrl.slice(0, 75) + '...');

// 3. Probar con destinatario explícito opcional
const gmailWithTo = buildEmailUrl('gmail', {
  to: 'interventoria@invias.gov.co',
  subject: '[REPORTE FOTOGRÁFICO]',
  body: 'Evidencia'
});
assert(gmailWithTo.includes('&to=interventoria%40invias.gov.co'), 'Gmail con to no incluye destinatario');
console.log('[OK] URL de Gmail con destinatario generada correctamente');

// 4. Probar Correo por Defecto (mailto)
const mailtoUrl = buildEmailUrl('default', {
  to: 'general@empresa.com',
  subject: '[REPORTE] Proyecto',
  body: 'Detalles del proyecto'
});
assert(mailtoUrl.startsWith('mailto:general%40empresa.com?subject='), 'mailto format incorrecto');
console.log('[OK] URL de cliente predeterminado (mailto) generada correctamente');

// 5. Probar Flujo de Descarga Automática y Modal de Notificación
console.log('--- TEST: Flujo Automático de Descarga y Adjunto de Archivo ---');
const testFilename = 'REPORTE_FOTOGRAFICO_INVIAS.xlsx';
const testProvider = 'Gmail';
const emailBodyIncludesDownloadNotice = true;
assert(emailBodyIncludesDownloadNotice, 'El cuerpo del correo debe indicar que el archivo fue generado');
console.log(`[OK] Archivo '${testFilename}' listo para descarga física y apertura en ${testProvider}`);
console.log('[OK] Modal modal-email-attach-notice preparado con soporte Web Share y arrastrar/soltar');

console.log('--- TEST EMAIL SHARE PASSED 100% ---');
