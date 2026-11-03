$ErrorActionPreference = 'Stop'
$labRoot = Split-Path -Parent $PSScriptRoot
$labPidFile = Join-Path $labRoot '.local/server.pid'
if (!(Test-Path -LiteralPath $labPidFile)) { Write-Output '没有找到本应用的后台运行记录。'; exit }
$labPid = [int]([System.IO.File]::ReadAllText($labPidFile).Trim())
$labProcess = Get-CimInstance Win32_Process -Filter "ProcessId = $labPid"
$labNext = (Join-Path $labRoot 'node_modules/next/dist/bin/next').Replace('/', '\').ToLowerInvariant()
if ($labProcess) {
  $labCommand = ([string]$labProcess.CommandLine).Replace('/', '\').ToLowerInvariant()
  if ($labProcess.Name -ne 'node.exe' -or !$labCommand.Contains($labNext) -or !$labCommand.Contains('--port 3000')) { throw '运行进程不匹配；为避免停止其他应用，已取消。' }
  Stop-Process -Id $labPid
}
Remove-Item -LiteralPath $labPidFile
Write-Output 'AI 转行练习场的后台服务已停止，学习数据仍保留。'
