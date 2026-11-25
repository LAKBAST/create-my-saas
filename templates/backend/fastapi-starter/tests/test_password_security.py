import asyncio
import threading
import unittest
from unittest.mock import patch

from src.modules.auth.security import password as password_security


class PasswordSecurityTests(unittest.IsolatedAsyncioTestCase):
    async def test_hash_and_verification_remain_compatible(self):
        hashed = await password_security.hash_password("password123")

        self.assertTrue(hashed.startswith("$argon2id$"))
        self.assertTrue(await password_security.verify_password("password123", hashed))
        self.assertFalse(await password_security.verify_password("wrong-password", hashed))

    async def test_password_work_leaves_the_event_loop_available(self):
        loop = asyncio.get_running_loop()
        loop_thread = threading.get_ident()
        for operation, arguments, result in (
            ("hash", ("password123",), "hashed-password"),
            ("verify", ("password123", "hashed-password"), True),
            ("verify", ("wrong-password", "hashed-password"), False),
        ):
            with self.subTest(operation=operation, result=result):
                started = asyncio.Event()
                release = threading.Event()

                def blocking_work(*args):
                    self.assertEqual(args, arguments)
                    self.assertNotEqual(threading.get_ident(), loop_thread)
                    loop.call_soon_threadsafe(started.set)
                    if not release.wait(timeout=5):
                        raise AssertionError("Event loop did not release password work")
                    return result

                helper = (
                    password_security.hash_password
                    if operation == "hash"
                    else password_security.verify_password
                )
                with patch.object(
                    password_security.password_hash, operation, side_effect=blocking_work
                ):
                    task = asyncio.create_task(helper(*arguments))
                    try:
                        await asyncio.wait_for(started.wait(), timeout=2)
                        # The event loop can run while the password worker is blocked.
                        self.assertFalse(task.done())
                    finally:
                        release.set()
                        actual = await task
                    self.assertEqual(actual, result)

    async def test_password_errors_propagate(self):
        for operation, helper, arguments in (
            ("hash", password_security.hash_password, ("password123",)),
            (
                "verify",
                password_security.verify_password,
                ("password123", "invalid-hash"),
            ),
        ):
            with self.subTest(operation=operation):
                error = ValueError("password operation failed")
                with patch.object(
                    password_security.password_hash, operation, side_effect=error
                ):
                    with self.assertRaises(ValueError) as raised:
                        await helper(*arguments)
                self.assertIs(raised.exception, error)
