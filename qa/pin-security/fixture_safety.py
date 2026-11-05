#!/usr/bin/env python3
"""Fail-closed guard for disposable PIN QA PostgreSQL, never production.

Call before setup.sql (environment + server identity) and after setup.sql
(environment + server identity + unmistakably synthetic seeded rows).
This is not an authentication system: only use inside a disposable QA runner.
"""
import os
import re
import subprocess
import sys

DB_RE = re.compile(r'^(?:audit_pin|pin_fixture)(?:_[a-z0-9]+)*$')
CI_WORKFLOW = 'PIN server security isolated integration'


def validate_environment(environ):
    db = environ.get('PGDATABASE', '')
    host = environ.get('PGHOST', '')
    addr = environ.get('PGHOSTADDR', '')
    service = environ.get('PGSERVICE', '')
    servicefile = environ.get('PGSERVICEFILE', '')
    if not DB_RE.fullmatch(db):
        raise ValueError('PIN_FIXTURE_DATABASE_NAME_REFUSED')
    if service or servicefile:
        raise ValueError('PIN_FIXTURE_SERVICE_CONFIG_REFUSED')
    if addr and addr not in ('127.0.0.1', '::1'):
        raise ValueError('PIN_FIXTURE_HOSTADDR_REFUSED')
    local_host = not host or host in ('localhost', '127.0.0.1', '::1') or host.startswith('/')
    github_fixture = (host == 'postgres'
                      and environ.get('GITHUB_ACTIONS') == 'true'
                      and environ.get('GITHUB_REPOSITORY') == 'koith/attendance-proto'
                      and environ.get('GITHUB_WORKFLOW') == CI_WORKFLOW
                      and db == 'pin_fixture')
    if not local_host and not github_fixture:
        raise ValueError('PIN_FIXTURE_HOST_REFUSED')
    if host.startswith('/') and addr:
        raise ValueError('PIN_FIXTURE_CONFLICTING_HOST_REFUSED')
    return db


def _sql(environ, query):
    db = validate_environment(environ)
    p = subprocess.run([environ.get('PIN_QA_PSQL', 'psql'), '-X', '-v', 'ON_ERROR_STOP=1', '-At',
                        '--dbname', db, '-c', query], capture_output=True, text=True, timeout=20,
                       env=environ)
    if p.returncode:
        raise ValueError('PIN_FIXTURE_DATABASE_QUERY_FAILED')
    return p.stdout.strip()


def verify_target(environ, *, require_seed=False):
    db = validate_environment(environ)
    # Also confirm the actual DB backend, not just the client-side PGDATABASE.
    name = _sql(environ, 'select current_database()')
    if name != db:
        raise ValueError('PIN_FIXTURE_BACKEND_NAME_REFUSED')
    if require_seed:
        marker = _sql(environ, """select
          (select count(*) from public.employees
             where id=710001 and name='Synthetic employee 710001' and store_id=710001)
          + (select count(*) from public.stores
             where id=710003 and onboarding_status='STAGED');""")
        if marker != '2':
            raise ValueError('PIN_FIXTURE_SYNTHETIC_SEED_MISSING')
    return db


if __name__ == '__main__':
    try:
        if sys.argv[1:] not in (['--preinstall'], ['--postinstall']):
            raise ValueError('PIN_FIXTURE_USAGE_INVALID')
        verify_target(os.environ, require_seed=sys.argv[1:] == ['--postinstall'])
        print('PIN_FIXTURE_SAFETY_PASS_' + ('SEEDED' if sys.argv[1:] == ['--postinstall'] else 'EMPTY'))
    except (ValueError, OSError, subprocess.TimeoutExpired) as error:
        # Never print DSN, SQL, environment variables, or connection credentials.
        code = str(error)
        print(code if code.startswith('PIN_FIXTURE_') else 'PIN_FIXTURE_SAFETY_FAILED', file=sys.stderr)
        sys.exit(2)
