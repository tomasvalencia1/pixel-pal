package com.pixelpal.avisos

import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage

// Recibe los avisos de Pal. El PC manda mensajes «solo de datos» con prioridad alta, así esta app decide siempre
// cómo avisar (notificación o alarma con Pal en pantalla), también con la app cerrada.
class PalMessagingService : FirebaseMessagingService() {
    override fun onMessageReceived(msg: RemoteMessage) {
        val d = msg.data
        // el personaje y la ropa que lleva Pal ahora mismo en el PC
        Prefs.saveLook(this, d["outfit"], d["edition"])
        val title = msg.notification?.title ?: d["title"] ?: "Pixel Pal"
        val body = msg.notification?.body ?: d["body"] ?: ""
        Notifs.show(this, d["kind"] ?: "done", title, body, d["session"])
    }

    // Se usan temas, no tokens: no hace falta enviar el token a ningún sitio
    override fun onNewToken(token: String) {}
}
