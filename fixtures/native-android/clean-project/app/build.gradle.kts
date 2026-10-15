plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "com.fieldnotes.app"
    compileSdk = 36

    defaultConfig {
        applicationId = "com.fieldnotes.app"
        minSdk = 26
        targetSdk = 36
        versionCode = 9
        versionName = "1.0.9"
    }

    buildTypes {
        getByName("release") {
            isMinifyEnabled = true
            signingConfig = signingConfigs.getByName("release")
        }
    }
}
