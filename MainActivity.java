package com.yayasan.alhikmah.presensi; // ← sesuaikan package name kamu

import android.annotation.SuppressLint;
import android.content.Context;
import android.content.pm.PackageManager;
import android.location.Location;
import android.location.LocationManager;
import android.os.Build;
import android.os.Bundle;
import android.provider.Settings;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.webkit.PermissionRequest;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import android.Manifest;
import android.widget.Toast;

public class MainActivity extends AppCompatActivity {

    private WebView webView;
    private static final int LOCATION_PERMISSION_CODE = 101;

    // ─── Daftar package app fake GPS yang umum beredar ──────────
    private static final String[] KNOWN_FAKE_GPS_APPS = {
        "com.lexa.fakegps",
        "com.incorporateapps.fakegps.fre",
        "com.blogspot.newapphorizons.fakegps",
        "com.theappninjas.gpsjoystick",
        "com.rosteam.gpsemulator",
        "com.gsmartstudio.fakegps",
        "org.hola.fakegps",
        "com.lun.fakegps",
        "com.spartacusrex.spartacuside",         // GPS Emulator
        "com.droidbt.fakegpslocation",
    };

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);

        webView = findViewById(R.id.webView);
        WebSettings ws = webView.getSettings();
        ws.setJavaScriptEnabled(true);
        ws.setDomStorageEnabled(true);
        ws.setGeolocationEnabled(true);
        ws.setGeolocationDatabasePath(getFilesDir().getPath());
        ws.setAllowFileAccess(true);
        ws.setMediaPlaybackRequiresUserGesture(false);

        // Inject Android bridge ke JavaScript
        webView.addJavascriptInterface(new LocationBridge(this), "AndroidBridge");

        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onGeolocationPermissionsShowPrompt(String origin,
                    android.webkit.GeolocationPermissions.Callback callback) {
                callback.invoke(origin, true, false);
            }
            @Override
            public void onPermissionRequest(PermissionRequest request) {
                request.grant(request.getResources());
            }
        });

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                view.loadUrl(url);
                return true;
            }
        });

        // Minta izin lokasi
        requestLocationPermission();

        // Load app — ganti dengan URL deploy kamu atau file lokal
        webView.loadUrl("https://your-app-url.pages.dev"); // ← GANTI
        // Untuk file lokal: webView.loadUrl("file:///android_asset/index.html");
    }

    // ─── JAVASCRIPT BRIDGE ────────────────────────────────────────
    public class LocationBridge {
        private final Context ctx;

        LocationBridge(Context context) { this.ctx = context; }

        /**
         * Cek apakah mock location aktif.
         * Return JSON string: { isMock, reasons[] }
         */
        @JavascriptInterface
        public String checkMockLocation() {
            StringBuilder reasons = new StringBuilder();
            boolean isMock = false;

            // 1. Cek apakah developer options "Allow mock location" aktif (API < 23)
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) {
                try {
                    int mockSetting = Settings.Secure.getInt(
                        ctx.getContentResolver(),
                        Settings.Secure.ALLOW_MOCK_LOCATION, 0);
                    if (mockSetting != 0) {
                        isMock = true;
                        reasons.append("\"Mock location diaktifkan di Developer Options\"");
                    }
                } catch (Exception ignored) {}
            }

            // 2. Cek apakah ada app fake GPS terinstal
            PackageManager pm = ctx.getPackageManager();
            for (String pkg : KNOWN_FAKE_GPS_APPS) {
                try {
                    pm.getPackageInfo(pkg, 0);
                    isMock = true;
                    if (reasons.length() > 0) reasons.append(",");
                    reasons.append("\"App fake GPS terdeteksi: ").append(pkg).append("\"");
                } catch (PackageManager.NameNotFoundException ignored) {}
            }

            // 3. Cek apakah ada app yg punya permission ACCESS_MOCK_LOCATION (API >= 23)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                try {
                    LocationManager lm = (LocationManager) ctx.getSystemService(Context.LOCATION_SERVICE);
                    // Cek mock provider GPS
                    if (lm != null) {
                        Location lastKnown = null;
                        if (ContextCompat.checkSelfPermission(ctx, Manifest.permission.ACCESS_FINE_LOCATION)
                                == PackageManager.PERMISSION_GRANTED) {
                            lastKnown = lm.getLastKnownLocation(LocationManager.GPS_PROVIDER);
                        }
                        if (lastKnown != null) {
                            boolean mockFlag;
                            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                                mockFlag = lastKnown.isMock(); // API 31+
                            } else {
                                mockFlag = lastKnown.isFromMockProvider(); // API 18-30
                            }
                            if (mockFlag) {
                                isMock = true;
                                if (reasons.length() > 0) reasons.append(",");
                                reasons.append("\"Lokasi dari mock provider\"");
                            }
                        }
                    }
                } catch (Exception e) {
                    // Ignore security exceptions
                }
            }

            return "{\"isMock\":" + isMock + ",\"reasons\":[" + reasons + "]}";
        }

        /**
         * Cek apakah developer options aktif sama sekali
         */
        @JavascriptInterface
        public boolean isDeveloperModeEnabled() {
            try {
                int devOpts = Settings.Secure.getInt(
                    ctx.getContentResolver(),
                    Settings.Global.DEVELOPMENT_SETTINGS_ENABLED, 0);
                return devOpts != 0;
            } catch (Exception e) {
                return false;
            }
        }

        /**
         * Tampilkan toast dari JavaScript
         */
        @JavascriptInterface
        public void showToast(String message) {
            runOnUiThread(() -> Toast.makeText(ctx, message, Toast.LENGTH_SHORT).show());
        }

        /**
         * Dapatkan info perangkat untuk log server
         */
        @JavascriptInterface
        public String getDeviceInfo() {
            return "{" +
                "\"model\":\"" + Build.MODEL + "\"," +
                "\"brand\":\"" + Build.BRAND + "\"," +
                "\"sdk\":" + Build.VERSION.SDK_INT + "," +
                "\"release\":\"" + Build.VERSION.RELEASE + "\"" +
            "}";
        }
    }

    // ─── PERMISSIONS ─────────────────────────────────────────────
    private void requestLocationPermission() {
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION)
                != PackageManager.PERMISSION_GRANTED) {
            ActivityCompat.requestPermissions(this,
                new String[]{
                    Manifest.permission.ACCESS_FINE_LOCATION,
                    Manifest.permission.ACCESS_COARSE_LOCATION
                }, LOCATION_PERMISSION_CODE);
        }
    }

    @Override
    public void onBackPressed() {
        if (webView.canGoBack()) webView.goBack();
        else super.onBackPressed();
    }
}
