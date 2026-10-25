import { emailBrand, renderEmail, renderMessage } from './email-templates';

describe('email templates', () => {
  const brand = emailBrand({ PRODUCT_NAME: 'Acme', FRONTEND_URL: 'https://acme.test/' });

  it('escapes HTML and keeps a matching plain-text version', () => {
    const email = renderEmail(brand, { subject: 'Asunto', title: 'Hola <Ana>', paragraphs: ['Uno & dos'], action: ['Abrir', 'https://acme.test/verify?token=a&b'], code: ['Invitation token', 'abc123'] });
    expect(email.html).toContain('Hola &lt;Ana&gt;');
    expect(email.html).toContain('href="https://acme.test/verify?token=a&amp;b"');
    expect(email.html).not.toContain('{{');
    expect(email.text).toContain('Abrir: https://acme.test/verify?token=a&b');
    expect(email.text).toMatch(/token:\s*abc123/);
  });

  it('renders the shared messages', () => {
    const email = renderMessage(brand, 'email_verification', { url: 'https://acme.test/verify-email?token=t', values: { name: 'Ana' } });
    expect(email.subject).toBe('Confirma tu correo electrónico');
    expect(email.html).toContain('Acme');
    expect(renderMessage(brand, 'organization_invitation', { code: 'secret' }).text).toMatch(/token:\s*secret/i);
  });
});
