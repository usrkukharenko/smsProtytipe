import java.util.Properties

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

// Resolve a value from gradle.properties first, then env var, else null.
fun propOrEnv(name: String): String? {
    val fromProp = (project.findProperty(name) as String?)?.takeIf { it.isNotBlank() }
    if (fromProp != null) return fromProp
    return System.getenv(name)?.takeIf { it.isNotBlank() }
}

android {
    namespace = "com.smsvxod.gateway"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.smsvxod.gateway"
        minSdk = 26
        targetSdk = 35
        versionCode = 1
        versionName = "1.0"
    }

    // To create a real release keystore, run:
    //   keytool -genkey -v -keystore release.keystore -alias smsvxod \
    //           -keyalg RSA -keysize 2048 -validity 10000
    // Then set in gradle.properties (or env vars) RELEASE_STORE_FILE,
    // RELEASE_STORE_PASSWORD, RELEASE_KEY_ALIAS, RELEASE_KEY_PASSWORD.
    signingConfigs {
        create("release") {
            val storeFilePath = propOrEnv("RELEASE_STORE_FILE")
            val storePass = propOrEnv("RELEASE_STORE_PASSWORD")
            val alias = propOrEnv("RELEASE_KEY_ALIAS")
            val keyPass = propOrEnv("RELEASE_KEY_PASSWORD")

            if (storeFilePath != null && storePass != null && alias != null && keyPass != null) {
                storeFile = file(storeFilePath)
                storePassword = storePass
                keyAlias = alias
                keyPassword = keyPass
            } else {
                // Fallback to debug keystore so the release task is still runnable for tests.
                val debugStore = file("${System.getProperty("user.home")}/.android/debug.keystore")
                if (debugStore.exists()) {
                    storeFile = debugStore
                    storePassword = "android"
                    keyAlias = "androiddebugkey"
                    keyPassword = "android"
                }
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            signingConfig = signingConfigs.getByName("release")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions {
        jvmTarget = "17"
    }
    buildFeatures {
        viewBinding = true
    }
}

dependencies {
    implementation("androidx.core:core-ktx:1.13.1")
    implementation("androidx.appcompat:appcompat:1.7.0")
    implementation("com.google.android.material:material:1.12.0")
    implementation("androidx.constraintlayout:constraintlayout:2.1.4")
    implementation("androidx.lifecycle:lifecycle-service:2.8.6")
    implementation("androidx.work:work-runtime-ktx:2.9.1")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.8.1")
    implementation("com.squareup.okhttp3:okhttp:4.12.0")
}
