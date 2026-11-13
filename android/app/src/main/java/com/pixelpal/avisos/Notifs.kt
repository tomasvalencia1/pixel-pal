package com.pixelpal.avisos

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.provider.Settings
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat

object Notifs {
    const val NORMAL = "pal"          // Claude terminó
    const val URGENT = "pal_urgent"   // necesita permiso, errores
    const val ALARM = "pal_alarm_voz"   // ⏰ modo alarma: pantalla completa con Pal (sin sonido: Pal habla)

    fun channels(ctx: Context) {
        val nm = ctx.getSystemService(NotificationManager::class.java)
        nm.deleteNotificationChannel("pal_alarm")   // el canal antiguo sonaba como una alarma
        nm.createNotificationChannel(NotificationChannel(NORMAL, "Claude terminó", NotificationManager.IMPORTANCE_DEFAULT).apply {
            description = "Cuando una sesión de Claude acaba su trabajo"
        })
        nm.createNotificationChannel(NotificationChannel(URGENT, "Necesita tu atención", NotificationManager.IMPORTANCE_HIGH).apply {
            description = "Cuando Claude necesita permiso o se detiene por un error"
            enableVibration(true)
        })
        nm.createNotificationChannel(NotificationChannel(ALARM, "Alarmas de Pal", NotificationManager.IMPORTANCE_HIGH).apply {
            description = "Pal aparece en pantalla completa y suena como una alarma"
            enableVibration(true)
            setSound(null, null)   // el sonido lo pone la pantalla de alarma (voz de Pal, o alarma si la activas)
            setBypassDnd(true)
            lockscreenVisibility = android.app.Notification.VISIBILITY_PUBLIC
        })
    }

    fun allowed(ctx: Context): Boolean =
        Build.VERSION.SDK_INT < 33 ||
            ContextCompat.checkSelfPermission(ctx, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED

    // Android 14+: las apps que no son reloj/llamadas necesitan que el usuario permita la pantalla completa
    fun fullScreenAllowed(ctx: Context): Boolean =
        Build.VERSION.SDK_INT < 34 || ctx.getSystemService(NotificationManager::class.java).canUseFullScreenIntent()

    // «Mostrar sobre otras apps»: deja abrir la alarma aunque estés usando el móvil
    fun overlayAllowed(ctx: Context): Boolean = Settings.canDrawOverlays(ctx)

    fun show(ctx: Context, kind: String, title: String, body: String, tag: String?) {
        channels(ctx)
        if (Prefs.isAlarm(ctx, kind)) alarm(ctx, kind, title, body, tag) else notify(ctx, kind, title, body, tag)
    }

    private fun notify(ctx: Context, kind: String, title: String, body: String, tag: String?) {
        if (!allowed(ctx)) return
        val urgent = kind == "waiting" || kind == "error"
        val open = PendingIntent.getActivity(ctx, 0, Intent(ctx, MainActivity::class.java), PendingIntent.FLAG_IMMUTABLE)
        val n = NotificationCompat.Builder(ctx, if (urgent) URGENT else NORMAL)
            .setSmallIcon(R.drawable.ic_stat_pal)
            .setColor(ContextCompat.getColor(ctx, if (urgent) R.color.alert else R.color.pal))
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(NotificationCompat.BigTextStyle().bigText(body))
            .setPriority(if (urgent) NotificationCompat.PRIORITY_HIGH else NotificationCompat.PRIORITY_DEFAULT)
            .setAutoCancel(true)
            .setContentIntent(open)
            .build()
        post(ctx, tag, n)
    }

    private fun alarm(ctx: Context, kind: String, title: String, body: String, tag: String?) {
        val i = AlarmActivity.intent(ctx, kind, title, body, tag)
        // Con permiso para mostrarse sobre otras apps, la alarma se abre directamente, estés haciendo lo que estés haciendo
        if (overlayAllowed(ctx)) runCatching { ctx.startActivity(i) }
        // Siempre se publica también la notificación a pantalla completa: con el móvil bloqueado abre la alarma,
        // y si la estás usando aparece arriba con su sonido (tócala para ver a Pal)
        if (!allowed(ctx)) return
        val full = PendingIntent.getActivity(ctx, (tag ?: "pal").hashCode(), i, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
        val n = NotificationCompat.Builder(ctx, ALARM)
            .setSmallIcon(R.drawable.ic_stat_pal)
            .setColor(ContextCompat.getColor(ctx, if (kind == "done") R.color.pal else R.color.alert))
            .setContentTitle(title)
            .setContentText(body)
            .setCategory(NotificationCompat.CATEGORY_ALARM)
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setFullScreenIntent(full, true)
            .setContentIntent(full)
            .setAutoCancel(true)
            .build()
        post(ctx, tag, n)
    }

    private fun post(ctx: Context, tag: String?, n: android.app.Notification) {
        try {
            // Un aviso por sesión: el nuevo sustituye al anterior de la misma sesión
            NotificationManagerCompat.from(ctx).notify(tag ?: "pal", 1, n)
        } catch (_: SecurityException) { /* sin permiso de notificaciones */ }
    }
}
