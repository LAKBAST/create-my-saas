import unittest

from src.core.email_templates import render_email, render_message


class EmailTemplateTests(unittest.TestCase):
    def test_renders_escaped_html_and_a_matching_plain_text_version(self):
        email = render_email(
            subject="Asunto",
            title="Hola <Ana>",
            paragraphs=["Primer párrafo & más."],
            action=("Abrir", "https://example.com/verify?token=a&b"),
            code=("Invitation token", "abc123"),
        )
        self.assertIn("Hola &lt;Ana&gt;", email.html)
        self.assertIn('href="https://example.com/verify?token=a&amp;b"', email.html)
        self.assertNotIn("<Ana>", email.html)
        self.assertNotIn("{{", email.html)
        self.assertIn("Abrir: https://example.com/verify?token=a&b", email.text)
        self.assertRegex(email.text, r"token:\s*abc123")

    def test_shared_messages_fill_their_placeholders(self):
        email = render_message("email_verification", url="https://example.com/verify-email?token=t", name="<Ana>")
        self.assertEqual(email.subject, "Confirma tu correo electrónico")
        self.assertIn("Hola, <Ana>.", email.text)
        self.assertIn("Hola, &lt;Ana&gt;.", email.html)
        invitation = render_message("organization_invitation", code="secret-token")
        self.assertRegex(invitation.subject, "(?i)organization invitation")
        self.assertRegex(invitation.text, r"(?i)token:\s*secret-token")


if __name__ == "__main__":
    unittest.main()
