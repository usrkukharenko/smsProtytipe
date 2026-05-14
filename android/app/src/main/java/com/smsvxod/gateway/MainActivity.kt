package com.smsvxod.gateway

import android.Manifest
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import android.text.format.DateFormat
import android.view.View
import android.widget.AdapterView
import android.widget.ArrayAdapter
import android.widget.Button
import android.widget.EditText
import android.widget.Spinner
import android.widget.TextView
import android.widget.Toast
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
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

    private val logLines = ArrayDeque<String>()
    private val simSubIds = mutableListOf<Int>()
    private var suppressSpinnerCallback = true

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

        etServerUrl.setText(Prefs.getServerUrl(this))
        etGatewayToken.setText(Prefs.getToken(this))
        etInterval.setText(Prefs.getIntervalSec(this).toString())

        btnToggle.setOnClickListener { onToggle() }
        btnShareLog.setOnClickListener { shareLog() }

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
    }

    override fun onResume() {
        super.onResume()
        refreshStatus()
        maybeShowBatteryPrompt()
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

    private fun maybeShowBatteryPrompt() {
        if (Prefs.getSeenBatteryPrompt(this)) return
        Prefs.setSeenBatteryPrompt(this, true)
        AlertDialog.Builder(this)
            .setTitle("Оптимизация батареи")
            .setMessage("Для надёжной работы шлюза отключите оптимизацию батареи для этого приложения")
            .setPositiveButton("Открыть настройки") { _, _ ->
                try {
                    val intent = Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS).apply {
                        data = Uri.parse("package:$packageName")
                    }
                    startActivity(intent)
                } catch (_: Exception) {
                    try {
                        startActivity(Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS))
                    } catch (_: Exception) {
                    }
                }
            }
            .setNegativeButton("Позже", null)
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

    private fun appendLog(line: String) {
        val time = DateFormat.format("HH:mm:ss", Date()).toString()
        logLines.addFirst("$time  $line")
        while (logLines.size > 50) logLines.removeLast()
        tvLog.text = logLines.joinToString("\n")
        tvLog.visibility = View.VISIBLE
    }
}
