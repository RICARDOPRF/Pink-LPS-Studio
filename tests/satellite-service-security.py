import importlib.util
import os
import tempfile
from pathlib import Path

with tempfile.TemporaryDirectory() as config_dir, tempfile.TemporaryDirectory() as allowed_dir, tempfile.TemporaryDirectory() as outside_dir:
    os.environ['PINK_SATELLITE_CONFIG_DIR'] = config_dir
    os.environ['PINK_SATELLITE_ROOTS'] = allowed_dir
    os.environ['PINK_SATELLITE_CAMERA'] = '0'

    spec = importlib.util.spec_from_file_location('pink_satellite_test', Path(__file__).resolve().parents[1] / 'companion' / 'satellite_service.py')
    module = importlib.util.module_from_spec(spec)
    assert spec and spec.loader
    spec.loader.exec_module(module)

    runtime = module.SatelliteRuntime()
    assert runtime.roots == [Path(allowed_dir).resolve()]
    assert runtime.capability('terminal.exec').state == 'unavailable'
    assert runtime.capability('system.snapshot').risk == 'READ_ONLY'
    assert runtime.capability('screen.capture').risk == 'SENSITIVE_READ'

    safe = Path(allowed_dir) / 'notes.md'
    safe.write_text('Pink Satellite security test', encoding='utf-8')
    resolved = runtime.resolve_path(str(safe))
    assert resolved == safe.resolve()
    read = runtime.files_read_text({'path': str(safe)})
    assert 'security test' in read['text']

    secret = Path(allowed_dir) / '.env'
    secret.write_text('SECRET=NOPE', encoding='utf-8')
    try:
        runtime.resolve_path(str(secret))
        raise AssertionError('secret-like file should be blocked')
    except PermissionError as exc:
        assert 'secret_like_file_blocked' in str(exc)

    outside = Path(outside_dir) / 'outside.txt'
    outside.write_text('outside', encoding='utf-8')
    try:
        runtime.resolve_path(str(outside))
        raise AssertionError('outside root should be blocked')
    except PermissionError as exc:
        assert 'path_outside_allowed_roots' in str(exc)

    origin = 'https://ricardoprf.github.io'
    invalid = runtime.pair('000000' if runtime.pair_code != '000000' else '999999', origin)
    assert invalid['ok'] is False
    paired = runtime.pair(runtime.pair_code, origin)
    assert paired['ok'] is True
    session = paired['sessionToken']
    assert runtime.sessions.validate(session, origin)
    assert not runtime.sessions.validate(session, 'https://evil.example')

    approval = runtime.approvals.request(session, 'screen.capture', 'SENSITIVE_READ')
    raw_code = runtime.approvals._requests[approval['approvalId']]['code']
    wrong = runtime.approvals.confirm(session, approval['approvalId'], '111111' if raw_code != '111111' else '222222')
    assert wrong['ok'] is False
    confirmed = runtime.approvals.confirm(session, approval['approvalId'], raw_code)
    assert confirmed['ok'] is True
    assert runtime.approvals.consume(session, 'screen.capture', confirmed['approvalToken']) is True
    assert runtime.approvals.consume(session, 'screen.capture', confirmed['approvalToken']) is False

    snapshot = runtime.system_snapshot()
    assert 'deviceId' in snapshot
    assert 'username' not in snapshot
    assert module._host_allowed('127.0.0.1:8777')
    assert not module._host_allowed('evil.example:8777')
    assert module._origin_allowed(origin)
    assert not module._origin_allowed('https://evil.example')

print('Pink Satellite security contracts: PASS')
