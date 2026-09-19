# PowerShell script to create and activate a Python virtual environment
# Usage: .\setup_venv.ps1

$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$venvPath = Join-Path $projectRoot "venv"

# Create virtual environment if it does not exist
if (-Not (Test-Path $venvPath)) {
    Write-Host "Creating virtual environment..."
    python -m venv $venvPath
    if ($LASTEXITCODE -ne 0) {
        Write-Error "Failed to create virtual environment. Ensure Python is in PATH."
        exit $LASTEXITCODE
    }
} else {
    Write-Host "Virtual environment already exists."
}

# Activate the virtual environment
$activateScript = Join-Path $venvPath "Scripts\Activate.ps1"
if (Test-Path $activateScript) {
    Write-Host "Activating virtual environment..."
    & $activateScript
} else {
    Write-Error "Activation script not found at $activateScript"
    exit 1
}

# Upgrade pip and install dependencies
Write-Host "Installing requirements..."
# Upgrade pip, setuptools, wheel before installing dependencies
pip install --upgrade pip setuptools wheel
if (Test-Path (Join-Path $projectRoot "requirements.txt")) {
    pip install -r (Join-Path $projectRoot "requirements.txt")
} else {
    Write-Warning "requirements.txt not found; skipping pip install."
}

Write-Host "Setup complete. You can now run your scripts, e.g., python demo_cv.py"
