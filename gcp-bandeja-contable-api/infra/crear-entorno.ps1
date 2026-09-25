<#
  Crea la infraestructura de Google Cloud de la Bandeja Contable para un entorno.

  Uso:   .\infra\crear-entorno.ps1 -Entorno dev
         .\infra\crear-entorno.ps1 -Entorno prod

  - dev  -> recursos con sufijo -dev / _dev (los usa el Sandbox de Salesforce)
  - prod -> recursos sin sufijo (los usara la org de produccion)

  Es idempotente: si un recurso ya existe, lo deja como esta y continua.
  No crea claves JSON: Salesforce se autentica con un certificado propio (ver paso final).
  Requiere gcloud autenticado con permisos de Owner (o equivalentes) en el proyecto.
#>
param(
  [Parameter(Mandatory = $true)][ValidateSet('dev', 'prod')][string]$Entorno
)

# gcloud escribe avisos y progreso en stderr: con 'Stop', PowerShell 5.1 los trataria como errores.
# Cada llamada se valida por su codigo de salida en Invoke-Gcloud.
$ErrorActionPreference = 'Continue'

$Proyecto  = 'centro-de-inteligencia-500407'
$Region    = 'europe-southwest1'
$Instancia = 'centro-inteligencia-db'
$InstanciaConexion = "${Proyecto}:${Region}:${Instancia}"

$sfx  = if ($Entorno -eq 'prod') { '' } else { "-$Entorno" }
$sfx_ = if ($Entorno -eq 'prod') { '' } else { "_$Entorno" }

$Servicio  = "bandeja-contable-api$sfx"
$Bucket    = "centro-inteligencia-bandeja-contable$sfx"
$BaseDatos = "bandeja_contable$sfx_"
$UsuarioBD = "bandeja_contable_app$sfx_"
$Secreto   = "bandeja-contable-db-password$sfx"
$SaRunId   = "bandeja-contable-run$sfx"
$SaCallId  = "bandeja-contable-caller$sfx"
$SaRun     = "$SaRunId@$Proyecto.iam.gserviceaccount.com"
$SaCall    = "$SaCallId@$Proyecto.iam.gserviceaccount.com"
$Cors      = Join-Path $PSScriptRoot "..\cors-$Entorno.json"
$Codigo    = Join-Path $PSScriptRoot '..'

function Invoke-Gcloud {
  # Sin -Check: ejecuta gcloud mostrando su salida y aborta el script si falla.
  # Con -Check: solo comprueba (sin salida) y devuelve $true/$false.
  param([string[]]$GArgs, [switch]$Check)
  if ($Check) {
    & gcloud @GArgs --project=$Proyecto *> $null
    return ($LASTEXITCODE -eq 0)
  }
  & gcloud @GArgs --project=$Proyecto
  if ($LASTEXITCODE -ne 0) { throw "Ha fallado: gcloud $($GArgs -join ' ')" }
}

function Paso($texto) { Write-Host "`n==> $texto" -ForegroundColor Cyan }

if (-not (Test-Path $Cors)) { throw "No existe $Cors (CORS del bucket para el entorno $Entorno)." }

Paso "Service accounts"
foreach ($sa in @(@($SaRunId, "Bandeja Contable API ($Entorno) - ejecucion"), @($SaCallId, "Bandeja Contable API ($Entorno) - llamadas desde Salesforce"))) {
  if (Invoke-Gcloud -Check @('iam', 'service-accounts', 'describe', "$($sa[0])@$Proyecto.iam.gserviceaccount.com")) {
    Write-Host "  $($sa[0]) ya existe"
  } else {
    Invoke-Gcloud @('iam', 'service-accounts', 'create', $sa[0], "--display-name=$($sa[1])")
  }
}

Paso "Bucket $Bucket"
if (Invoke-Gcloud -Check @('storage', 'buckets', 'describe', "gs://$Bucket")) {
  Write-Host "  ya existe"
} else {
  Invoke-Gcloud @('storage', 'buckets', 'create', "gs://$Bucket", "--location=$Region", '--uniform-bucket-level-access', '--public-access-prevention')
}
Invoke-Gcloud @('storage', 'buckets', 'update', "gs://$Bucket", "--cors-file=$Cors")
Invoke-Gcloud @('storage', 'buckets', 'add-iam-policy-binding', "gs://$Bucket", "--member=serviceAccount:$SaRun", '--role=roles/storage.objectAdmin')

Paso "Cloud SQL: base de datos $BaseDatos y usuario $UsuarioBD en $Instancia"
if (Invoke-Gcloud -Check @('sql', 'databases', 'describe', $BaseDatos, "--instance=$Instancia")) {
  Write-Host "  base de datos ya existe"
} else {
  Invoke-Gcloud @('sql', 'databases', 'create', $BaseDatos, "--instance=$Instancia")
}

$usuarios = & gcloud sql users list "--instance=$Instancia" --format='value(name)' --project=$Proyecto
if ($usuarios -contains $UsuarioBD) {
  Write-Host "  usuario ya existe (su contrasena sigue en el secreto $Secreto)"
} else {
  # Contrasena aleatoria: va al usuario y a Secret Manager y nunca se imprime. Se pasa a gcloud
  # con un archivo temporal sin salto de linea (por tuberia, PowerShell 5.1 anadiria CRLF al secreto).
  $bytes = New-Object byte[] 32
  [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
  $clave = ([Convert]::ToBase64String($bytes)) -replace '[+/=]', ''
  $tmp = [System.IO.Path]::GetTempFileName()
  try {
    [System.IO.File]::WriteAllText($tmp, $clave)
    if (Invoke-Gcloud -Check @('secrets', 'describe', $Secreto)) {
      Invoke-Gcloud @('secrets', 'versions', 'add', $Secreto, "--data-file=$tmp")
    } else {
      Invoke-Gcloud @('secrets', 'create', $Secreto, '--replication-policy=automatic', "--data-file=$tmp")
    }
    Invoke-Gcloud @('sql', 'users', 'create', $UsuarioBD, "--instance=$Instancia", "--password=$clave")
  } finally {
    Remove-Item $tmp -Force -ErrorAction SilentlyContinue
    Remove-Variable clave
  }
}

Paso "Permisos de $SaRunId"
Invoke-Gcloud @('secrets', 'add-iam-policy-binding', $Secreto, "--member=serviceAccount:$SaRun", '--role=roles/secretmanager.secretAccessor')
Invoke-Gcloud @('projects', 'add-iam-policy-binding', $Proyecto, "--member=serviceAccount:$SaRun", '--role=roles/cloudsql.client', '--condition=None')
# Necesario para firmar las URLs de vista previa (signBlob) con su propia identidad
Invoke-Gcloud @('iam', 'service-accounts', 'add-iam-policy-binding', $SaRun, "--member=serviceAccount:$SaRun", '--role=roles/iam.serviceAccountTokenCreator')

Paso "Cloud Run $Servicio (privado)"
Invoke-Gcloud @('run', 'deploy', $Servicio,
  "--source=$Codigo",
  "--region=$Region",
  "--service-account=$SaRun",
  '--no-allow-unauthenticated',
  "--add-cloudsql-instances=$InstanciaConexion",
  '--max-instances=2',
  '--cpu-boost',
  "--set-env-vars=PROJECT_ID=$Proyecto,BUCKET_NAME=$Bucket,INSTANCE_CONNECTION_NAME=$InstanciaConexion,DB_NAME=$BaseDatos,DB_USER=$UsuarioBD",
  "--set-secrets=DB_PASSWORD=${Secreto}:latest")
Invoke-Gcloud @('run', 'services', 'add-iam-policy-binding', $Servicio, "--region=$Region", "--member=serviceAccount:$SaCall", '--role=roles/run.invoker')

$url = & gcloud run services describe $Servicio "--region=$Region" --format='value(status.url)' --project=$Proyecto

Write-Host "`nListo. Valores para Bandeja_Contable_Config__mdt en la org de Salesforce de '$Entorno':" -ForegroundColor Green
Write-Host "  Cloud_Run_URL__c     = $url"
Write-Host "  SA_Client_Email__c   = $SaCall"
Write-Host "  Certificate_Name__c  = Bandeja_Contable_GCP"
Write-Host "`nPaso manual pendiente (autenticacion de Salesforce, sin claves JSON):"
Write-Host "  1. Salesforce > Setup > Certificate and Key Management > Create Self-Signed Certificate"
Write-Host "     Label/Unique Name: Bandeja_Contable_GCP, Key Size 2048, sin 'Exportable Private Key'."
Write-Host "  2. Descargar el certificado (.crt) y subirlo como clave publica de la service account:"
Write-Host "     gcloud iam service-accounts keys upload <ruta>.crt --iam-account=$SaCall --project=$Proyecto"
