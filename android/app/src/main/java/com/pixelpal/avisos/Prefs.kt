package com.pixelpal.avisos

import android.content.Context

// Preferencias del móvil: cómo avisar de cada tipo (notificación o alarma), voz, y el último Pal que mandó el PC
object Prefs {
    private const val FILE = "pal_prefs"
    val KINDS = listOf("done", "waiting", "error")

    private fun p(ctx: Context) = ctx.getSharedPreferences(FILE, Context.MODE_PRIVATE)

    // Por defecto todo es alarma (se puede cambiar en la app)
    fun isAlarm(ctx: Context, kind: String) = p(ctx).getBoolean("alarm_$kind", true)
    fun setAlarm(ctx: Context, kind: String, on: Boolean) = p(ctx).edit().putBoolean("alarm_$kind", on).apply()

    // Sonido de alarma: apagado por defecto (Pal solo lo dice en voz alta)
    fun alarmSound(ctx: Context) = p(ctx).getBoolean("alarm_sound", false)
    fun setAlarmSound(ctx: Context, on: Boolean) = p(ctx).edit().putBoolean("alarm_sound", on).apply()

    fun voice(ctx: Context) = p(ctx).getBoolean("voice", true)
    fun setVoice(ctx: Context, on: Boolean) = p(ctx).edit().putBoolean("voice", on).apply()

    // El personaje y la ropa con los que dibujar a Pal (llegan con cada aviso)
    fun saveLook(ctx: Context, outfit: String?, edition: String?) {
        val e = p(ctx).edit()
        if (!outfit.isNullOrBlank()) e.putString("outfit", outfit)
        if (!edition.isNullOrBlank()) e.putString("edition", edition)
        e.apply()
    }
    fun outfit(ctx: Context): String = p(ctx).getString("outfit", null) ?: """{"skin":"clawd","hat":"none","glasses":"none","neck":"none"}"""
    fun edition(ctx: Context): String = p(ctx).getString("edition", null) ?: "personal"
}
