plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}
// Firebase: necesita app/google-services.json (se descarga de la consola de Firebase; no va en git)
if (file("google-services.json").exists()) apply(plugin = "com.google.gms.google-services")

android {
    namespace = "com.pixelpal.avisos"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.pixelpal.avisos"
        minSdk = 26          // Android 8.0 o superior
        targetSdk = 35
        versionCode = 1
        versionName = "1.0"
        resourceConfigurations += listOf("es")
    }

    buildTypes {
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
            // Uso personal: se firma con la llave de depuración de este PC
            signingConfig = signingConfigs.getByName("debug")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }

    packaging {
        resources { excludes += setOf("/META-INF/{AL2.0,LGPL2.1}", "/META-INF/*.kotlin_module", "DebugProbesKt.bin") }
    }
}

dependencies {
    implementation("androidx.core:core-ktx:1.15.0")
    implementation("androidx.appcompat:appcompat:1.7.0")
    implementation("com.google.android.material:material:1.12.0")
    // Avisos que llegan aunque la app esté cerrada
    implementation("com.google.firebase:firebase-messaging:25.0.1")
    // Lector de códigos QR de Google Play (no necesita permiso de cámara)
    implementation("com.google.android.gms:play-services-code-scanner:16.1.0")
}
