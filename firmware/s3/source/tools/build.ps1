param([string]$IdfPath=$env:IDF_PATH,[string]$Python,[int]$Jobs=4)
$ErrorActionPreference='Stop'
if(!$IdfPath -or !(Test-Path -LiteralPath (Join-Path $IdfPath 'tools\idf.py'))){throw 'Set IDF_PATH or pass -IdfPath to an ESP-IDF 6.2 checkout, then export its environment.'}
if(!$Python){
    if($env:IDF_PYTHON_ENV_PATH){$Python=Join-Path $env:IDF_PYTHON_ENV_PATH 'Scripts\python.exe'}
    else{$Python=(Get-Command python -ErrorAction Stop).Source}
}
$project=Split-Path $PSScriptRoot -Parent
$env:IDF_PATH=$IdfPath
$env:IDF_TARGET='esp32s3'
$env:IDF_COMPONENT_MANAGER='0'
$env:CMAKE_BUILD_PARALLEL_LEVEL=[string]$Jobs
Push-Location $project
try{
    & $Python (Join-Path $IdfPath 'tools\idf.py') -B build build
    if($LASTEXITCODE -ne 0){throw "Build failed: $LASTEXITCODE"}
    & $Python (Join-Path $IdfPath 'tools\idf.py') -B build size
    if($LASTEXITCODE -ne 0){throw "Size check failed: $LASTEXITCODE"}
}finally{Pop-Location}
