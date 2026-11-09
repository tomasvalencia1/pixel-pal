# Vigilante de Windows para Clawd Flotante. Solo LEE el estado del sistema y lo escribe como líneas JSON:
#   fg      ventana activa (app, título, rectángulo, pantalla completa, minimizada)
#   idle    segundos sin tocar el teclado ni el ratón (cada 5 s)
#   type    intensidad de tecleo en los últimos 2 s (0-10). NO lee qué teclas: solo si se pulsó alguna
#   clip    cambió el portapapeles; shot = si fue por ImpPnt o la herramienta de recortes
#   track   la ventana en la que Clawd está subido (posición, si sigue abierta, minimizada…)
#   bat     batería (cada 30 s)
#   claude  si la app de escritorio de Claude está abierta
#   media   qué suena en el panel multimedia de Windows
# No envía nada a ningún sitio: la salida solo la lee Clawd.
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

Add-Type @"
using System; using System.Runtime.InteropServices; using System.Text;
public static class W {
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int L, T, R, B; }
  [StructLayout(LayoutKind.Sequential)] public struct POINT { public int X, Y; }
  [StructLayout(LayoutKind.Sequential)] public struct LASTINPUTINFO { public uint cbSize; public uint dwTime; }
  [StructLayout(LayoutKind.Sequential)] public struct MONITORINFO { public int cbSize; public RECT rcMonitor; public RECT rcWork; public uint dwFlags; }
  [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
  [DllImport("dwmapi.dll")] public static extern int DwmGetWindowAttribute(IntPtr h, int a, out RECT r, int s);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetClassName(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr h);
  [DllImport("user32.dll")] public static extern bool IsZoomed(IntPtr h);
  [DllImport("user32.dll")] public static extern IntPtr MonitorFromWindow(IntPtr h, uint f);
  [DllImport("user32.dll")] public static extern bool GetMonitorInfo(IntPtr m, ref MONITORINFO i);
  [DllImport("user32.dll")] public static extern bool GetLastInputInfo(ref LASTINPUTINFO i);
  [DllImport("user32.dll")] public static extern bool GetCursorPos(out POINT p);
  [DllImport("user32.dll")] public static extern uint GetClipboardSequenceNumber();
  [DllImport("user32.dll")] public static extern short GetAsyncKeyState(int k);
  [DllImport("user32.dll")] public static extern bool IsWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
  // ¿Se pulsó alguna tecla desde la última vez? Solo devuelve sí/no: NO guarda qué tecla.
  // Ignora botones del ratón, Shift/Ctrl/Alt/Win solos e Imprimir pantalla.
  public static bool AnyKey() {
    bool any = false;
    for (int k = 0x08; k <= 0xFE; k++) {
      if ((k >= 0x10 && k <= 0x12) || k == 0x14 || k == 0x2C || k == 0x5B || k == 0x5C || (k >= 0xA0 && k <= 0xA5)) continue;
      if ((GetAsyncKeyState(k) & 0x8001) != 0) any = true;
    }
    return any;
  }
  public static bool PrintScreen() { return (GetAsyncKeyState(0x2C) & 0x8001) != 0; }
}
"@
[W]::SetProcessDPIAware() | Out-Null
Add-Type -AssemblyName System.Windows.Forms

function Emit($obj) {
  [Console]::Out.WriteLine(($obj | ConvertTo-Json -Compress))
  [Console]::Out.Flush()
}

# ---- música (panel multimedia de Windows) ----
$mgr = $null
try {
  Add-Type -AssemblyName System.Runtime.WindowsRuntime
  $asTaskGeneric = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
    $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1'
  })[0]
  function Await($op, [Type]$type) { $t = $asTaskGeneric.MakeGenericMethod($type).Invoke($null, @($op)); $t.Wait(-1) | Out-Null; $t.Result }
  [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager, Windows.Media.Control, ContentType = WindowsRuntime] | Out-Null
  $mgrType = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]
  $propsType = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties]
  $mgr = Await ($mgrType::RequestAsync()) $mgrType
} catch { }

function Get-Media {
  $out = @{ t = 'media'; playing = $false; title = ''; artist = ''; album = ''; app = '' }
  if (-not $mgr) { return $out }
  try {
    foreach ($s in @($mgr.GetSessions())) {
      if ($s.GetPlaybackInfo().PlaybackStatus -eq 'Playing') {
        $p = Await ($s.TryGetMediaPropertiesAsync()) $propsType
        $out.playing = $true; $out.title = [string]$p.Title; $out.artist = [string]$p.Artist
        $out.album = [string]$p.AlbumTitle; $out.app = [string]$s.SourceAppUserModelId
        break
      }
    }
  } catch { }
  return $out
}

$procNames = @{}
function ProcName([uint32]$procId) {
  if (-not $procNames.ContainsKey($procId)) {
    try { $procNames[$procId] = (Get-Process -Id $procId).ProcessName } catch { $procNames[$procId] = '' }
  }
  return $procNames[$procId]
}

$SHELL = @('Progman', 'WorkerW', 'Shell_TrayWnd', 'Shell_SecondaryTrayWnd')
$lastFg = ''; $lastMedia = ''; $lastClip = [W]::GetClipboardSequenceNumber(); $lastClaude = $null
$typeHits = 0; $prtAt = -1000
$trackFile = if ($env:CLAWD_TRACK) { $env:CLAWD_TRACK } else { Join-Path $env:USERPROFILE '.clawd-flotante\track.txt' }; $lastTrack = ''
$tick = 0
while ($true) {
  $tick++
  # ---- ventana activa ----
  try {
    $h = [W]::GetForegroundWindow()
    if ($h -ne [IntPtr]::Zero) {
      $r = New-Object W+RECT
      if ([W]::DwmGetWindowAttribute($h, 9, [ref]$r, 16) -ne 0) { [W]::GetWindowRect($h, [ref]$r) | Out-Null }
      $procId = [uint32]0; [W]::GetWindowThreadProcessId($h, [ref]$procId) | Out-Null
      $sb = New-Object System.Text.StringBuilder 256; [W]::GetWindowText($h, $sb, 256) | Out-Null
      $cb = New-Object System.Text.StringBuilder 128; [W]::GetClassName($h, $cb, 128) | Out-Null
      $mi = New-Object W+MONITORINFO; $mi.cbSize = 40
      [W]::GetMonitorInfo([W]::MonitorFromWindow($h, 2), [ref]$mi) | Out-Null
      $cls = $cb.ToString()
      $isShell = $SHELL -contains $cls
      $zoomed = [W]::IsZoomed($h)   # maximizada no es pantalla completa
      $full = (-not $isShell) -and (-not $zoomed) -and $r.L -le $mi.rcMonitor.L -and $r.T -le $mi.rcMonitor.T -and $r.R -ge $mi.rcMonitor.R -and $r.B -ge $mi.rcMonitor.B
      $fg = @{ t = 'fg'; id = [int64]$h; app = (ProcName $procId); title = $sb.ToString(); cls = $cls; shell = $isShell
               x = $r.L; y = $r.T; w = $r.R - $r.L; h = $r.B - $r.T; full = $full; max = $zoomed; min = [W]::IsIconic($h) }
      $key = "$($fg.id)|$($fg.title)|$($r.L),$($r.T),$($r.R),$($r.B)|$full|$($fg.min)"
      if ($key -ne $lastFg) { Emit $fg; $lastFg = $key }
    }
  } catch { }

  # ---- tecleo (solo intensidad: hubo o no hubo teclas, nunca cuáles) ----
  try {
    if ([W]::AnyKey()) { $typeHits++ }
    if ([W]::PrintScreen()) { $prtAt = $tick }
    if ($tick % 10 -eq 0) { Emit @{ t = 'type'; n = $typeHits }; $typeHits = 0 }
    if ($tick % 25 -eq 0) {
      $li = New-Object W+LASTINPUTINFO; $li.cbSize = 8; [W]::GetLastInputInfo([ref]$li) | Out-Null
      Emit @{ t = 'idle'; s = [int](([Environment]::TickCount - $li.dwTime) / 1000) }
    }
  } catch { }

  # ---- portapapeles: solo cuenta como captura si se usó ImpPnt o la herramienta de recortes ----
  try {
    $seq = [W]::GetClipboardSequenceNumber()
    if ($seq -ne $lastClip) {
      $lastClip = $seq
      $snip = [bool](Get-Process -Name 'ScreenClippingHost', 'SnippingTool', 'ScreenSketch' -ErrorAction SilentlyContinue | Select-Object -First 1)
      Emit @{ t = 'clip'; seq = $seq; shot = ($snip -or ($tick - $prtAt) -lt 25) }
    }
  } catch { }

  # ---- ventana en la que Clawd está subido (Clawd escribe su id en track.txt) ----
  try {
    $tid = 0
    if (Test-Path $trackFile) { $tid = [int64]([IO.File]::ReadAllText($trackFile).Trim()) }
    if ($tid -ne 0) {
      $th = [IntPtr]$tid
      $tr = New-Object W+RECT
      if ([W]::DwmGetWindowAttribute($th, 9, [ref]$tr, 16) -ne 0) { [W]::GetWindowRect($th, [ref]$tr) | Out-Null }
      $exists = [W]::IsWindow($th) -and [W]::IsWindowVisible($th)
      $track = @{ t = 'track'; id = $tid; exists = $exists; x = $tr.L; y = $tr.T; w = $tr.R - $tr.L; h = $tr.B - $tr.T; min = [W]::IsIconic($th); max = [W]::IsZoomed($th) }
      $tkey = "$tid|$exists|$($tr.L),$($tr.T),$($tr.R),$($tr.B)|$($track.min)|$($track.max)"
      if ($tkey -ne $lastTrack) { Emit $track; $lastTrack = $tkey }
    } else { $lastTrack = '' }
  } catch { }

  # ---- batería (cada 30 s) ----
  if ($tick % 150 -eq 1) {
    try {
      $ps = [System.Windows.Forms.SystemInformation]::PowerStatus
      $has = -not ($ps.BatteryChargeStatus.ToString() -match 'NoSystemBattery|Unknown')
      Emit @{ t = 'bat'; has = $has; pct = [int]($ps.BatteryLifePercent * 100); ac = ($ps.PowerLineStatus.ToString() -eq 'Online') }
    } catch { }
  }

  # ---- app de Claude abierta (cada 5 s) ----
  if ($tick % 25 -eq 3) {
    # "abierta" = con una ventana visible (si se cierra a la bandeja, cuenta como cerrada)
    $on = [bool](Get-Process -Name 'claude' -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne 0 } | Select-Object -First 1)
    if ($on -ne $lastClaude) { $lastClaude = $on; Emit @{ t = 'claude'; on = $on } }
  }

  # ---- música (cada 1,5 s; latido cada 15 s) ----
  if ($tick % 8 -eq 0) {
    $m = Get-Media
    $mj = $m | ConvertTo-Json -Compress
    if ($mj -ne $lastMedia -or $tick % 75 -eq 0) { Emit $m; $lastMedia = $mj }
  }

  Start-Sleep -Milliseconds 200
}
