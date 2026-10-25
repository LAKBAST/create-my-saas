import assert from 'node:assert/strict';
import test from 'node:test';
import { emailBrand, renderMessage } from '../src/email/email-templates.js';

test('shared email messages render escaped HTML and a plain-text twin', () => {
  const email = renderMessage(emailBrand({ PRODUCT_NAME: 'Acme', FRONTEND_URL: 'https://acme.test' }), 'password_reset', {
    url: 'https://acme.test/reset-password?token=a&b', values: { name: '<Ana>' },
  });
  assert.equal(email.subject, 'Restablece tu contraseña');
  assert.match(email.html, /Hola, &lt;Ana&gt;\./);
  assert.match(email.html, /href="https:\/\/acme\.test\/reset-password\?token=a&amp;b"/);
  assert.doesNotMatch(email.html, /\{\{/);
  assert.match(email.text, /Elegir una contraseña nueva: https:\/\/acme\.test\/reset-password\?token=a&b/);
});
