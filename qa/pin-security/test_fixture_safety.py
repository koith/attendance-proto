"""Offline negative regression tests; no database connection or credentials."""
import unittest
from unittest.mock import patch
import fixture_safety as guard


class FixtureSafetyTests(unittest.TestCase):
    def setUp(self):
        self.local = {'PGDATABASE': 'pin_fixture', 'PGHOST': '127.0.0.1'}
        self.ci = {'PGDATABASE': 'pin_fixture', 'PGHOST': 'postgres',
                   'GITHUB_ACTIONS': 'true', 'GITHUB_REPOSITORY': 'koith/attendance-proto',
                   'GITHUB_WORKFLOW': guard.CI_WORKFLOW}

    def test_local_fixture_ok(self):
        self.assertEqual(guard.validate_environment(self.local), 'pin_fixture')

    def test_actions_fixture_ok(self):
        self.assertEqual(guard.validate_environment(self.ci), 'pin_fixture')

    def test_remote_host_refused(self):
        for host in ('prod.example.test', 'db.internal', '10.1.1.5'):
            with self.subTest(host=host), self.assertRaisesRegex(ValueError, 'HOST_REFUSED'):
                guard.validate_environment({**self.local, 'PGHOST': host})

    def test_db_name_prefix_not_enough(self):
        for db in ('pin_fixtureproduction', 'pin_fixture host=prod', 'attendance', 'audit_pinproduction'):
            with self.subTest(db=db), self.assertRaisesRegex(ValueError, 'DATABASE_NAME_REFUSED'):
                guard.validate_environment({**self.local, 'PGDATABASE': db})

    def test_pg_hostaddr_override_refused(self):
        with self.assertRaisesRegex(ValueError, 'HOSTADDR_REFUSED'):
            guard.validate_environment({**self.local, 'PGHOSTADDR': '8.8.8.8'})

    def test_pg_service_override_refused(self):
        with self.assertRaisesRegex(ValueError, 'SERVICE_CONFIG_REFUSED'):
            guard.validate_environment({**self.local, 'PGSERVICE': 'production'})

    def test_untrusted_ci_claim_refused(self):
        for change in ({'GITHUB_ACTIONS':'false'}, {'GITHUB_REPOSITORY':'other/repo'},
                       {'GITHUB_WORKFLOW':'other'}, {'PGDATABASE':'audit_pin'}):
            with self.subTest(change=change), self.assertRaises(ValueError):
                guard.validate_environment({**self.ci, **change})

    def test_backend_must_match(self):
        with patch.object(guard, '_sql', return_value='other_database'):
            with self.assertRaisesRegex(ValueError, 'BACKEND_NAME_REFUSED'):
                guard.verify_target(self.local)

    def test_seed_required_for_mutating_tests(self):
        with patch.object(guard, '_sql', side_effect=['pin_fixture', '1']):
            with self.assertRaisesRegex(ValueError, 'SYNTHETIC_SEED_MISSING'):
                guard.verify_target(self.local, require_seed=True)

    def test_good_seed_passes(self):
        with patch.object(guard, '_sql', side_effect=['pin_fixture', '2']):
            self.assertEqual(guard.verify_target(self.local, require_seed=True), 'pin_fixture')


if __name__ == '__main__':
    unittest.main()
