package com.smsvxod.gateway

import android.Manifest
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.text.format.DateFormat
import android.view.View
import android.widget.AdapterView
import android.widget.ArrayAdapter
import android.widget.Button
import android.widget.EditText
import android.widget.Spinner
import android.widget.TextView
import android.widget.Toast
import androidx.activity.result.ActivityResultLauncher
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.appcompat.widget.SwitchCompat
import androidx.core.content.ContextCompat
import androidx.core.content.FileProvider
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import java.util.Date
import java.util.concurrent.TimeUnit

class MainActivity : AppCompatActivity() {

    private lateinit var etServerUrl: EditText
    private lateinit var etGatewayToken: EditText
    private lateinit var etInterval: EditText
    private lateinit var spSim: Spinner
    private lateinit var btnToggle: Button
    private lateinit var btnShareLog: Button
    private lateinit var tvStatus: TextView
    private lateinit var tvLog: TextView

    // System-permissions section
    private lateinit var tvBatteryStatus: TextView
    private lateinit var btnBatteryOpen: Button
    private lateinit var tvAutostartStatus: TextView
    private lateinit var btnAutostartOpen: Button
    private lateinit var swBlockCalls: SwitchCompat
    private lateinit var tvBlockCallsStatus: TextView
    private lateinit var btnBlockCallsAssign: Button
    private lateinit var tvBlockCallsHint: TextView

    private val logLines = ArrayDeque<String>()
    private val simSubIds = mutableListOf<Int>()
    private var suppressSpinnerCallback = true
    private var suppressBlockCallsSwitch = false

    private val logReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context, intent: Intent) {
            val line = intent.getStringExtra(GatewayService.EXTRA_LOG_LINE) ?: return
            appendLog(line)
            refreshStatus()
        }
    }

    private val requestPerms =
        registerForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) { results ->
            // Re-populate SIM spinner if READ_PHONE_STATE was just granted
            if (results[Manifest.permission.READ_PHONE_STATE] == true) {
                populateSimSpinner()
            }
            val smsGranted = results[Manifest.permission.SEND_SMS] ?: false
            if (smsGranted) {
                startGatewayService()
            } else {
                appendLog("Нет разрешения на отправку SMS")
            }
        }

    private val callScreeningLauncher: ActivityResultLauncher<Intent> =
        registerForActivityResult(ActivityResultContracts.StartActivityForResult()) {
            // The system writes the new role state asynchronously; refresh
            // the UI either way so the user sees the result.
            refreshCallScreeningStatus()
        }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        etServerUrl = findViewById(R.id.etServerUrl)
        etGatewayToken = findViewById(R.id.etGatewayToken)
        etInterval = findViewById(R.id.etInterval)
        spSim = findViewById(R.id.spSim)
        btnToggle = findViewById(R.id.btnToggle)
        btnShareLog = findViewById(R.id.btnShareLog)
        tvStatus = findViewById(R.id.tvStatus)
        tvLog = findViewById(R.id.tvLog)

        tvBatteryStatus = findViewById(R.id.tvBatteryStatus)
        btnBatteryOpen = findViewById(R.id.btnBatteryOpen)
        tvAutostartStatus = findViewById(R.id.tvAutostartStatus)
        btnAutostartOpen = findViewById(R.id.btnAutostartOpen)
        swBlockCalls = findViewById(R.id.swBlockCalls)
        tvBlockCallsStatus = findViewById(R.id.tvBlockCallsStatus)
        btnBlockCallsAssign = findViewById(R.id.btnBlockCallsAssign)
        tvBlockCallsHint = findViewById(R.id.tvBlockCallsHint)

        etServerUrl.setText(Prefs.getServerUrl(this))
        etGatewayToken.setText(Prefs.getToken(this))
        etInterval.setText(Prefs.getIntervalSec(this).toString())

        btnToggle.setOnClickListener { onToggle() }
        btnShareLog.setOnClickListener { shareLog() }

        btnBatteryOpen.setOnClickListener {
            BatteryHelper.requestIgnore(this)
        }
        btnAutostartOpen.setOnClickListener {
            AutostartHelper.open(this)
        }
        btnBlockCallsAssign.setOnClickListener {
            CallScreeningRoleHelper.requestCallScreeningRole(this, callScreeningLauncher)
        }

        // Hide autostart row controls on devices that don't need them.
        if (!AutostartHelper.isLikelyVendorWithAutostart()) {
            tvAutostartStatus.visibility = View.GONE
            btnAutostartOpen.visibility = View.GONE
            // Also hide the row label by walking up to its parent row;
            // we leave the structure to keep IDs stable across devices.
        }

        // Init block-calls switch state from prefs (without firing listener).
        suppressBlockCallsSwitch = true
        swBlockCalls.isChecked = Prefs.getBlockCallsWhenActive(this)
        suppressBlockCallsSwitch = false

        swBlockCalls.setOnCheckedChangeListener { _, isChecked ->
            if (suppressBlockCallsSwitch) return@setOnCheckedChangeListener
            Prefs.setBlockCallsWhenActive(this, isChecked)
            if (isChecked && !CallScreeningRoleHelper.isCallScreeningRoleHeld(this)) {
                showAssignCallScreeningDialog()
            }
            refreshCallScreeningStatus()
        }

        spSim.onItemSelectedListener = object : AdapterView.OnItemSelectedListener {
            override fun onItemSelected(parent: AdapterView<*>?, view: View?, position: Int, id: Long) {
                if (suppressSpinnerCallback) return
                val subId = simSubIds.getOrElse(position) { -1 }
                Prefs.setSubscriptionId(this@MainActivity, subId)
            }

            override fun onNothingSelected(parent: AdapterView<*>?) {}
        }

        populateSimSpinner()

        val filter = IntentFilter(GatewayService.ACTION_LOG)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            registerReceiver(logReceiver, filter, Context.RECEIVER_NOT_EXPORTED)
        } else {
            @Suppress("UnspecifiedRegisterReceiverFlag")
            registerReceiver(logReceiver, filter)
        }

        scheduleWatchdog()
        refreshStatus()
        refreshBatteryStatus()
        refreshAutostartStatus()
        refreshCallScreeningStatus()
    }

    override fun onResume() {
        super.onResume()
        refreshStatus()
        refreshBatteryStatus()
        refreshAutostartStatus()
        refreshCallScreeningStatus()
        maybeShowOnboardingPrompts()
    }

    override fun onDestroy() {
        super.onDestroy()
        try {
            unregisterReceiver(logReceiver)
        } catch (_: Exception) {
        }
    }

    private fun onToggle() {
        if (GatewayService.isRunning) {
            stopGatewayService()
            return
        }
        Prefs.setServerUrl(this, etServerUrl.text.toString())
        Prefs.setToken(this, etGatewayToken.text.toString())
        Prefs.setIntervalSec(
            this,
            etInterval.text.toString().toIntOrNull() ?: 3
        )
        Prefs.setAutostart(this, true)

        val missing = mutableListOf<String>()
        if (ContextCompat.checkSelfPermission(
                this,
                Manifest.permission.SEND_SMS
            ) != PackageManager.PERMISSION_GRANTED
        ) missing += Manifest.permission.SEND_SMS

        if (ContextCompat.checkSelfPermission(
                this,
                Manifest.permission.READ_PHONE_STATE
            ) != PackageManager.PERMISSION_GRANTED
        ) missing += Manifest.permission.READ_PHONE_STATE

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            if (ContextCompat.checkSelfPermission(
                    this,
                    Manifest.permission.POST_NOTIFICATIONS
                ) != PackageManager.PERMISSION_GRANTED
            ) missing += Manifest.permission.POST_NOTIFICATIONS
        }

        if (missing.isNotEmpty()) {
            requestPerms.launch(missing.toTypedArray())
        } else {
            startGatewayService()
        }
    }

    private fun startGatewayService() {
        val svc = Intent(this, GatewayService::class.java).apply {
            action = GatewayService.ACTION_START
        }
        ContextCompat.startForegroundService(this, svc)
        refreshStatus()
    }

    private fun stopGatewayService() {
        Prefs.setAutostart(this, false)
        val svc = Intent(this, GatewayService::class.java).apply {
            action = GatewayService.ACTION_STOP
        }
        startService(svc)
        refreshStatus()
    }

    private fun populateSimSpinner() {
        suppressSpinnerCallback = true
        val sims = getActiveSims(this)
        val labels = mutableListOf<String>()
        simSubIds.clear()
        // First entry: default
        labels += "По умолчанию"
        simSubIds += -1
        sims.forEach { sim ->
            val name = sim.carrierName.ifBlank { sim.displayName.ifBlank { "SIM ${sim.slotIndex + 1}" } }
            labels += "Слот ${sim.slotIndex + 1}: $name"
            simSubIds += sim.subId
        }
        val adapter = ArrayAdapter(this, android.R.layout.simple_spinner_item, labels)
        adapter.setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item)
        spSim.adapter = adapter

        val currentSub = Prefs.getSubscriptionId(this)
        val idx = simSubIds.indexOf(currentSub).let { if (it < 0) 0 else it }
        spSim.setSelection(idx, false)
        spSim.post { suppressSpinnerCallback = false }
    }

    private fun shareLog() {
        try {
            val file = FileLogger.logFile(this)
            if (!file.exists() || file.length() == 0L) {
                Toast.makeText(this, "Лог пуст", Toast.LENGTH_SHORT).show()
                return
            }
            val uri = FileProvider.getUriForFile(
                this,
                "${packageName}.fileprovider",
                file
            )
            val send = Intent(Intent.ACTION_SEND).apply {
                type = "text/plain"
                putExtra(Intent.EXTRA_STREAM, uri)
                putExtra(Intent.EXTRA_SUBJECT, "SmsVxod Gateway log")
                addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            }
            startActivity(Intent.createChooser(send, "Поделиться логом"))
        } catch (e: Exception) {
            Toast.makeText(this, "Ошибка: ${e.message}", Toast.LENGTH_LONG).show()
        }
    }

    /**
     * One-time onboarding dialogs. Battery prompt runs first; autostart
     * prompt only fires after the battery dialog is gone (or had already
     * been seen) so they don't stack on top of each other.
     */
    private fun maybeShowOnboardingPrompts() {
        if (!Prefs.getSeenBatteryPrompt(this)) {
            Prefs.setSeenBatteryPrompt(this, true)
            AlertDialog.Builder(this)
                .setTitle("Оптимизация батареи")
                .setMessage("Для надёжной работы шлюза отключите оптимизацию батареи для этого приложения")
                .setPositiveButton("Открыть настройки") { d, _ ->
                    BatteryHelper.requestIgnore(this)
                    d.dismiss()
                    maybeShowAutostartPrompt()
                }
                .setNegativeButton("Позже") { d, _ ->
                    d.dismiss()
                    maybeShowAutostartPrompt()
                }
                .setOnCancelListener { maybeShowAutostartPrompt() }
                .show()
            return
        }
        maybeShowAutostartPrompt()
    }

    private fun maybeShowAutostartPrompt() {
        if (Prefs.getSeenAutostartPrompt(this)) return
        if (!AutostartHelper.isLikelyVendorWithAutostart()) {
            // Mark as seen anyway so we don't keep checking on every resume.
            Prefs.setSeenAutostartPrompt(this, true)
            return
        }
        Prefs.setSeenAutostartPrompt(this, true)
        AlertDialog.Builder(this)
            .setTitle("Автозапуск")
            .setMessage("Чтобы шлюз не выгружался производителем, разрешите автозапуск в системных настройках")
            .setPositiveButton("Открыть настройки") { _, _ ->
                AutostartHelper.open(this)
            }
            .setNegativeButton("Позже", null)
            .show()
    }

    private fun showAssignCallScreeningDialog() {
        AlertDialog.Builder(this)
            .setTitle("Блокировка вызовов")
            .setMessage("Для блокировки звонков нужно назначить приложение блокировщиком вызовов в системе. Откроется системный диалог.")
            .setPositiveButton("Назначить") { _, _ ->
                CallScreeningRoleHelper.requestCallScreeningRole(this, callScreeningLauncher)
            }
            .setNegativeButton("Отмена", null)
            .show()
    }

    private fun scheduleWatchdog() {
        try {
            val req = PeriodicWorkRequestBuilder<GatewayWatchdogWorker>(
                15, TimeUnit.MINUTES
            ).build()
            WorkManager.getInstance(this).enqueueUniquePeriodicWork(
                "gateway-watchdog",
                ExistingPeriodicWorkPolicy.KEEP,
                req
            )
        } catch (_: Exception) {
        }
    }

    private fun refreshStatus() {
        val running = GatewayService.isRunning
        tvStatus.text = if (running) "Работает" else "Остановлен"
        tvStatus.setTextColor(
            ContextCompat.getColor(
                this,
                if (running) R.color.ios_green else R.color.ios_gray
            )
        )
        btnToggle.text = if (running) "Остановить" else "Запустить"
        btnToggle.backgroundTintList = ContextCompat.getColorStateList(
            this,
            if (running) R.color.ios_red else R.color.ios_blue
        )
    }

    private fun refreshBatteryStatus() {
        val ignoring = BatteryHelper.isIgnoringBatteryOptimizations(this)
        tvBatteryStatus.text = if (ignoring) "отключена ✓" else "включена ⚠"
        tvBatteryStatus.setTextColor(
            ContextCompat.getColor(
                this,
                if (ignoring) R.color.ios_green else R.color.ios_red
            )
        )
        btnBatteryOpen.isEnabled = !ignoring
        btnBatteryOpen.alpha = if (ignoring) 0.5f else 1.0f
    }

    private fun refreshAutostartStatus() {
        if (!AutostartHelper.isLikelyVendorWithAutostart()) {
            tvAutostartStatus.visibility = View.GONE
            btnAutostartOpen.visibility = View.GONE
            return
        }
        tvAutostartStatus.visibility = View.VISIBLE
        btnAutostartOpen.visibility = View.VISIBLE
        val hasIntent = AutostartHelper.findAutostartIntent(this) != null
        if (hasIntent) {
            tvAutostartStatus.text = "доступно"
            tvAutostartStatus.setTextColor(
                ContextCompat.getColor(this, R.color.ios_label)
            )
        } else {
            tvAutostartStatus.text = "не найдено"
            tvAutostartStatus.setTextColor(
                ContextCompat.getColor(this, R.color.ios_gray)
            )
        }
    }

    private fun refreshCallScreeningStatus() {
        val held = CallScreeningRoleHelper.isCallScreeningRoleHeld(this)
        tvBlockCallsStatus.text =
            if (held) "Назначено блокировщиком звонков ✓" else "Не назначено ⚠"
        tvBlockCallsStatus.setTextColor(
            ContextCompat.getColor(
                this,
                if (held) R.color.ios_green else R.color.ios_red
            )
        )
        btnBlockCallsAssign.isEnabled = !held
        btnBlockCallsAssign.alpha = if (held) 0.5f else 1.0f

        // Keep the switch in sync in case prefs changed externally
        // (e.g. tests, settings reset, etc.).
        val prefEnabled = Prefs.getBlockCallsWhenActive(this)
        if (swBlockCalls.isChecked != prefEnabled) {
            suppressBlockCallsSwitch = true
            swBlockCalls.isChecked = prefEnabled
            suppressBlockCallsSwitch = false
        }
    }

    private fun appendLog(line: String) {
        val time = DateFormat.format("HH:mm:ss", Date()).toString()
        logLines.addFirst("$time  $line")
        while (logLines.size > 50) logLines.removeLast()
        tvLog.text = logLines.joinToString("\n")
        tvLog.visibility = View.VISIBLE
    }
}
