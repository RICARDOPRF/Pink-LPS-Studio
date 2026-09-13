$ErrorActionPreference = 'Stop'
$Here = Split-Path -Parent $MyInvocation.MyCommand.Path
$Venv = Join-Path $Here '.pink-voice-venv'
Write-Host 'Pink Local Voice - instalacao isolada' -ForegroundColor Cyan
if (-not (Get-Command py -ErrorAction SilentlyContinue) -and -not (Get-Command python -ErrorAction SilentlyContinue)) { throw 'Python 3.11+ nao encontrado.' }
$Python = if (Get-Command py -ErrorAction SilentlyContinue) { 'py' } else { 'python' }
if ($Python -eq 'py') { & py -3.11 -m venv $Venv } else { & python -m venv $Venv }
$VPython = Join-Path $Venv 'Scripts\python.exe'
& $VPython -m pip install --upgrade pip wheel setuptools
& $VPython -m pip install -r (Join-Path $Here 'requirements-local-voice.txt')
& $VPython (Join-Path $Here 'local_voice_service.py') --self-test
Write-Host ''
Write-Host 'Dependencias locais instaladas. Ollama e o modelo de wake word sao opcionais e nao sao instalados silenciosamente.' -ForegroundColor Green
Write-Host "Para iniciar: & '$VPython' '$Here\local_voice_service.py'"
