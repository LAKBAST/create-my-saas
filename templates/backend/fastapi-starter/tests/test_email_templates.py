import unittest

from src.core.email_templates import render_email


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
        self.assertIn("Abrir: https://example.com/verify?token=a&b", email.text)
        self.assertRegex(email.text, r"token:\s*abc123")


if __name__ == "__main__":
    unittest.main()
