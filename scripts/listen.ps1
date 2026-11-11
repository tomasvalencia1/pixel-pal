# Escucha una frase por el micrófono con el reconocimiento de voz de Windows (sin internet) y la devuelve como JSON.
# Solo se ejecuta cuando pulsas el botón del micrófono de Clawd, y se cierra al terminar la frase.
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
function Out($o) { [Console]::Out.WriteLine(($o | ConvertTo-Json -Compress)); }
try {
  Add-Type -AssemblyName System.Speech
  $rec = [System.Speech.Recognition.SpeechRecognitionEngine]::InstalledRecognizers() | Where-Object { $_.Culture.Name -like 'es*' } | Select-Object -First 1
  if (-not $rec) { Out @{ ok = $false; error = 'noSpanish' }; exit 0 }
  $eng = New-Object System.Speech.Recognition.SpeechRecognitionEngine $rec
  $eng.LoadGrammar((New-Object System.Speech.Recognition.DictationGrammar))
  try { $eng.SetInputToDefaultAudioDevice() } catch { Out @{ ok = $false; error = 'noMic' }; exit 0 }
  $eng.InitialSilenceTimeout = [TimeSpan]::FromSeconds(6)
  $eng.BabbleTimeout = [TimeSpan]::FromSeconds(4)
  $eng.EndSilenceTimeout = [TimeSpan]::FromMilliseconds(900)
  $eng.EndSilenceTimeoutAmbiguous = [TimeSpan]::FromMilliseconds(1200)
  Out @{ listening = $true }
  $r = $eng.Recognize([TimeSpan]::FromSeconds(15))
  $eng.Dispose()
  if ($r -and $r.Text) { Out @{ ok = $true; text = $r.Text; confidence = [math]::Round($r.Confidence, 2) } }
  else { Out @{ ok = $false; error = 'silence' } }
} catch {
  Out @{ ok = $false; error = 'fail'; detail = $_.Exception.Message }
}
