package com.pixelpal.avisos

import android.annotation.SuppressLint
import android.app.NotificationManager
import android.content.Context
import android.content.Intent
import android.media.AudioAttributes
import android.media.MediaPlayer
import android.media.RingtoneManager
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import android.speech.tts.TextToSpeech
import android.speech.tts.UtteranceProgressListener
import android.view.WindowManager
import android.webkit.WebView
import android.widget.Button
import androidx.appcompat.app.AppCompatActivity
import org.json.JSONObject
import java.util.Locale

// ⏰ Alarma: pantalla completa (también con el móvil bloqueado) con el mismo Pal del PC, animado,
// contándote el aviso en un bocadillo y en voz alta. Con el sonido de alarma activado, suena hasta que pulses «Vale».
class AlarmActivity : AppCompatActivity() {
    companion object {
        const val MAX_RING_MS = 90_000L   // la alarma se calla sola al minuto y medio (la pantalla sigue)

        fun intent(ctx: Context, kind: String, title: String, body: String, tag: String?): Intent =
            Intent(ctx, AlarmActivity::class.java)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
                .putExtra("kind", kind).putExtra("title", title).putExtra("body", body).putExtra("tag", tag)
    }

    private var player: MediaPlayer? = null
    private var vibrator: Vibrator? = null
    private var tts: TextToSpeech? = null
    private val handler = Handler(Looper.getMainLooper())

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        // encima de la pantalla de bloqueo y encendiéndola
        if (Build.VERSION.SDK_INT >= 27) { setShowWhenLocked(true); setTurnScreenOn(true) }
        else @Suppress("DEPRECATION") window.addFlags(WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON)
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        setContentView(R.layout.activity_alarm)
        findViewById<Button>(R.id.ok).setOnClickListener { finish() }
        findViewById<Button>(R.id.later).setOnClickListener { stopRinging() }
        show(intent)
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        stopRinging()
        show(intent)
    }

    @SuppressLint("SetJavaScriptEnabled")
    private fun show(i: Intent) {
        val kind = i.getStringExtra("kind") ?: "done"
        val title = i.getStringExtra("title") ?: "Pixel Pal"
        val body = i.getStringExtra("body") ?: ""
        // la notificación ya no hace falta: la alarma está a la vista
        getSystemService(NotificationManager::class.java).cancel(i.getStringExtra("tag") ?: "pal", 1)

        // Pal animado: la página usa el mismo dibujo que el PC (assets/pal)
        val data = JSONObject()
            .put("kind", kind).put("title", title).put("body", body)
            .put("outfit", runCatching { JSONObject(Prefs.outfit(this)) }.getOrElse { JSONObject() })
            .put("edition", Prefs.edition(this))
        findViewById<WebView>(R.id.pal).apply {
            settings.javaScriptEnabled = true
            setBackgroundColor(0xFF1C1A18.toInt())
            loadUrl("file:///android_asset/pal/alarm.html#" + android.net.Uri.encode(data.toString()))
        }
        findViewById<Button>(R.id.later).apply { text = getString(R.string.silence); isEnabled = true }

        // Por defecto: una vibración corta y Pal lo lee en voz alta. El sonido de alarma solo si lo activas.
        val sound = Prefs.alarmSound(this)
        vibrate(repeat = sound)
        if (Prefs.voice(this)) speak("$title. $body") { if (sound) ring() } else if (sound) ring()
        handler.postDelayed({ stopRinging() }, MAX_RING_MS)
    }

    private fun speak(text: String, then: () -> Unit) {
        tts = TextToSpeech(this) { status ->
            val t = tts
            if (status != TextToSpeech.SUCCESS || t == null) { runOnUiThread(then); return@TextToSpeech }
            t.language = Locale("es", "ES")
            t.setAudioAttributes(AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_ALARM).setContentType(AudioAttributes.CONTENT_TYPE_SPEECH).build())
            t.setOnUtteranceProgressListener(object : UtteranceProgressListener() {
                override fun onStart(id: String?) {}
                override fun onDone(id: String?) { runOnUiThread(then) }
                @Deprecated("Deprecated in Java") override fun onError(id: String?) { runOnUiThread(then) }
            })
            t.speak(text, TextToSpeech.QUEUE_FLUSH, null, "pal")
        }
    }

    private fun ring() {
        if (isFinishing) return
        val uri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM)
            ?: RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION) ?: return
        player = runCatching {
            MediaPlayer().apply {
                setAudioAttributes(AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_ALARM).setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build())
                setDataSource(this@AlarmActivity, uri)
                isLooping = true
                prepare()
                start()
            }
        }.getOrNull()
    }

    private fun vibrate(repeat: Boolean) {
        val v = if (Build.VERSION.SDK_INT >= 31) getSystemService(VibratorManager::class.java).defaultVibrator
        else @Suppress("DEPRECATION") getSystemService(Vibrator::class.java)
        vibrator = v
        v?.vibrate(VibrationEffect.createWaveform(longArrayOf(0, 600, 400, 600, 1200), if (repeat) 0 else -1))
    }

    private fun stopRinging() {
        handler.removeCallbacksAndMessages(null)
        runCatching { player?.stop(); player?.release() }
        player = null
        vibrator?.cancel()
        tts?.stop(); tts?.shutdown(); tts = null
        findViewById<Button>(R.id.later).isEnabled = false
    }

    override fun onDestroy() {
        stopRinging()
        super.onDestroy()
    }
}

