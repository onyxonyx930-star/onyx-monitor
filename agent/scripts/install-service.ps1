# Onyx Agent - Windows Service Installer
# Execute como Administrador

param(
    [string]$Action = "install"
)

$ServiceName = "OnyxMonitorAgent"
$DisplayName = "Onyx Monitor Agent"
$Description = "Agente de coleta SNMP para monitoramento de impressoras"
$AgentPath = "$env:USERPROFILE\.onyx-agent"
$NodePath = (Get-Command node -ErrorAction SilentlyContinue).Source

if (-not $NodePath) {
    Write-Host "Erro: Node.js não encontrado no PATH" -ForegroundColor Red
    exit 1
}

switch ($Action) {
    "install" {
        Write-Host "Instalando $DisplayName..." -ForegroundColor Cyan
        
        # Create service
        New-Service -Name $ServiceName `
            -DisplayName $DisplayName `
            -Description $Description `
            -BinaryPathName "`"$NodePath`" `"$AgentPath\dist\index.js`" start" `
            -StartupType Automatic `
            -ErrorAction Stop
        
        Write-Host "Serviço instalado com sucesso!" -ForegroundColor Green
        Write-Host "Execute: Start-Service $ServiceName" -ForegroundColor Yellow
    }
    
    "uninstall" {
        Write-Host "Removendo $DisplayName..." -ForegroundColor Cyan
        
        Stop-Service -Name $ServiceName -Force -ErrorAction SilentlyContinue
        Remove-Service -Name $ServiceName -Force -ErrorAction SilentlyContinue
        
        Write-Host "Serviço removido com sucesso!" -ForegroundColor Green
    }
    
    "start" {
        Start-Service -Name $ServiceName
        Write-Host "Serviço iniciado" -ForegroundColor Green
    }
    
    "stop" {
        Stop-Service -Name $ServiceName
        Write-Host "Serviço parado" -ForegroundColor Green
    }
    
    "status" {
        $service = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
        if ($service) {
            Write-Host "Status: $($service.Status)" -ForegroundColor $(if ($service.Status -eq 'Running') { 'Green' } else { 'Yellow' })
        } else {
            Write-Host "Serviço não encontrado" -ForegroundColor Red
        }
    }
    
    "logs" {
        $logFile = "$AgentPath\logs\agent-$(Get-Date -Format 'yyyy-MM-dd').log"
        if (Test-Path $logFile) {
            Get-Content $logFile -Tail 50
        } else {
            Write-Host "Nenhum log encontrado para hoje" -ForegroundColor Yellow
        }
    }
    
    default {
        Write-Host "Uso: .\install-service.ps1 <ação>" -ForegroundColor Yellow
        Write-Host "Ações:" -ForegroundColor Cyan
        Write-Host "  install  - Instala o serviço" -ForegroundColor White
        Write-Host "  uninstall - Remove o serviço" -ForegroundColor White
        Write-Host "  start    - Inicia o serviço" -ForegroundColor White
        Write-Host "  stop     - Para o serviço" -ForegroundColor White
        Write-Host "  status   - Mostra o status" -ForegroundColor White
        Write-Host "  logs     - Mostra os logs recentes" -ForegroundColor White
    }
}
