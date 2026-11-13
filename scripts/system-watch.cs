// Vigilante de Windows para Pixel Pal (versión compilada de system-watch.ps1: misma salida, ~10 veces menos memoria).
// Solo LEE el estado del sistema y lo escribe como líneas JSON por la salida estándar:
//   fg      ventana activa (app, título, rectángulo, pantalla completa, minimizada)
//   idle    segundos sin tocar el teclado ni el ratón (cada 5 s)
//   type    intensidad de tecleo en los últimos 2 s (0-10). NO lee qué teclas: solo si se pulsó alguna
//   clip    cambió el portapapeles; shot = si fue por ImpPnt o la herramienta de recortes
//   track   la ventana en la que Pal está subido (posición, si sigue abierta, minimizada…)
//   bat     batería (cada 30 s)
//   claude  si la app de escritorio de Claude está abierta
//   media   qué suena en el panel multimedia de Windows
// No envía nada a ningún sitio: la salida solo la lee Pal. Se compila con tools/build-watcher.js.
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;

static class W {
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int L, T, R, B; }
  [StructLayout(LayoutKind.Sequential)] public struct LASTINPUTINFO { public uint cbSize; public uint dwTime; }
  [StructLayout(LayoutKind.Sequential)] public struct MONITORINFO { public int cbSize; public RECT rcMonitor; public RECT rcWork; public uint dwFlags; }
  [StructLayout(LayoutKind.Sequential)] public struct SYSTEM_POWER_STATUS { public byte ACLineStatus, BatteryFlag, BatteryLifePercent, SystemStatusFlag; public int BatteryLifeTime, BatteryFullLifeTime; }
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
  [DllImport("user32.dll")] public static extern uint GetClipboardSequenceNumber();
  [DllImport("user32.dll")] public static extern short GetAsyncKeyState(int k);
  [DllImport("user32.dll")] public static extern bool IsWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
  [DllImport("kernel32.dll")] public static extern bool GetSystemPowerStatus(out SYSTEM_POWER_STATUS s);

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
  public static RECT Rect(IntPtr h) {
    RECT r;
    if (DwmGetWindowAttribute(h, 9, out r, 16) != 0) GetWindowRect(h, out r);
    return r;
  }
}

// JSON mínimo (solo lo que hace falta: textos, números y sí/no)
class J {
  readonly StringBuilder sb = new StringBuilder("{");
  bool first = true;
  J Key(string k) { if (!first) sb.Append(','); first = false; sb.Append('"').Append(k).Append("\":"); return this; }
  public J S(string k, string v) {
    Key(k).Append('"');
    foreach (char c in v ?? "") {
      if (c == '"' || c == '\\') sb.Append('\\').Append(c);
      else if (c < 0x20) sb.Append("\\u").Append(((int)c).ToString("x4"));
      else sb.Append(c);
    }
    sb.Append('"'); return this;
  }
  public J N(string k, long v) { Key(k).Append(v); return this; }
  public J B(string k, bool v) { Key(k).Append(v ? "true" : "false"); return this; }
  J Append(string s) { sb.Append(s); return this; }
  J Append(char c) { sb.Append(c); return this; }
  J Append(long v) { sb.Append(v); return this; }
  public override string ToString() { return sb.ToString() + "}"; }
}

static class Media {
  static object mgr;   // GlobalSystemMediaTransportControlsSessionManager (si Windows lo tiene)
  static bool tried;
  // Espera una operación de WinRT sin depender de System.Runtime.WindowsRuntime (máx. 3 s)
  static T Wait<T>(Windows.Foundation.IAsyncOperation<T> op) {
    for (int i = 0; i < 600 && op.Status == Windows.Foundation.AsyncStatus.Started; i++) Thread.Sleep(5);
    if (op.Status != Windows.Foundation.AsyncStatus.Completed) throw new TimeoutException();
    return op.GetResults();
  }
  public static string Now() {
    var o = new J().S("t", "media");
    bool playing = false; string title = "", artist = "", album = "", app = "";
    try {
      if (!tried) {
        tried = true;
        mgr = Wait(Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager.RequestAsync());
      }
      var m = mgr as Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager;
      if (m != null) {
        foreach (var s in m.GetSessions()) {
          if (s.GetPlaybackInfo().PlaybackStatus == Windows.Media.Control.GlobalSystemMediaTransportControlsSessionPlaybackStatus.Playing) {
            var p = Wait(s.TryGetMediaPropertiesAsync());
            playing = true; title = p.Title; artist = p.Artist; album = p.AlbumTitle; app = s.SourceAppUserModelId;
            break;
          }
        }
      }
    } catch { }
    return o.B("playing", playing).S("title", title).S("artist", artist).S("album", album).S("app", app).ToString();
  }
}

static class Program {
  static readonly Dictionary<uint, string> procNames = new Dictionary<uint, string>();
  static string ProcName(uint pid) {
    string n;
    if (!procNames.TryGetValue(pid, out n)) {
      try { n = Process.GetProcessById((int)pid).ProcessName; } catch { n = ""; }
      procNames[pid] = n;
    }
    return n;
  }
  static bool Running(params string[] names) {
    foreach (var name in names) {
      var ps = Process.GetProcessesByName(name);
      bool any = ps.Length > 0;
      foreach (var p in ps) p.Dispose();
      if (any) return true;
    }
    return false;
  }
  // Sin ventana de consola: se escribe directamente en la salida estándar (UTF-8). Si Pal se cierra, falla y el proceso termina.
  static StreamWriter stdout;
  static void Emit(string line) {
    try { stdout.WriteLine(line); stdout.Flush(); } catch (IOException) { Environment.Exit(0); }
  }

  static void Main() {
    W.SetProcessDPIAware();
    stdout = new StreamWriter(Console.OpenStandardOutput(), new UTF8Encoding(false));
    string[] SHELL = { "Progman", "WorkerW", "Shell_TrayWnd", "Shell_SecondaryTrayWnd" };
    string trackFile = Environment.GetEnvironmentVariable("CLAWD_TRACK");
    if (string.IsNullOrEmpty(trackFile)) trackFile = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), ".clawd-flotante", "track.txt");
    string lastFg = "", lastMedia = "", lastTrack = "";
    uint lastClip = W.GetClipboardSequenceNumber();
    int lastClaude = -1, typeHits = 0, prtAt = -1000;
    long tick = 0;
    // Si Pal se cierra, la salida se rompe y este proceso termina solo
    while (true) {
      tick++;
      try {
        // ---- ventana activa ----
        IntPtr h = W.GetForegroundWindow();
        if (h != IntPtr.Zero) {
          var r = W.Rect(h);
          uint pid; W.GetWindowThreadProcessId(h, out pid);
          var sb = new StringBuilder(256); W.GetWindowText(h, sb, 256);
          var cb = new StringBuilder(128); W.GetClassName(h, cb, 128);
          var mi = new W.MONITORINFO(); mi.cbSize = 40;
          W.GetMonitorInfo(W.MonitorFromWindow(h, 2), ref mi);
          string cls = cb.ToString();
          bool isShell = Array.IndexOf(SHELL, cls) >= 0;
          bool zoomed = W.IsZoomed(h), min = W.IsIconic(h);   // maximizada no es pantalla completa
          bool full = !isShell && !zoomed && r.L <= mi.rcMonitor.L && r.T <= mi.rcMonitor.T && r.R >= mi.rcMonitor.R && r.B >= mi.rcMonitor.B;
          string title = sb.ToString();
          string key = h.ToInt64() + "|" + title + "|" + r.L + "," + r.T + "," + r.R + "," + r.B + "|" + full + "|" + min;
          if (key != lastFg) {
            lastFg = key;
            Emit(new J().S("t", "fg").N("id", h.ToInt64()).S("app", ProcName(pid)).S("title", title).S("cls", cls).B("shell", isShell)
              .N("x", r.L).N("y", r.T).N("w", r.R - r.L).N("h", r.B - r.T).B("full", full).B("max", zoomed).B("min", min).ToString());
          }
        }
      } catch { }

      try {
        // ---- tecleo (solo intensidad: hubo o no hubo teclas, nunca cuáles) ----
        if (W.AnyKey()) typeHits++;
        if (W.PrintScreen()) prtAt = (int)tick;
        if (tick % 10 == 0) { Emit(new J().S("t", "type").N("n", typeHits).ToString()); typeHits = 0; }
        if (tick % 25 == 0) {
          var li = new W.LASTINPUTINFO(); li.cbSize = 8; W.GetLastInputInfo(ref li);
          Emit(new J().S("t", "idle").N("s", (long)((uint)Environment.TickCount - li.dwTime) / 1000).ToString());
        }
      } catch { }

      try {
        // ---- portapapeles: solo cuenta como captura si se usó ImpPnt o la herramienta de recortes ----
        uint seq = W.GetClipboardSequenceNumber();
        if (seq != lastClip) {
          lastClip = seq;
          bool snip = Running("ScreenClippingHost", "SnippingTool", "ScreenSketch");
          Emit(new J().S("t", "clip").N("seq", seq).B("shot", snip || (tick - prtAt) < 25).ToString());
        }
      } catch { }

      try {
        // ---- ventana en la que Pal está subido (Pal escribe su id en track.txt) ----
        long tid = 0;
        if (File.Exists(trackFile)) long.TryParse(File.ReadAllText(trackFile).Trim(), out tid);
        if (tid != 0) {
          var th = new IntPtr(tid);
          var tr = W.Rect(th);
          bool exists = W.IsWindow(th) && W.IsWindowVisible(th), tmin = W.IsIconic(th), tmax = W.IsZoomed(th);
          string tkey = tid + "|" + exists + "|" + tr.L + "," + tr.T + "," + tr.R + "," + tr.B + "|" + tmin + "|" + tmax;
          if (tkey != lastTrack) {
            lastTrack = tkey;
            Emit(new J().S("t", "track").N("id", tid).B("exists", exists).N("x", tr.L).N("y", tr.T).N("w", tr.R - tr.L).N("h", tr.B - tr.T).B("min", tmin).B("max", tmax).ToString());
          }
        } else lastTrack = "";
      } catch { }

      // ---- batería (cada 30 s) ----
      if (tick % 150 == 1) {
        try {
          W.SYSTEM_POWER_STATUS ps;
          if (W.GetSystemPowerStatus(out ps)) {
            bool has = ps.BatteryFlag != 128 && ps.BatteryFlag != 255;   // 128 = sin batería, 255 = desconocido
            int pct = ps.BatteryLifePercent == 255 ? 0 : ps.BatteryLifePercent;
            Emit(new J().S("t", "bat").B("has", has).N("pct", pct).B("ac", ps.ACLineStatus == 1).ToString());
          }
        } catch { }
      }

      // ---- app de Claude abierta (cada 5 s): "abierta" = con una ventana visible ----
      if (tick % 25 == 3) {
        try {
          bool on = false;
          foreach (var p in Process.GetProcessesByName("claude")) { if (!on && p.MainWindowHandle != IntPtr.Zero) on = true; p.Dispose(); }
          int v = on ? 1 : 0;
          if (v != lastClaude) { lastClaude = v; Emit(new J().S("t", "claude").B("on", on).ToString()); }
        } catch { }
      }

      // ---- música (cada 1,6 s; latido cada 15 s) ----
      if (tick % 8 == 0) {
        string mj = Media.Now();
        if (mj != lastMedia || tick % 75 == 0) { Emit(mj); lastMedia = mj; }
      }

      Thread.Sleep(200);
    }
  }
}
