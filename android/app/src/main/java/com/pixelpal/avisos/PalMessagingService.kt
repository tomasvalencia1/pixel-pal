package com.pixelpal.avisos

import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage

// Recibe los avisos de Pal. Con la app cerrada, Android los muestra solo (con el canal y el icono indicados);
// con la app abierta llegan aquí y se muestran igual.
class PalMessagingService : FirebaseMessagingService() {
    override fun onMessageReceived(msg: RemoteMessage) {
        val d = msg.data
        val title = msg.notification?.title ?: d["title"] ?: "Pixel Pal"
        val body = msg.notification?.body ?: d["body"] ?: ""
        Notifs.show(this, d["kind"] ?: "done", title, body, d["session"])
    }

    // Se usan temas, no tokens: no hace falta enviar el token a ningún sitio
    override fun onNewToken(token: String) {}
}
