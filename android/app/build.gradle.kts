// The Android app: a full-screen web view that carries the game's page files (client/, shared/) as app assets and
// talks to whichever game server the player types in. No disc or cartridge content is packed; the player picks
// their own copy with the page's file button, as in a browser.
plugins { id("com.android.application") }

android {
    namespace = "pacvs.app"
    compileSdk = 35
    defaultConfig {
        applicationId = "pacvs.app"
        minSdk = 24
        targetSdk = 35
        versionCode = 1
        versionName = "0.1"
    }
    buildTypes { release { isMinifyEnabled = false } }
    compileOptions { sourceCompatibility = JavaVersion.VERSION_17; targetCompatibility = JavaVersion.VERSION_17 }
    sourceSets["main"].assets.srcDir(layout.buildDirectory.dir("web"))
}

dependencies {
    implementation("androidx.webkit:webkit:1.12.1")
    implementation("org.nanohttpd:nanohttpd-websocket:2.3.1")   // the phone's web server while it hosts (HostServer.java)
}

// The page files come straight from the game folder at build time, so the app never drifts from the web version.
val web = layout.buildDirectory.dir("web")
val copyWeb by tasks.registering(Copy::class) {
    val game = rootProject.projectDir.parentFile
    into(web)
    from(game.resolve("client")) { into("client") }
    from(game.resolve("shared")) { into("shared") }
    from(game.resolve("client/index.html"))
    from(game.resolve("client/soundlab.html"))
}
tasks.named("preBuild") { dependsOn(copyWeb) }
