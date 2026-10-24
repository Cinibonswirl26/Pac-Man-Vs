package pacvs.app;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.view.View;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import androidx.webkit.WebViewAssetLoader;

import org.json.JSONObject;

import java.io.IOException;
import java.net.Inet4Address;
import java.net.InetAddress;
import java.net.NetworkInterface;
import java.net.SocketException;
import java.util.Collections;

/** One full-screen web view showing the game's own page from the app's assets. The page first asks whether to host
 *  a game on this Wi-Fi or join a friend's: hosting runs the room server inside the page and this app's own web
 *  server (HostServer) for friends to reach it; joining talks to whichever game server the player types in. The
 *  disc file comes through the page's file button and the system file picker. */
public class MainActivity extends Activity {
    private static final int PICK_FILE = 1;
    private static final String HOME = "http://appassets.androidplatform.net/";
    private WebView web;
    private ValueCallback<Uri[]> pendingPick;
    private HostServer host;   // while this phone hosts a game

    @Override protected void onCreate(Bundle saved) {
        super.onCreate(saved);
        web = new WebView(this);
        setContentView(web);
        web.setKeepScreenOn(true);
        web.setBackgroundColor(0xFF000000);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(true);
        s.setUseWideViewPort(true);
        s.setLoadWithOverviewMode(true);
        s.setSupportZoom(false);
        s.setBuiltInZoomControls(false);
        web.addJavascriptInterface(new AppBridge(), "PacvsApp");   // only the app's own page is ever loaded in this view

        // The page files, served from the assets under a plain http origin so the page can open ws:// as well as
        // wss:// to the game server. "/" and "/soundlab" map to their pages as the game server maps them.
        final WebViewAssetLoader loader = new WebViewAssetLoader.Builder().setHttpAllowed(true)
            .addPathHandler("/", new WebViewAssetLoader.AssetsPathHandler(this)).build();
        web.setWebViewClient(new WebViewClient() {
            @Override public WebResourceResponse shouldInterceptRequest(WebView v, WebResourceRequest req) {
                Uri u = req.getUrl();
                String path = u.getPath() == null ? "" : u.getPath();
                if (path.equals("/") || path.isEmpty()) u = u.buildUpon().path("/index.html").build();
                else if (path.equals("/soundlab")) u = u.buildUpon().path("/soundlab.html").build();
                return loader.shouldInterceptRequest(u);
            }
            @Override public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest req) {
                // Links to anywhere else (the game server's own page, the project page) open in the browser.
                if (req.getUrl().getHost() != null && req.getUrl().getHost().endsWith("androidplatform.net")) return false;
                try { startActivity(new Intent(Intent.ACTION_VIEW, req.getUrl())); } catch (Exception e) { /* no browser */ }
                return true;
            }
        });
        web.setWebChromeClient(new WebChromeClient() {
            @Override public boolean onShowFileChooser(WebView v, ValueCallback<Uri[]> cb, FileChooserParams params) {
                if (pendingPick != null) pendingPick.onReceiveValue(null);
                pendingPick = cb;
                try { startActivityForResult(params.createIntent(), PICK_FILE); }
                catch (Exception e) { pendingPick = null; return false; }
                return true;
            }
        });
        if (saved == null) web.loadUrl(HOME); else web.restoreState(saved);
    }

    /** What the page may ask of the app, as window.PacvsApp. Called on the web view's JavaScript thread. */
    private class AppBridge {
        /** Start hosting on `port`: the web server for friends on the Wi-Fi. Answers {port, lan} or {error}. */
        @JavascriptInterface public String startHost(int port) {
            synchronized (MainActivity.this) {
                if (host == null) {
                    HostServer h = new HostServer(port, path -> getAssets().open(path), new HostServer.Hub() {
                        @Override public void open(int id) { js("PacvsHost.open(" + id + ")"); }
                        @Override public void message(int id, String text) { js("PacvsHost.message(" + id + "," + JSONObject.quote(text) + ")"); }
                        @Override public void close(int id) { js("PacvsHost.close(" + id + ")"); }
                    });
                    try { h.begin(); } catch (IOException e) { return "{\"error\":" + JSONObject.quote("Could not listen on port " + port + ": " + e.getMessage()) + "}"; }
                    host = h;
                }
            }
            String ip = lanAddress();
            return "{\"port\":" + port + ",\"lan\":" + (ip == null ? "null" : JSONObject.quote("http://" + ip + ":" + port)) + "}";
        }
        @JavascriptInterface public void stopHost() { stopHosting(); }
        /** Text from the page's hub to one visitor, and dropping one. */
        @JavascriptInterface public void send(int id, String text) { HostServer h = host; if (h != null) h.send(id, text); }
        @JavascriptInterface public void close(int id) { HostServer h = host; if (h != null) h.close(id); }
    }
    /** Run page script on the web view's own thread. */
    private void js(final String code) { runOnUiThread(() -> web.evaluateJavascript(code, null)); }
    private synchronized void stopHosting() { if (host != null) { host.end(); host = null; } }

    /** This phone's address on the Wi-Fi: a private IPv4 address, on a Wi-Fi interface for choice. Null without one. */
    private static String lanAddress() {
        String any = null;
        try {
            for (NetworkInterface ni : Collections.list(NetworkInterface.getNetworkInterfaces())) {
                if (!ni.isUp() || ni.isLoopback()) continue;
                for (InetAddress a : Collections.list(ni.getInetAddresses())) {
                    if (!(a instanceof Inet4Address) || !a.isSiteLocalAddress()) continue;
                    if (ni.getName().startsWith("wlan")) return a.getHostAddress();
                    if (any == null) any = a.getHostAddress();
                }
            }
        } catch (SocketException e) { /* no network */ }
        return any;
    }

    @Override protected void onActivityResult(int code, int result, Intent data) {
        if (code == PICK_FILE && pendingPick != null) {
            pendingPick.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(result, data));
            pendingPick = null;
        } else super.onActivityResult(code, result, data);
    }

    @Override protected void onSaveInstanceState(Bundle out) { super.onSaveInstanceState(out); web.saveState(out); }
    @Override protected void onPause() { super.onPause(); web.onPause(); }
    @Override protected void onResume() { super.onResume(); web.onResume(); hideBars(); }
    @Override protected void onDestroy() { stopHosting(); super.onDestroy(); }
    @Override public void onWindowFocusChanged(boolean has) { super.onWindowFocusChanged(has); if (has) hideBars(); }
    @Override public void onBackPressed() { if (web.canGoBack()) web.goBack(); else super.onBackPressed(); }

    private void hideBars() {
        if (android.os.Build.VERSION.SDK_INT >= 30) {
            WindowInsetsController c = getWindow().getInsetsController();
            if (c != null) {
                c.hide(WindowInsets.Type.systemBars());
                c.setSystemBarsBehavior(WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
            }
        } else {
            web.setSystemUiVisibility(View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY | View.SYSTEM_UI_FLAG_FULLSCREEN
                | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION | View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION);
        }
    }
}
