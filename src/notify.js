import { spawn } from "node:child_process";

export function notify(title, message) {
  if (String(process.env.DESKTOP_NOTIFICATIONS || "true").toLowerCase() === "false") {
    return;
  }

  if (process.platform !== "win32") {
    process.stdout.write("\u0007");
    return;
  }

  const safeTitle = escapePowerShell(title);
  const safeMessage = escapePowerShell(message);
  const mode = String(process.env.DESKTOP_NOTIFICATION_MODE || "popup").toLowerCase();
  const script = mode === "toast" ? toastScript(safeTitle, safeMessage) : popupScript(safeTitle, safeMessage);

  const child = spawn("powershell.exe", [
    "-NoProfile",
    "-ExecutionPolicy",
    "Bypass",
    "-Command",
    script
  ], {
    detached: true,
    stdio: "ignore",
    windowsHide: true
  });
  child.on("error", (error) => console.warn(`Notification could not be displayed: ${error.message}`));
  child.unref();
}

function popupScript(title, message) {
  return `
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
$form = New-Object System.Windows.Forms.Form
$form.TopMost = $true
$form.ShowInTaskbar = $false
$form.StartPosition = 'CenterScreen'
$form.WindowState = 'Minimized'
$form.Show()
$form.Activate()
[System.Media.SystemSounds]::Asterisk.Play()
[System.Windows.Forms.MessageBox]::Show($form, '${message}', '${title}', [System.Windows.Forms.MessageBoxButtons]::OK, [System.Windows.Forms.MessageBoxIcon]::Information) | Out-Null
$form.Dispose()
`;
}

function toastScript(title, message) {
  return `
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
$notify = New-Object System.Windows.Forms.NotifyIcon
$notify.Icon = [System.Drawing.SystemIcons]::Information
$notify.BalloonTipTitle = '${title}'
$notify.BalloonTipText = '${message}'
$notify.Visible = $true
$notify.ShowBalloonTip(8000)
Start-Sleep -Seconds 9
$notify.Dispose()
`;
}

function escapePowerShell(value) {
  return String(value || "")
    .replace(/'/g, "''")
    .replace(/\r?\n/g, " ")
    .slice(0, 240);
}
