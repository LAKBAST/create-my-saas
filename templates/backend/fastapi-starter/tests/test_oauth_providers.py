import unittest
from unittest.mock import patch

from fastapi.testclient import TestClient

from main import app
from src.modules.auth import oauth


class OAuthProvidersTests(unittest.TestCase):
    def test_unconfigured_providers_are_reported_so_their_buttons_stay_hidden(self):
        client = TestClient(app)
        with patch.object(oauth, "_provider_config", return_value=None):
            self.assertEqual(client.get("/auth/oauth/providers").json(), [{"provider": "github", "configured": False}, {"provider": "google", "configured": False}])
        with patch.object(oauth, "_provider_config", side_effect=lambda provider: {"client_id": "x"} if provider == "google" else None):
            self.assertEqual([item["provider"] for item in client.get("/auth/oauth/providers").json() if item["configured"]], ["google"])
        client.close()
