package com.pixelpal.avisos

import android.content.Context
import android.net.Uri
import com.google.firebase.messaging.FirebaseMessaging

// Emparejar con un Pal = suscribirse al "tema" secreto de Firebase que Pal muestra en su QR.
// El PC publica en ese tema y Firebase lo entrega a este móvil, esté donde esté.
object Pairing {
    private const val PREFS = "pal"
    private val TOPIC = Regex("^pp_[0-9a-f]{18,40}$")

    data class Pair(val topic: String, val name: String)

    fun current(ctx: Context): Pair? {
        val p = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val t = p.getString("topic", null) ?: return null
        return Pair(t, p.getString("name", null) ?: "tu PC")
    }

    // Acepta el enlace del QR (pixelpal://pair?t=pp_…&n=…) o el código escrito a mano (con o sin espacios)
    fun parse(text: String): Pair? {
        val raw = text.trim()
        if (raw.startsWith("pixelpal://", ignoreCase = true)) {
            val uri = Uri.parse(raw)
            val t = uri.getQueryParameter("t")?.lowercase() ?: return null
            return if (TOPIC.matches(t)) Pair(t, uri.getQueryParameter("n")?.take(40) ?: "tu PC") else null
        }
        val code = raw.lowercase().replace(Regex("[\\s-]"), "")
        val t = if (code.startsWith("pp_")) code else "pp_$code"
        return if (TOPIC.matches(t)) Pair(t, "tu PC") else null
    }

    fun pair(ctx: Context, pair: Pair, done: (Boolean, String?) -> Unit) {
        val old = current(ctx)
        val fm = FirebaseMessaging.getInstance()
        if (old != null && old.topic != pair.topic) fm.unsubscribeFromTopic(old.topic)
        fm.subscribeToTopic(pair.topic).addOnCompleteListener { task ->
            if (task.isSuccessful) {
                ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
                    .putString("topic", pair.topic).putString("name", pair.name).apply()
                done(true, null)
            } else done(false, task.exception?.message)
        }
    }

    fun unpair(ctx: Context, done: () -> Unit) {
        val old = current(ctx)
        ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().clear().apply()
        if (old == null) return done()
        FirebaseMessaging.getInstance().unsubscribeFromTopic(old.topic).addOnCompleteListener { done() }
    }
}
