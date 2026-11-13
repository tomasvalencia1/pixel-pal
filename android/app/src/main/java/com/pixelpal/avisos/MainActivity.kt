package com.pixelpal.avisos

import android.Manifest
import android.content.Intent
import android.os.Build
import android.os.Bundle
import android.net.Uri
import android.os.PowerManager
import android.provider.Settings
import android.text.InputType
import android.widget.Button
import android.widget.EditText
import android.widget.TextView
import android.widget.Toast
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import com.google.android.material.materialswitch.MaterialSwitch
import com.google.android.gms.common.moduleinstall.ModuleInstall
import com.google.android.gms.common.moduleinstall.ModuleInstallRequest
import com.google.mlkit.vision.barcode.common.Barcode
import com.google.mlkit.vision.codescanner.GmsBarcodeScannerOptions
import com.google.mlkit.vision.codescanner.GmsBarcodeScanning

class MainActivity : AppCompatActivity() {
    private val askNotifs = registerForActivityResult(ActivityResultContracts.RequestPermission()) { render() }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)
        Notifs.channels(this)
        findViewById<Button>(R.id.scan).setOnClickListener { scan() }
        findViewById<Button>(R.id.code).setOnClickListener { typeCode() }
        findViewById<Button>(R.id.unpair).setOnClickListener { Pairing.unpair(this) { render(); toast("Desemparejado") } }
        findViewById<Button>(R.id.notifs).setOnClickListener {
            if (!Notifs.allowed(this) && Build.VERSION.SDK_INT >= 33) askNotifs.launch(Manifest.permission.POST_NOTIFICATIONS)
            else startActivity(Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE, packageName))
        }
        findViewById<Button>(R.id.test).setOnClickListener {
            Notifs.show(this, "done", "Pixel Pal", "Así se verán los avisos de Pal 🦀", "prueba")
        }
        // ⏰ notificación o alarma para cada tipo de aviso
        mapOf(R.id.swDone to "done", R.id.swWaiting to "waiting", R.id.swError to "error").forEach { (id, kind) ->
            findViewById<MaterialSwitch>(id).apply {
                isChecked = Prefs.isAlarm(this@MainActivity, kind)
                setOnCheckedChangeListener { _, on -> Prefs.setAlarm(this@MainActivity, kind, on) }
            }
        }
        findViewById<MaterialSwitch>(R.id.swVoice).apply {
            isChecked = Prefs.voice(this@MainActivity)
            setOnCheckedChangeListener { _, on -> Prefs.setVoice(this@MainActivity, on) }
        }
        findViewById<Button>(R.id.testAlarm).setOnClickListener {
            startActivity(AlarmActivity.intent(this, "test", "Pixel Pal", "¡Hola! Así te avisaré cuando termine Claude", "prueba"))
        }
        findViewById<Button>(R.id.permFull).setOnClickListener {
            if (Build.VERSION.SDK_INT >= 34) startActivity(Intent(Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT, Uri.parse("package:$packageName")))
        }
        findViewById<Button>(R.id.permOverlay).setOnClickListener {
            startActivity(Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, Uri.parse("package:$packageName")))
        }
        findViewById<Button>(R.id.permBattery).setOnClickListener {
            @android.annotation.SuppressLint("BatteryLife")
            val i = Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, Uri.parse("package:$packageName"))
            runCatching { startActivity(i) }.onFailure { startActivity(Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS)) }
        }
        if (Build.VERSION.SDK_INT >= 33 && !Notifs.allowed(this)) askNotifs.launch(Manifest.permission.POST_NOTIFICATIONS)
        handle(intent)
        render()
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        handle(intent)
    }

    override fun onResume() {
        super.onResume()
        render()
    }

    // Abierta desde el enlace del QR (pixelpal://pair?t=…)
    private fun handle(intent: Intent?) {
        val data = intent?.data ?: return
        intent.data = null
        pairWith(data.toString())
    }

    private fun scan() {
        val scanner = GmsBarcodeScanning.getClient(this, GmsBarcodeScannerOptions.Builder().setBarcodeFormats(Barcode.FORMAT_QR_CODE).build())
        // El lector lo instala Google Play la primera vez; si aún no está, se pide
        ModuleInstall.getClient(this).installModules(ModuleInstallRequest.newBuilder().addApi(scanner).build())
        scanner.startScan()
            .addOnSuccessListener { code -> pairWith(code.rawValue ?: "") }
            .addOnFailureListener { toast("No se pudo abrir el lector: escribe el código a mano") }
    }

    private fun typeCode() {
        val input = EditText(this).apply {
            hint = "pp_…"
            inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_FLAG_NO_SUGGESTIONS
        }
        AlertDialog.Builder(this)
            .setTitle("Código de emparejamiento")
            .setMessage("Está debajo del QR en Pal → Ajustes → Avisos al móvil")
            .setView(input)
            .setPositiveButton("Emparejar") { _, _ -> pairWith(input.text.toString()) }
            .setNegativeButton("Cancelar", null)
            .show()
    }

    private fun pairWith(text: String) {
        val pair = Pairing.parse(text) ?: return toast("Ese código no es de Pixel Pal")
        findViewById<TextView>(R.id.status).text = "Emparejando…"
        Pairing.pair(this, pair) { ok, err ->
            runOnUiThread {
                render()
                toast(if (ok) "¡Listo! Te avisaré cuando termine Claude" else "No se pudo emparejar: ${err ?: "sin conexión"}")
            }
        }
    }

    private fun render() {
        val p = Pairing.current(this)
        findViewById<TextView>(R.id.status).text =
            if (p != null) "✅ Emparejado con ${p.name}\nTe avisaré cuando Claude termine, necesite permiso o se detenga."
            else "Sin emparejar.\nEn tu PC: clic derecho sobre Pal → 📱 Avisos al móvil, y escanea el QR."
        findViewById<Button>(R.id.unpair).isEnabled = p != null
        findViewById<Button>(R.id.notifs).text =
            if (Notifs.allowed(this)) "🔔 Ajustes de notificaciones" else "🔔 Permitir notificaciones"
        // permisos de la alarma: ✓ cuando ya están
        val full = Notifs.fullScreenAllowed(this)
        val overlay = Notifs.overlayAllowed(this)
        val battery = getSystemService(PowerManager::class.java).isIgnoringBatteryOptimizations(packageName)
        findViewById<Button>(R.id.permFull).apply {
            visibility = if (Build.VERSION.SDK_INT >= 34) android.view.View.VISIBLE else android.view.View.GONE
            text = if (full) "✅ Pantalla completa permitida" else "📱 Permitir pantalla completa"
            isEnabled = !full
        }
        findViewById<Button>(R.id.permOverlay).apply {
            text = if (overlay) "✅ Puede mostrarse sobre otras apps" else "🪟 Mostrar sobre otras apps (opcional)"
            isEnabled = !overlay
        }
        findViewById<Button>(R.id.permBattery).apply {
            text = if (battery) "✅ La app no se duerme" else "🔋 No dormir la app (batería)"
            isEnabled = !battery
        }
        findViewById<TextView>(R.id.warn).visibility =
            if (Notifs.allowed(this)) android.view.View.GONE else android.view.View.VISIBLE
    }

    private fun toast(t: String) = Toast.makeText(this, t, Toast.LENGTH_LONG).show()
}
