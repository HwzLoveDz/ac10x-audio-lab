param(
    [ValidateSet('esp32s3','esp32s31')][string]$Target='esp32s3',
    [string]$IdfPath=$env:IDF_PATH,
    [string]$Python,
    [int]$Jobs=4,
    [switch]$Menuconfig
)
$ErrorActionPreference='Stop'
if(!$IdfPath -or !(Test-Path -LiteralPath (Join-Path $IdfPath 'tools\idf.py'))){throw 'Set IDF_PATH or pass -IdfPath to an ESP-IDF 6.2 checkout, then export its environment.'}
if(!$Python){
    if($env:IDF_PYTHON_ENV_PATH){$Python=Join-Path $env:IDF_PYTHON_ENV_PATH 'Scripts\python.exe'}
    else{$Python=(Get-Command python -ErrorAction Stop).Source}
}
$project=Split-Path $PSScriptRoot -Parent
$env:IDF_PATH=$IdfPath
$env:IDF_TARGET=$Target
$env:IDF_COMPONENT_MANAGER='0'
$env:CMAKE_BUILD_PARALLEL_LEVEL=[string]$Jobs
Push-Location $project
try{
    $build=Join-Path $project "build-$Target"
    $config=Join-Path $build 'sdkconfig'
    New-Item -ItemType Directory -Path $build -Force | Out-Null
    $options=@('-B',$build,'-D',"SDKCONFIG=$config")
    if($Target -eq 'esp32s31'){$options+='--preview'}
    if($Menuconfig){
        & $Python (Join-Path $IdfPath 'tools\idf.py') @options menuconfig
        if($LASTEXITCODE -ne 0){throw "Menuconfig failed: $LASTEXITCODE"}
    }
    & $Python (Join-Path $IdfPath 'tools\idf.py') @options build
    if($LASTEXITCODE -ne 0){throw "Build failed: $LASTEXITCODE"}
    & $Python (Join-Path $IdfPath 'tools\idf.py') @options size
    if($LASTEXITCODE -ne 0){throw "Size check failed: $LASTEXITCODE"}
}finally{Pop-Location}
