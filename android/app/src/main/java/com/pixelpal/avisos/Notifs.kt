package com.pixelpal.avisos

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat

object Notifs {
    const val NORMAL = "pal"          // Claude terminó
    const val URGENT = "pal_urgent"   // necesita permiso, errores

    fun channels(ctx: Context) {
        val nm = ctx.getSystemService(NotificationManager::class.java)
        nm.createNotificationChannel(NotificationChannel(NORMAL, "Claude terminó", NotificationManager.IMPORTANCE_DEFAULT).apply {
            description = "Cuando una sesión de Claude acaba su trabajo"
        })
        nm.createNotificationChannel(NotificationChannel(URGENT, "Necesita tu atención", NotificationManager.IMPORTANCE_HIGH).apply {
            description = "Cuando Claude necesita permiso o se detiene por un error"
            enableVibration(true)
        })
    }

    fun allowed(ctx: Context): Boolean =
        Build.VERSION.SDK_INT < 33 ||
            ContextCompat.checkSelfPermission(ctx, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED

    fun show(ctx: Context, kind: String, title: String, body: String, tag: String?) {
        if (!allowed(ctx)) return
        channels(ctx)
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
        try {
            // Un aviso por sesión: el nuevo sustituye al anterior de la misma sesión
            NotificationManagerCompat.from(ctx).notify(tag ?: "pal", 1, n)
        } catch (_: SecurityException) { /* sin permiso de notificaciones */ }
    }
}
