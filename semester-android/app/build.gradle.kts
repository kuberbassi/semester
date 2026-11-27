import java.io.File

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.plugin.compose")
}

// Read bundled Google Drive OAuth credentials at build time (same Google Cloud project as Windows Desktop
// so Android and Desktop share the exact same private Drive appDataFolder with 1-click sign-in).
fun readDotEnvValue(key: String): String {
    System.getenv(key)?.trim()?.takeIf { it.isNotEmpty() }?.let { return it }
    val candidates = listOf(
        File(rootDir.parentFile, ".env"),
        File(rootDir.parentFile, "src-tauri/.env"),
        File(rootDir, "local.properties"),
    )
    for (file in candidates) {
        if (!file.exists()) continue
        file.readLines().forEach { line ->
            val trimmed = line.trim()
            if (trimmed.isEmpty() || trimmed.startsWith("#")) return@forEach
            val idx = trimmed.indexOf('=')
            if (idx > 0 && trimmed.substring(0, idx).trim() == key) {
                return trimmed.substring(idx + 1).trim().trim('"', '\'')
            }
        }
    }
    return ""
}

fun escapeBuildConfig(raw: String): String =
    raw.replace("\\", "\\\\").replace("\"", "\\\"")

val googleOAuthClientId = readDotEnvValue("GOOGLE_DESKTOP_CLIENT_ID")
val googleOAuthClientSecret = readDotEnvValue("GOOGLE_DESKTOP_CLIENT_SECRET")

android {
    namespace = "com.semester.app"
    compileSdk = 36

    defaultConfig {
        applicationId = "com.semester.app"
        minSdk = 26
        targetSdk = 35
        versionCode = 2
        versionName = "1.0.0"

        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
        ndk {
            abiFilters += listOf("arm64-v8a", "x86_64")
        }

        buildConfigField("String", "GOOGLE_OAUTH_CLIENT_ID", "\"${escapeBuildConfig(googleOAuthClientId)}\"")
        buildConfigField("String", "GOOGLE_OAUTH_CLIENT_SECRET", "\"${escapeBuildConfig(googleOAuthClientSecret)}\"")
    }

    buildTypes {
        release {
            // Signed locally so AOT-compiled 120Hz release builds install straight over USB
            signingConfig = signingConfigs.getByName("debug")
            isDebuggable = false
            isMinifyEnabled = false
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro",
            )
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_21
        targetCompatibility = JavaVersion.VERSION_21
    }

    buildFeatures {
        compose = true
        buildConfig = true
    }

    sourceSets {
        getByName("main") {
            jniLibs.directories.add("src/main/jniLibs")
        }
    }
}

dependencies {
    // Native core JNA bridge
    implementation("net.java.dev.jna:jna:5.14.0@aar")

    // Android Core, Lifecycle & Chrome Custom Tabs (1-Click Google OAuth2 PKCE)
    implementation("androidx.core:core-ktx:1.15.0")
    implementation("androidx.lifecycle:lifecycle-runtime-ktx:2.8.7")
    implementation("androidx.activity:activity-compose:1.9.3")
    implementation("androidx.browser:browser:1.8.0")

    // Jetpack Compose
    implementation(platform("androidx.compose:compose-bom:2024.11.00"))
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.ui:ui-graphics")
    implementation("androidx.compose.ui:ui-tooling-preview")
    implementation("androidx.compose.material3:material3")
    implementation("androidx.compose.material:material-icons-extended")
    implementation("androidx.compose.animation:animation")

    // Jetpack Glance (Home Screen Widget)
    implementation("androidx.glance:glance-appwidget:1.1.1")
    implementation("androidx.glance:glance-material3:1.1.1")

    // WorkManager (Background 2-Way Google Drive Sync)
    implementation("androidx.work:work-runtime-ktx:2.10.0")

    // OkHttp (Live IPU Portal + Google Drive REST + BYOK AI)
    implementation("com.squareup.okhttp3:okhttp:4.12.0")

    // Native Offline CameraX + ZXing QR Code Scanner (zero Google Play Services module download dependency)
    val cameraXVersion = "1.4.0"
    implementation("androidx.camera:camera-core:$cameraXVersion")
    implementation("androidx.camera:camera-camera2:$cameraXVersion")
    implementation("androidx.camera:camera-lifecycle:$cameraXVersion")
    implementation("androidx.camera:camera-view:$cameraXVersion")
    implementation("com.google.zxing:core:3.5.3")

    debugImplementation("androidx.compose.ui:ui-tooling")
    debugImplementation("androidx.compose.ui:ui-test-manifest")
}
