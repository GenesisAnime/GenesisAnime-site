param(
  [ValidateSet('baslat', 'durdur')]
  [string]$Eylem = 'baslat',
  [switch]$Sunucu
)

$ErrorActionPreference = 'Stop'
$Proje = Split-Path -Parent $PSScriptRoot
$Adres = 'http://127.0.0.1:3000/'
$Port = 3000
$ApiAdres = 'http://127.0.0.1:8789'
$ApiPort = 8789
$PidDosyasi = Join-Path $Proje '.genesisanime-local.pid'
$ApiPidDosyasi = Join-Path $Proje '.genesisanime-local-api.pid'

function DinleyiciBul {
  @(Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue)
}

function SiteHazirMi {
  try {
    # Dev derlemesinde ana sayfa 2 MB'ı aşabiliyor; 2 sn'lik probe yanlış "hazır değil"
    # sonucu veriyordu (ölçüm: ~3,2 sn). Sınır bilinçli olarak geniş tutulur.
    $yanit = Invoke-WebRequest -Uri $Adres -UseBasicParsing -TimeoutSec 8
    return $yanit.StatusCode -eq 200 -and $yanit.Content -match 'GenesisAnime'
  }
  catch {
    return $false
  }
}

function ApiHazirMi {
  try {
    $yanit = Invoke-WebRequest -Uri "$ApiAdres/akis/kapsam" -UseBasicParsing -TimeoutSec 8
    return $yanit.StatusCode -eq 200 -and $yanit.Content -match '"hostlar"'
  }
  catch {
    return $false
  }
}

function PidKaydiniOku {
  if (-not (Test-Path $PidDosyasi)) { return $null }
  try {
    return (Get-Content -Raw -Path $PidDosyasi | ConvertFrom-Json)
  }
  catch {
    Remove-Item -Force $PidDosyasi -ErrorAction SilentlyContinue
    return $null
  }
}

if ($Sunucu) {
  Write-Host 'GenesisAnime yerel site ve akis API baslatiliyor...' -ForegroundColor Cyan
  $env:BASE_PATH = ''
  $env:NEXT_PUBLIC_SITE_URL = $Adres.TrimEnd('/')
  $env:NEXT_PUBLIC_API = $ApiAdres
  $apiProcess = $null
  try {
    $apiDizini = Join-Path $Proje 'api'
    $logDizini = Join-Path $Proje 'tools/rapor'
    New-Item -ItemType Directory -Path $logDizini -Force | Out-Null
    $apiArgs = @('/d', '/s', '/c', '"npm.cmd run dev -- --ip 127.0.0.1 --port 8789 --var CORS_EXTRA:http://127.0.0.1:3000"')
    $apiProcess = Start-Process -FilePath 'cmd.exe' -ArgumentList $apiArgs -WorkingDirectory $apiDizini -WindowStyle Hidden -PassThru `
      -RedirectStandardOutput (Join-Path $logDizini 'yerel-api.log') `
      -RedirectStandardError (Join-Path $logDizini 'yerel-api-hata.log')
    @{ pid = $apiProcess.Id; baslangic = (Get-Date).ToString('o') } |
      ConvertTo-Json -Compress |
      Set-Content -Path $ApiPidDosyasi -Encoding ASCII

    $apiSonZaman = (Get-Date).AddMinutes(2)
    while ((Get-Date) -lt $apiSonZaman -and -not (ApiHazirMi)) {
      if (-not (Get-Process -Id $apiProcess.Id -ErrorAction SilentlyContinue)) {
        throw 'Yerel akis API baslamadan kapandi. tools/rapor/yerel-api-hata.log dosyasini inceleyin.'
      }
      Start-Sleep -Seconds 2
    }
    if (-not (ApiHazirMi)) {
      throw 'Yerel akis API 2 dakika icinde hazir olmadi. tools/rapor/yerel-api-hata.log dosyasini inceleyin.'
    }

    Write-Host "Akis API hazir: $ApiAdres" -ForegroundColor Green
    $npm = Get-Command npm.cmd -ErrorAction Stop
    & $npm.Source run dev -- --hostname 127.0.0.1 --port $Port
    $kod = $LASTEXITCODE
    Write-Host "`nSunucu durdu (cikis kodu: $kod). Bu pencereyi kapatabilirsin." -ForegroundColor Yellow
  }
  catch {
    Write-Host "Sunucu baslatilamadi: $($_.Exception.Message)" -ForegroundColor Red
    $kod = 1
  }
  finally {
    if ($apiProcess -and (Get-Process -Id $apiProcess.Id -ErrorAction SilentlyContinue)) {
      & taskkill.exe /PID $apiProcess.Id /T /F | Out-Null
    }
    $apiKayit = $null
    if (Test-Path $ApiPidDosyasi) {
      try { $apiKayit = Get-Content -Raw -Path $ApiPidDosyasi | ConvertFrom-Json } catch { $apiKayit = $null }
    }
    if ($apiKayit -and $apiProcess -and [int]$apiKayit.pid -eq $apiProcess.Id) {
      Remove-Item -Force $ApiPidDosyasi -ErrorAction SilentlyContinue
    }
    $kayit = PidKaydiniOku
    if ($kayit -and [int]$kayit.pid -eq $PID) {
      Remove-Item -Force $PidDosyasi -ErrorAction SilentlyContinue
    }
  }
  exit $kod
}

if ($Eylem -eq 'durdur') {
  $kayit = PidKaydiniOku
  if (-not $kayit) {
    Write-Host 'GenesisAnime icin calisan bir sunucu kaydi bulunamadi.' -ForegroundColor Yellow
    exit 0
  }

  $sunucuPid = 0
  if (-not [int]::TryParse([string]$kayit.pid, [ref]$sunucuPid)) {
    Remove-Item -Force $PidDosyasi -ErrorAction SilentlyContinue
    Write-Host 'Eski sunucu kaydi temizlendi; calisan surec bulunamadi.' -ForegroundColor Yellow
    exit 0
  }

  $surec = Get-CimInstance Win32_Process -Filter "ProcessId = $sunucuPid" -ErrorAction SilentlyContinue
  if (-not $surec -or $surec.Name -notmatch '^powershell(\.exe)?$' -or $surec.CommandLine -notmatch '(?i)yerel-site\.ps1.*-Sunucu') {
    Remove-Item -Force $PidDosyasi -ErrorAction SilentlyContinue
    Write-Host 'GenesisAnime zaten kapali; eski kayit temizlendi.' -ForegroundColor Yellow
    exit 0
  }

  & taskkill.exe /PID $sunucuPid /T /F | Out-Null
  if ($LASTEXITCODE -ne 0) {
    throw "Could not stop the server process ($sunucuPid)."
  }
  Remove-Item -Force $PidDosyasi -ErrorAction SilentlyContinue

  if (Test-Path $ApiPidDosyasi) {
    $apiKayit = $null
    try { $apiKayit = Get-Content -Raw -Path $ApiPidDosyasi | ConvertFrom-Json } catch { $apiKayit = $null }
    $apiPid = 0
    if ($apiKayit -and [int]::TryParse([string]$apiKayit.pid, [ref]$apiPid)) {
      $apiSurec = Get-CimInstance Win32_Process -Filter "ProcessId = $apiPid" -ErrorAction SilentlyContinue
      if ($apiSurec -and $apiSurec.Name -eq 'cmd.exe' -and $apiSurec.CommandLine -match 'npm\.cmd run dev.*--port 8789') {
        & taskkill.exe /PID $apiPid /T /F | Out-Null
      }
    }
    Remove-Item -Force $ApiPidDosyasi -ErrorAction SilentlyContinue
  }

  $sonZaman = (Get-Date).AddSeconds(10)
  while (((DinleyiciBul).Count -gt 0 -or (Get-NetTCPConnection -State Listen -LocalPort $ApiPort -ErrorAction SilentlyContinue)) -and (Get-Date) -lt $sonZaman) {
    Start-Sleep -Milliseconds 250
  }
  if ((DinleyiciBul).Count -gt 0 -or (Get-NetTCPConnection -State Listen -LocalPort $ApiPort -ErrorAction SilentlyContinue)) {
    throw "Port $Port or $ApiPort is still in use. Another process may own it; no other process was stopped."
  }

  Write-Host 'GenesisAnime ve yerel akis API kapatildi; sunucu portlari serbest.' -ForegroundColor Green
  exit 0
}

if (Test-Path (Join-Path $Proje 'node_modules/next')) {
  Write-Host 'Site bagimliliklari hazir.' -ForegroundColor DarkGray
}
else {
  Write-Host 'Ilk calistirma: npm bagimliliklari kuruluyor...' -ForegroundColor Cyan
  Push-Location $Proje
  try {
    & npm.cmd ci --no-audit --no-fund
    if ($LASTEXITCODE -ne 0) { throw "npm ci basarisiz (cikis kodu: $LASTEXITCODE)." }
  }
  finally {
    Pop-Location
  }
}

$apiDizini = Join-Path $Proje 'api'
if (Test-Path (Join-Path $apiDizini 'node_modules/wrangler')) {
  Write-Host 'Akis API bagimliliklari hazir.' -ForegroundColor DarkGray
}
else {
  Write-Host 'Ilk akis API calistirmasi: Wrangler bagimliliklari kuruluyor...' -ForegroundColor Cyan
  Push-Location $apiDizini
  try {
    & npm.cmd ci --no-audit --no-fund
    if ($LASTEXITCODE -ne 0) { throw "Akis API npm ci basarisiz (cikis kodu: $LASTEXITCODE)." }
  }
  finally {
    Pop-Location
  }
}

Write-Host 'Yerel D1 semasi denetleniyor...' -ForegroundColor DarkGray
Push-Location $apiDizini
try {
  & npm.cmd run db:yerel
  if ($LASTEXITCODE -ne 0) { throw "Yerel D1 semasi uygulanamadi (cikis kodu: $LASTEXITCODE)." }
}
finally {
  Pop-Location
}

$kayit = PidKaydiniOku
if ($kayit) {
  $mevcutSurec = Get-Process -Id ([int]$kayit.pid) -ErrorAction SilentlyContinue
  if ($mevcutSurec -and (SiteHazirMi)) {
    if (-not (ApiHazirMi)) {
      throw "Site zaten acik, ancak yerel akis API'si yanit vermiyor. Once 'siteyi-durdur.cmd' ile kapatip yeniden baslatin."
    }
    Write-Host "Site ve akis API zaten acik: $Adres" -ForegroundColor Green
    Start-Process $Adres
    exit 0
  }
  Remove-Item -Force $PidDosyasi -ErrorAction SilentlyContinue
}

$dinleyiciler = DinleyiciBul
if ($dinleyiciler.Count -gt 0) {
  throw "Port $Port baska bir surec tarafindan kullaniliyor. O sureci kapatip yeniden deneyin; hicbir surec durdurulmadi."
}
$apiDinleyiciler = @(Get-NetTCPConnection -State Listen -LocalPort $ApiPort -ErrorAction SilentlyContinue)
if ($apiDinleyiciler.Count -gt 0) {
  throw "Port $ApiPort baska bir surec tarafindan kullaniliyor. O sureci kapatip yeniden deneyin; hicbir surec durdurulmadi."
}

$argumanlar = @(
  '-NoLogo', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File',
  ('"{0}"' -f $PSCommandPath), '-Sunucu'
)
$process = Start-Process -FilePath 'powershell.exe' -ArgumentList $argumanlar -WorkingDirectory $Proje -PassThru
@{ pid = $process.Id; url = $Adres; baslangic = (Get-Date).ToString('o') } |
  ConvertTo-Json -Compress |
  Set-Content -Path $PidDosyasi -Encoding ASCII

$sonZaman = (Get-Date).AddMinutes(4)
while ((Get-Date) -lt $sonZaman) {
  if (SiteHazirMi) {
    Write-Host "GenesisAnime hazir: $Adres" -ForegroundColor Green
    Start-Process $Adres
    exit 0
  }
  if (-not (Get-Process -Id $process.Id -ErrorAction SilentlyContinue)) {
    Remove-Item -Force $PidDosyasi -ErrorAction SilentlyContinue
    throw 'Gelistirme sunucusu baslamadan kapandi. Hata ayrintisi acilan sunucu penceresinde.'
  }
  Start-Sleep -Seconds 2
}

throw "Sunucu 4 dakika icinde hazir olmadi. Acilan penceredeki hata ayrintisina bakin: $Adres"
