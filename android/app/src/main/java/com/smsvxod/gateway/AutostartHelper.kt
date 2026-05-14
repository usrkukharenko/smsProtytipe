package com.smsvxod.gateway

import android.app.Activity
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.provider.Settings
import android.widget.Toast

/**
 * Vendor-specific "autostart" / "background launch" management screens.
 * On many Chinese OEM ROMs (MIUI, EMUI, ColorOS, Vivo, etc.) the user
 * must explicitly whitelist an app or it will be killed shortly after
 * being backgrounded — regardless of foreground-service status or
 * battery-optimization exemption.
 */
object AutostartHelper {

    private val vendorIntents: List<Intent> = listOf(
        // Xiaomi / MIUI / Redmi / Poco
        Intent().setComponent(
            ComponentName(
                "com.miui.securitycenter",
                "com.miui.permcenter.autostart.AutoStartManagementActivity"
            )
        ),
        // Huawei / Honor
        Intent().setComponent(
            ComponentName(
                "com.huawei.systemmanager",
                "com.huawei.systemmanager.startupmgr.ui.StartupNormalAppListActivity"
            )
        ),
        Intent().setComponent(
            ComponentName(
                "com.huawei.systemmanager",
                "com.huawei.systemmanager.optimize.process.ProtectActivity"
            )
        ),
        // OPPO / ColorOS / Realme
        Intent().setComponent(
            ComponentName(
                "com.coloros.safecenter",
                "com.coloros.safecenter.startupapp.StartupAppListActivity"
            )
        ),
        Intent().setComponent(
            ComponentName(
                "com.coloros.safecenter",
                "com.coloros.safecenter.permission.startup.StartupAppListActivity"
            )
        ),
        Intent().setComponent(
            ComponentName(
                "com.oppo.safe",
                "com.oppo.safe.permission.startup.StartupAppListActivity"
            )
        ),
        // Vivo / iQOO
        Intent().setComponent(
            ComponentName(
                "com.iqoo.secure",
                "com.iqoo.secure.ui.phoneoptimize.BgStartUpManager"
            )
        ),
        Intent().setComponent(
            ComponentName(
                "com.vivo.permissionmanager",
                "com.vivo.permissionmanager.activity.BgStartUpManagerActivity"
            )
        ),
        // Letv / LeEco
        Intent().setComponent(
            ComponentName(
                "com.letv.android.letvsafe",
                "com.letv.android.letvsafe.AutobootManageActivity"
            )
        ),
        // Asus
        Intent().setComponent(
            ComponentName(
                "com.asus.mobilemanager",
                "com.asus.mobilemanager.powersaver.PowerSaverSettings"
            )
        ),
        Intent().setComponent(
            ComponentName(
                "com.asus.mobilemanager",
                "com.asus.mobilemanager.entry.FunctionActivity"
            )
        ),
        // Samsung
        Intent().setComponent(
            ComponentName(
                "com.samsung.android.lool",
                "com.samsung.android.sm.battery.ui.BatteryActivity"
            )
        )
    )

    private val vendorManufacturers = setOf(
        "xiaomi", "huawei", "honor", "oppo", "vivo",
        "iqoo", "realme", "samsung", "letv", "leeco", "asus"
    )

    /**
     * Walks through known vendor autostart screens and returns the first
     * intent that can actually be resolved on this device, or null when
     * none of them are present.
     */
    fun findAutostartIntent(context: Context): Intent? {
        val pm = context.packageManager
        for (intent in vendorIntents) {
            try {
                if (pm.resolveActivity(intent, PackageManager.MATCH_DEFAULT_ONLY) != null) {
                    return Intent(intent)
                }
            } catch (_: Exception) {
                // Ignore and continue with the next candidate.
            }
        }
        return null
    }

    /**
     * Opens the vendor-specific autostart screen if we can find one,
     * otherwise falls back to the generic per-app details screen so the
     * user still has a chance to tweak related settings manually.
     */
    fun open(activity: Activity) {
        val intent = findAutostartIntent(activity)
            ?: Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS).apply {
                data = Uri.parse("package:${activity.packageName}")
            }
        try {
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            activity.startActivity(intent)
        } catch (e: Exception) {
            Toast.makeText(
                activity,
                "Не удалось открыть настройки автозапуска: ${e.message}",
                Toast.LENGTH_LONG
            ).show()
        }
    }

    /**
     * Heuristic: should we surface the "autostart" button on this device?
     * We base the decision on the manufacturer string because OEM ROMs
     * are the ones that ship the additional kill-on-background behaviour.
     */
    fun isLikelyVendorWithAutostart(): Boolean {
        val mfr = Build.MANUFACTURER?.lowercase()?.trim().orEmpty()
        if (mfr.isEmpty()) return false
        return vendorManufacturers.any { it == mfr || mfr.contains(it) }
    }
}
