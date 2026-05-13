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
import android.widget.Button
import android.widget.EditText
import android.widget.TextView
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import java.util.Date

class MainActivity : AppCompatActivity() {

    private lateinit var etServerUrl: EditText
    private lateinit var etGatewayToken: EditText
    private lateinit var etInterval: EditText
    private lateinit var btnToggle: Button
    private lateinit var tvStatus: TextView
    private lateinit var tvLog: TextView

    private val logLines = ArrayDeque<String>()

    private val logReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context, intent: Intent) {
            val line = intent.getStringExtra(GatewayService.EXTRA_LOG_LINE) ?: return
            appendLog(line)
            refreshStatus()
        }
    }

    private val requestPerms =
        registerForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) { results ->
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
        btnToggle = findViewById(R.id.btnToggle)
        tvStatus = findViewById(R.id.tvStatus)
        tvLog = findViewById(R.id.tvLog)

        etServerUrl.setText(Prefs.getServerUrl(this))
        etGatewayToken.setText(Prefs.getToken(this))
        etInterval.setText(Prefs.getIntervalSec(this).toString())

        btnToggle.setOnClickListener { onToggle() }

        val filter = IntentFilter(GatewayService.ACTION_LOG)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            registerReceiver(logReceiver, filter, Context.RECEIVER_NOT_EXPORTED)
        } else {
            @Suppress("UnspecifiedRegisterReceiverFlag")
            registerReceiver(logReceiver, filter)
        }

        refreshStatus()
    }

    override fun onResume() {
        super.onResume()
        refreshStatus()
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
