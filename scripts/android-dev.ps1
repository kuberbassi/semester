<#
.SYNOPSIS
    Semester Android Automated Build, Deploy, Smoke-Test & Log Collection Toolkit.
.EXAMPLE
    .\scripts\android-dev.ps1 setup                  # Check & install Rust targets + cargo-ndk + verify NDK/ADB
    .\scripts\android-dev.ps1 build                  # Compile Rust .so (arm64-v8a + x86_64) + Gradle Debug APK
    .\scripts\android-dev.ps1 build -SkipRust        # Fast UI-only Kotlin rebuild (~10s)
    .\scripts\android-dev.ps1 run                    # Build -> Install on phone -> Launch -> Stream & save logs
    .\scripts\android-dev.ps1 run -SkipRust          # Fast Kotlin edit -> Install -> Launch -> Stream logs
    .\scripts\android-dev.ps1 run -NoBuild           # Reinstall existing APK -> Launch -> Stream logs
    .\scripts\android-dev.ps1 logs                   # Stream & save live logs from phone to logs/android/
    .\scripts\android-dev.ps1 crash                  # Dump crash report + offline last_crash.txt + screenshot
    .\scripts\android-dev.ps1 smoke                  # Automated install + launch + Rust .so + DB + crash check
    .\scripts\android-dev.ps1 wireless               # Switch USB-connected phone to cable-free Wi-Fi ADB
    .\scripts\android-dev.ps1 wireless -Pair "192.168.1.5:37421" -Code "123456" -Connect "192.168.1.5:41235"
#>
param(
    [Parameter(Position = 0)]
    [ValidateSet("setup", "build", "run", "logs", "crash", "smoke", "wireless", "mirror", "help")]
    [string]$Action = "help",

    [switch]$SkipRust,
    [switch]$NoBuild,
    [switch]$Release,
    [switch]$DebugRust,
    [switch]$Monkey,
    [string]$Device = "",
    [string]$Pair = "",
    [string]$Code = "",
    [string]$Connect = ""
)

$ErrorActionPreference = "Stop"
$RepoRoot = Split-Path -Parent $PSScriptRoot
$RustDir = Join-Path $RepoRoot "semester-core"
$AndroidDir = Join-Path $RepoRoot "semester-android"
$JniLibsDir = Join-Path $AndroidDir "app\src\main\jniLibs"
$LogDir = Join-Path $RepoRoot "logs\android"
$AppId = "com.semester.app"
$MainActivity = "com.semester.app/.MainActivity"

# Environment setup (Android Studio JBR + Android SDK + Gradle 9.8.1)
$JavaHomeCandidate = "C:\Program Files\Android\Android Studio\jbr"
if (Test-Path $JavaHomeCandidate) { $env:JAVA_HOME = $JavaHomeCandidate }
$SdkDir = if ($env:ANDROID_HOME) { $env:ANDROID_HOME } else { Join-Path $env:LOCALAPPDATA "Android\Sdk" }
$env:ANDROID_HOME = $SdkDir
$AdbExe = Join-Path $SdkDir "platform-tools\adb.exe"

function Find-GradleBat {
    $gradlew = Join-Path $AndroidDir "gradlew.bat"
    if (Test-Path $gradlew) { return $gradlew }
    $distRoot = Join-Path $env:USERPROFILE ".gradle\wrapper\dists"
    if (Test-Path $distRoot) {
        $found = Get-ChildItem -Path $distRoot -Recurse -Filter "gradle.bat" -ErrorAction SilentlyContinue |
            Sort-Object FullName -Descending | Select-Object -First 1
        if ($found) { return $found.FullName }
    }
    $cmd = Get-Command gradle -ErrorAction SilentlyContinue
    if ($cmd) { return $cmd.Source }
    return $null
}

function Find-AndroidNdk {
    $ndkRoot = Join-Path $SdkDir "ndk"
    if (-not (Test-Path $ndkRoot)) { return $null }
    $latest = Get-ChildItem -Path $ndkRoot -Directory -ErrorAction SilentlyContinue |
        Sort-Object Name -Descending | Select-Object -First 1
    if ($latest) { return $latest.FullName }
    return $null
}

function Invoke-Adb {
    param([string[]]$AdbArgs)
    if (-not (Test-Path $AdbExe)) {
        throw "adb.exe not found at $AdbExe. Install Android SDK Platform-Tools."
    }
    $fullArgs = @()
    if ($Device) { $fullArgs += @("-s", $Device) }
    $fullArgs += $AdbArgs
    & $AdbExe @fullArgs
}

function Get-ConnectedDevice {
    $lines = & $AdbExe devices | Select-Object -Skip 1 | Where-Object { $_ -match "\s+device$" }
    if (-not $lines) { return $null }
    if ($Device) { return $Device }
    return ($lines | Select-Object -First 1).Split("`t")[0].Trim()
}

function Ensure-LogDir {
    if (-not (Test-Path $LogDir)) { New-Item -ItemType Directory -Path $LogDir -Force | Out-Null }
}

function Write-Step([string]$Msg) {
    Write-Host "`n==> $Msg" -ForegroundColor Cyan
}

function Write-Ok([string]$Msg) {
    Write-Host "  [OK] $Msg" -ForegroundColor Green
}

function Write-Warn([string]$Msg) {
    Write-Host "  [WARN] $Msg" -ForegroundColor Yellow
}

function Write-Err([string]$Msg) {
    Write-Host "  [ERR] $Msg" -ForegroundColor Red
}

function Run-Setup {
    Write-Step "Checking Semester Android Environment"
    Write-Ok "JAVA_HOME = $env:JAVA_HOME"
    Write-Ok "ANDROID_HOME = $SdkDir"

    if (Test-Path $AdbExe) { Write-Ok "ADB found: $AdbExe" } else { Write-Err "ADB missing at $AdbExe" }

    $gradle = Find-GradleBat
    if ($gradle) { Write-Ok "Gradle found: $gradle" } else { Write-Err "Gradle not found" }

    # 1. Rust Android targets
    Write-Step "Ensuring Rust Android compilation targets"
    $installedTargets = rustup target list --installed
    foreach ($t in @("aarch64-linux-android", "x86_64-linux-android")) {
        if ($installedTargets -contains $t) {
            Write-Ok "Rust target installed: $t"
        } else {
            Write-Host "  Installing Rust target $t..." -ForegroundColor Yellow
            rustup target add $t
            if ($LASTEXITCODE -ne 0) { throw "Failed to install Rust target $t" }
            Write-Ok "Installed $t"
        }
    }

    # 2. Android NDK check (used directly via LLVM clang -- zero cargo-ndk dependency!)
    Write-Step "Checking Android NDK LLVM Toolchain"
    $ndk = Find-AndroidNdk
    if ($ndk) {
        $llvmBin = Join-Path $ndk "toolchains\llvm\prebuilt\windows-x86_64\bin"
        if (Test-Path (Join-Path $llvmBin "aarch64-linux-android26-clang.cmd")) {
            Write-Ok "Android NDK LLVM ready: $ndk"
        } else {
            Write-Warn "NDK folder found at $ndk but windows-x86_64 LLVM bin missing."
        }
    } else {
        Write-Err "Android NDK is NOT installed yet!"
        Write-Host @"

  Install NDK in 1 click inside Android Studio:
    1. Open Android Studio -> Settings (Ctrl+Alt+S)
    2. Languages & Frameworks -> Android SDK -> SDK Tools tab
    3. Check:
         [x] NDK (Side by side)
         [x] Android SDK Command-line Tools (latest)
    4. Click Apply -> OK, then re-run: .\scripts\android-dev.ps1 setup

"@ -ForegroundColor Yellow
    }

    # 3. Connected phone check
    Write-Step "Checking connected Android phone (ADB)"
    $rawDevices = & $AdbExe devices | Select-Object -Skip 1
    $unauth = $rawDevices | Where-Object { $_ -match "\s+unauthorized$" }
    $dev = Get-ConnectedDevice
    if ($dev) {
        $model = (Invoke-Adb @("shell", "getprop", "ro.product.model")).Trim()
        $abi = (Invoke-Adb @("shell", "getprop", "ro.product.cpu.abi")).Trim()
        $ver = (Invoke-Adb @("shell", "getprop", "ro.build.version.release")).Trim()
        Write-Ok "Phone ready: $model (Android $ver, ABI: $abi, serial: $dev)"
    } elseif ($unauth) {
        Write-Warn "Phone detected ($unauth), waiting for you to tap 'Allow' on the USB debugging popup on your phone screen!"
    } else {
        Write-Warn "No phone detected yet. Enable Developer Options -> USB Debugging (or Wireless Debugging) on your phone and connect it."
    }

    # 4. Optional scrcpy check
    $scrcpyExe = Find-ScrcpyExe
    if ($scrcpyExe) {
        Write-Ok "scrcpy ready: $scrcpyExe (run 'npm run android:mirror' to mirror phone)"
    } else {
        Write-Host "  [TIP] Optional screen mirroring: winget install Genymobile.scrcpy" -ForegroundColor DarkGray
    }
}

function Find-ScrcpyExe {
    $cmd = Get-Command scrcpy -ErrorAction SilentlyContinue
    if ($cmd) { return $cmd.Source }
    $wingetLinks = Join-Path $env:LOCALAPPDATA "Microsoft\WinGet\Links\scrcpy.exe"
    if (Test-Path $wingetLinks) { return $wingetLinks }
    $wingetPkgs = Join-Path $env:LOCALAPPDATA "Microsoft\WinGet\Packages"
    if (Test-Path $wingetPkgs) {
        $found = Get-ChildItem -Path $wingetPkgs -Recurse -Filter "scrcpy.exe" -ErrorAction SilentlyContinue |
            Select-Object -First 1
        if ($found) { return $found.FullName }
    }
    return $null
}

function Run-Mirror {
    $scrcpyExe = Find-ScrcpyExe
    if (-not $scrcpyExe) {
        throw "scrcpy not found. Install it with: winget install Genymobile.scrcpy"
    }
    $dev = Get-ConnectedDevice
    if (-not $dev) { throw "No Android phone connected. Plug in USB or run 'npm run android:wireless'." }
    # Reuse SDK's adb.exe so scrcpy never kills/restarts the ADB daemon
    $env:ADB = $AdbExe
    Write-Step "Launching scrcpy live mirror for device ($dev)"
    & $scrcpyExe -s $dev --window-title "Semester -- Phone Mirror ($dev)" --stay-awake
}

function Build-RustAbi {
    param(
        [string]$RustTarget,
        [string]$AndroidAbi,
        [string]$ClangPrefix,
        [string]$LlvmBin
    )
    $clangCmd = Join-Path $LlvmBin "${ClangPrefix}26-clang.cmd"
    $clangExe = Join-Path $LlvmBin "clang.exe"
    $arExe = Join-Path $LlvmBin "llvm-ar.exe"
    $ranlibExe = Join-Path $LlvmBin "llvm-ranlib.exe"

    $envKey = $RustTarget.Replace("-", "_")
    $envUpper = $envKey.ToUpper()

    Set-Item -Path "Env:CC_$envKey" -Value $clangExe
    Set-Item -Path "Env:CFLAGS_$envKey" -Value "--target=${ClangPrefix}26"
    Set-Item -Path "Env:AR_$envKey" -Value $arExe
    Set-Item -Path "Env:RANLIB_$envKey" -Value $ranlibExe
    Set-Item -Path "Env:CARGO_TARGET_${envUpper}_LINKER" -Value $clangCmd

    $profileDir = if ($DebugRust) { "debug" } else { "release" }
    $cargoArgs = @("build", "--target", $RustTarget, "--lib")
    if (-not $DebugRust) { $cargoArgs += "--release" }

    Write-Host "  Compiling $RustTarget ($AndroidAbi) [$profileDir]..." -ForegroundColor Cyan
    Push-Location $RustDir
    try {
        & cargo @cargoArgs
        if ($LASTEXITCODE -ne 0) { throw "cargo build failed for $RustTarget" }
    } finally {
        Pop-Location
    }

    $srcSo = Join-Path $RustDir "target\$RustTarget\$profileDir\libsemester_core.so"
    if (-not (Test-Path $srcSo)) { throw "Expected compiled library missing: $srcSo" }

    $dstDir = Join-Path $JniLibsDir $AndroidAbi
    if (-not (Test-Path $dstDir)) { New-Item -ItemType Directory -Path $dstDir -Force | Out-Null }
    $dstSo = Join-Path $dstDir "libsemester_core.so"
    Copy-Item -Path $srcSo -Destination $dstSo -Force
    $mb = [math]::Round((Get-Item $dstSo).Length / 1MB, 2)
    Write-Ok "Packaged $AndroidAbi/libsemester_core.so ($mb MB)"
}

function Run-Build {
    if (-not $SkipRust) {
        $ndk = Find-AndroidNdk
        if (-not $ndk) {
            throw "Android NDK not installed. Run '.\scripts\android-dev.ps1 setup' to see the 1-click Android Studio install step (or pass -SkipRust for Kotlin-only compile check)."
        }
        $llvmBin = Join-Path $ndk "toolchains\llvm\prebuilt\windows-x86_64\bin"
        if (-not (Test-Path $llvmBin)) {
            throw "Android NDK LLVM toolchain not found at $llvmBin"
        }
        $env:ANDROID_NDK_HOME = $ndk
        Write-Step "Compiling Rust native core (.so) via Android NDK LLVM ($ndk)"
        Build-RustAbi -RustTarget "aarch64-linux-android" -AndroidAbi "arm64-v8a" -ClangPrefix "aarch64-linux-android" -LlvmBin $llvmBin
        Build-RustAbi -RustTarget "x86_64-linux-android" -AndroidAbi "x86_64" -ClangPrefix "x86_64-linux-android" -LlvmBin $llvmBin
    } else {
        $soArm = Join-Path $JniLibsDir "arm64-v8a\libsemester_core.so"
        if (-not (Test-Path $soArm)) {
            Write-Warn "-SkipRust specified and arm64-v8a/libsemester_core.so does not exist yet. App will fail to load Rust core on a real phone until built once without -SkipRust."
        }
    }

    $gradle = Find-GradleBat
    if (-not $gradle) { throw "Gradle binary not found." }

    $task = if ($Release) { "assembleRelease" } else { "assembleDebug" }
    Write-Step "Building Android APK ($task)"
    Push-Location $AndroidDir
    try {
        & $gradle $task --no-daemon
        if ($LASTEXITCODE -ne 0) { throw "Gradle $task failed" }
    } finally {
        Pop-Location
    }

    $apkPath = Get-ApkPath
    if (-not (Test-Path $apkPath)) { throw "Expected APK not found at $apkPath" }
    $apkMb = [math]::Round((Get-Item $apkPath).Length / 1MB, 2)
    Write-Ok "APK built: $apkPath ($apkMb MB)"
}

function Get-ApkPath {
    if ($Release) {
        $signed = Join-Path $AndroidDir "app\build\outputs\apk\release\app-release.apk"
        if (Test-Path $signed) { return $signed }
        return Join-Path $AndroidDir "app\build\outputs\apk\release\app-release-unsigned.apk"
    }
    return Join-Path $AndroidDir "app\build\outputs\apk\debug\app-debug.apk"
}

function Install-And-Launch {
    $dev = Get-ConnectedDevice
    if (-not $dev) {
        throw "No Android phone connected. Plug in via USB (with USB Debugging ON) or run '.\scripts\android-dev.ps1 wireless'."
    }
    $apkPath = Get-ApkPath
    if (-not (Test-Path $apkPath)) {
        throw "APK not found at $apkPath. Run without -NoBuild first."
    }

    Write-Step "Installing APK to device ($dev)"
    Invoke-Adb @("install", "-r", "-d", $apkPath)
    if ($LASTEXITCODE -ne 0) { throw "adb install failed" }
    Write-Ok "Installed $AppId"

    Write-Step "Clearing logcat buffer & launching $AppId"
    Invoke-Adb @("logcat", "-c") | Out-Null
    Invoke-Adb @("shell", "am", "force-stop", $AppId) | Out-Null
    Invoke-Adb @("shell", "am", "start", "-n", $MainActivity) | Out-Null
    Start-Sleep -Seconds 2
}

function Stream-Logs {
    Ensure-LogDir
    $dev = Get-ConnectedDevice
    if (-not $dev) { throw "No Android phone connected." }

    $stamp = Get-Date -Format "yyyy-MM-dd_HH-mm-ss"
    $logFile = Join-Path $LogDir "session_$stamp.log"
    $appPid = (Invoke-Adb @("shell", "pidof", "-s", $AppId) 2>$null | Out-String).Trim()

    Write-Step "Streaming live logs -> $logFile (Press Ctrl+C to stop)"
    if ($appPid) {
        Write-Ok "Tracking $AppId (PID $appPid) + crashes/native errors"
    } else {
        Write-Warn "$AppId is not running yet; streaming tagged app/crash logs until launched."
    }

    # Capture app logs + crashes + native Rust/JNA/SQLite errors
    $filterArgs = @(
        "logcat", "-v", "time",
        "SemesterCrash:V",
        "WorkspaceRepository:V",
        "GoogleDriveSync:V",
        "IpuPortal:V",
        "AndroidRuntime:E",
        "DEBUG:F",
        "libc:F",
        "System.err:W",
        "*:S"
    )
    if ($appPid) {
        $filterArgs = @("logcat", "-v", "time", "--pid=$appPid")
    }

    Invoke-Adb $filterArgs | ForEach-Object {
        $line = $_
        Add-Content -Path $logFile -Value $line
        if ($line -match "FATAL|AndroidRuntime|SemesterCrash|UnsatisfiedLinkError|Exception| E ") {
            Write-Host $line -ForegroundColor Red
        } elseif ($line -match " W |WARN") {
            Write-Host $line -ForegroundColor Yellow
        } elseif ($line -match "GoogleDriveSync|WorkspaceRepository|IpuPortal") {
            Write-Host $line -ForegroundColor Cyan
        } else {
            Write-Host $line -ForegroundColor Gray
        }
    }
}

function Collect-CrashReport {
    Ensure-LogDir
    $dev = Get-ConnectedDevice
    if (-not $dev) { throw "No Android phone connected." }

    $stamp = Get-Date -Format "yyyy-MM-dd_HH-mm-ss"
    $reportFile = Join-Path $LogDir "crash_report_$stamp.txt"
    $shotFile = Join-Path $LogDir "screenshot_$stamp.png"

    Write-Step "Collecting comprehensive diagnostic & crash bundle from phone ($dev)"

    $model = (Invoke-Adb @("shell", "getprop", "ro.product.model") | Out-String).Trim()
    $androidVer = (Invoke-Adb @("shell", "getprop", "ro.build.version.release") | Out-String).Trim()
    $abi = (Invoke-Adb @("shell", "getprop", "ro.product.cpu.abi") | Out-String).Trim()
    $appPid = (Invoke-Adb @("shell", "pidof", "-s", $AppId) 2>$null | Out-String).Trim()

    $sb = New-Object System.Text.StringBuilder
    [void]$sb.AppendLine("==========================================================")
    [void]$sb.AppendLine(" SEMESTER ANDROID DIAGNOSTIC & CRASH REPORT")
    [void]$sb.AppendLine(" Captured : $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss zzz')")
    [void]$sb.AppendLine(" Device   : $model | Android $androidVer | ABI: $abi | Serial: $dev")
    [void]$sb.AppendLine(" App PID  : $(if ($appPid) { $appPid } else { 'NOT RUNNING' })")
    [void]$sb.AppendLine("==========================================================")

    [void]$sb.AppendLine("`n--- [1] ON-DEVICE PERSISTED CRASH LOG (files/last_crash.txt) ---")
    $offlineCrash = Invoke-Adb @("shell", "run-as", $AppId, "cat", "files/last_crash.txt") 2>&1 | Out-String
    [void]$sb.AppendLine($offlineCrash.Trim())

    [void]$sb.AppendLine("`n--- [2] APP PRIVATE FILES & SQLITE DB CHECK ---")
    $filesList = Invoke-Adb @("shell", "run-as", $AppId, "ls", "-la", "files") 2>&1 | Out-String
    [void]$sb.AppendLine($filesList.Trim())

    [void]$sb.AppendLine("`n--- [3] RECENT CRASHES & FATAL LOGCAT (crash buffer) ---")
    $crashBuf = Invoke-Adb @("logcat", "-d", "-b", "crash", "-v", "time", "-t", "200") 2>&1 | Out-String
    [void]$sb.AppendLine($crashBuf.Trim())

    [void]$sb.AppendLine("`n--- [4] RECENT APP & RUNTIME LOGCAT (last 400 matching lines) ---")
    $allLogs = Invoke-Adb @("logcat", "-d", "-v", "time", "-t", "1500") 2>&1 |
        Where-Object { $_ -match "com\.semester|Semester|WorkspaceRepository|GoogleDriveSync|IpuPortal|AndroidRuntime|uniffi|jna|UnsatisfiedLink|FATAL|DEBUG" } |
        Select-Object -Last 400
    [void]$sb.AppendLine(($allLogs -join "`n"))

    Set-Content -Path $reportFile -Value $sb.ToString() -Encoding UTF8
    Write-Ok "Crash & diagnostic report saved: $reportFile"

    # Capture current phone screen
    try {
        Invoke-Adb @("shell", "screencap", "-p", "/sdcard/semester_diag_shot.png") | Out-Null
        Invoke-Adb @("pull", "/sdcard/semester_diag_shot.png", $shotFile) | Out-Null
        Invoke-Adb @("shell", "rm", "/sdcard/semester_diag_shot.png") | Out-Null
        if (Test-Path $shotFile) { Write-Ok "Phone screenshot saved: $shotFile" }
    } catch {
        Write-Warn "Screenshot capture skipped: $($_.Exception.Message)"
    }
}

function Run-SmokeTest {
    Ensure-LogDir
    if (-not $NoBuild) { Run-Build }
    Install-And-Launch

    $stamp = Get-Date -Format "yyyy-MM-dd_HH-mm-ss"
    $smokeLog = Join-Path $LogDir "smoke_$stamp.log"
    $shotFile = Join-Path $LogDir "smoke_$stamp.png"

    Write-Step "Running Automated On-Phone Smoke & Stability Checks"
    Start-Sleep -Seconds 3
    $pid1 = (Invoke-Adb @("shell", "pidof", "-s", $AppId) 2>$null | Out-String).Trim()
    if (-not $pid1) {
        Write-Err "App is NOT running 5s after launch! Collecting crash report..."
        Collect-CrashReport
        throw "Smoke test FAILED: app crashed on startup."
    }
    Write-Ok "Process alive after startup (PID $pid1)"

    # Verify Rust native SQLite database was initialized inside private app storage (debuggable builds only)
    if (-not $Release) {
        $dbCheck = Invoke-Adb @("shell", "run-as", $AppId, "ls", "files/semester_workspace_v2.db") 2>&1 | Out-String
        if ($dbCheck -match "semester_workspace_v2\.db") {
            Write-Ok "Native Rust SQLite workspace initialized (semester_workspace_v2.db)"
        } else {
            Write-Warn "semester_workspace_v2.db not listed yet: $($dbCheck.Trim())"
        }
    } else {
        Write-Ok "AOT Release build active (zero Compose debug overhead)"
    }

    # Check crash buffer for fatal errors or UnsatisfiedLinkError
    $recentDump = Invoke-Adb @("logcat", "-d", "-v", "time") 2>&1
    $recentDump | Set-Content -Path $smokeLog -Encoding UTF8
    $fatals = $recentDump | Where-Object { $_ -match "FATAL EXCEPTION|UnsatisfiedLinkError|SemesterCrash|SIGSEGV|SIGABRT" -and $_ -match "semester|uniffi|jna|$pid1" }
    if ($fatals) {
        Write-Err "Fatal errors detected during startup:"
        $fatals | ForEach-Object { Write-Host "  $_" -ForegroundColor Red }
        Collect-CrashReport
        throw "Smoke test FAILED with fatal log entries."
    }
    Write-Ok "Zero fatal crashes, zero UnsatisfiedLinkError, zero native Rust panics"

    if ($Monkey) {
        Write-Step "Running 150-event UI Monkey Stress Test on $AppId"
        Invoke-Adb @("shell", "monkey", "-p", $AppId, "--throttle", "80", "--pct-syskeys", "0", "-v", "150") | Out-Null
        $pid2 = (Invoke-Adb @("shell", "pidof", "-s", $AppId) 2>$null | Out-String).Trim()
        if (-not $pid2) {
            Collect-CrashReport
            throw "Monkey stress test crashed the app!"
        }
        Write-Ok "Survived 150 UI stress events (PID $pid2)"
    }

    # Capture verification screenshot
    try {
        Invoke-Adb @("shell", "screencap", "-p", "/sdcard/semester_smoke.png") | Out-Null
        Invoke-Adb @("pull", "/sdcard/semester_smoke.png", $shotFile) | Out-Null
        Invoke-Adb @("shell", "rm", "/sdcard/semester_smoke.png") | Out-Null
        if (Test-Path $shotFile) { Write-Ok "Verification screenshot: $shotFile" }
    } catch {}

    Write-Host "`n[PASS] Automated Android smoke test passed! Full log: $smokeLog" -ForegroundColor Green
}

function Run-Wireless {
    if ($Pair -and $Code) {
        Write-Step "Pairing Android 11+ Wireless Debugging ($Pair)"
        & $AdbExe pair $Pair $Code
        if ($LASTEXITCODE -ne 0) { throw "adb pair failed" }
        Write-Ok "Paired with $Pair"
    }
    if ($Connect) {
        Write-Step "Connecting wirelessly to $Connect"
        & $AdbExe connect $Connect
        if ($LASTEXITCODE -ne 0) { throw "adb connect failed" }
        Write-Ok "Connected! You can now run '.\scripts\android-dev.ps1 run' completely cable-free."
        return
    }

    $dev = Get-ConnectedDevice
    if (-not $dev) {
        Write-Host @"
Wireless Debugging options:
  Option A (Android 11+, zero USB cable needed):
    On phone: Settings -> Developer Options -> Wireless debugging -> Pair device with pairing code
    Then run:
      .\scripts\android-dev.ps1 wireless -Pair "<IP:PAIR_PORT>" -Code "<6-DIGIT-CODE>" -Connect "<IP:CONNECT_PORT>"

  Option B (Auto-switch a USB-plugged phone to Wi-Fi ADB):
    Plug phone in via USB once, then run:
      .\scripts\android-dev.ps1 wireless
"@ -ForegroundColor Yellow
        return
    }

    Write-Step "Switching USB device ($dev) to Wi-Fi ADB on port 5555"
    $ipLine = (Invoke-Adb @("shell", "ip", "route") | Select-String -Pattern "src (\d+\.\d+\.\d+\.\d+)" | Select-Object -First 1)
    if (-not $ipLine) { throw "Could not detect phone Wi-Fi IP address. Make sure phone & PC are on the same Wi-Fi." }
    $phoneIp = $ipLine.Matches[0].Groups[1].Value
    Invoke-Adb @("tcpip", "5555")
    Start-Sleep -Seconds 2
    & $AdbExe connect "${phoneIp}:5555"
    Write-Ok "Connected wirelessly to ${phoneIp}:5555 -- you can unplug USB now!"
}

switch ($Action) {
    "setup"    { Run-Setup }
    "build"    { Run-Build }
    "run"      {
        if (-not $NoBuild) { Run-Build }
        Install-And-Launch
        Stream-Logs
    }
    "logs"     { Stream-Logs }
    "crash"    { Collect-CrashReport }
    "smoke"    { Run-SmokeTest }
    "wireless" { Run-Wireless }
    "mirror"   { Run-Mirror }
    default    {
        Write-Host @"
Semester Android Dev, Test & Log Collection Toolkit
===================================================
  .\scripts\android-dev.ps1 setup      Check & install Rust Android targets, NDK & phone status
  .\scripts\android-dev.ps1 build      Compile Rust .so (ARM64 + x86_64) + Gradle APK (-SkipRust / -Release)
  .\scripts\android-dev.ps1 run        Build -> Install -> Launch -> Stream & save colorized live logs
  .\scripts\android-dev.ps1 logs       Attach live logcat streamer & save into logs/android/
  .\scripts\android-dev.ps1 crash      Collect offline crash dump + logcat + screenshot into logs/android/
  .\scripts\android-dev.ps1 smoke      Automated install + launch + Rust DB check + crash verification (-Monkey)
  .\scripts\android-dev.ps1 wireless   Enable cable-free Wi-Fi ADB deployment & logging
  .\scripts\android-dev.ps1 mirror     Mirror & control phone screen on PC at 60 FPS (scrcpy)
"@ -ForegroundColor Cyan
    }
}
