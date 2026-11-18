// Offline preview only: no credentials, API requests, tokens or mail delivery.
const fs = require('node:fs');
const path = require('node:path');
const { buildVerificationEmail } = require('../emails/verificationEmail');

const email = buildVerificationEmail({
  link: 'https://swipenest.example/verify-email#token=preview-only'
});
let html = email.html;
for (const image of email.inlineAttachments) {
  html = html.replaceAll(`cid:${image.contentId}`,
    `data:${image.contentType};base64,${image.content.toString('base64')}`);
}
const destination = path.resolve(process.argv[2]
  || path.join(__dirname, '../../output/email-verification/verification-preview.html'));
fs.mkdirSync(path.dirname(destination), { recursive: true });
fs.writeFileSync(destination, html);
console.log(`Offline email preview: ${destination}`);
