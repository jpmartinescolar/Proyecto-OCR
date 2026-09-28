<#
  Crea la infraestructura de Google Cloud de la Bandeja Contable para un entorno.

  Uso:   .\infra\crear-entorno.ps1 -Entorno dev
         .\infra\crear-entorno.ps1 -Entorno prod
         .\infra\crear-entorno.ps1 -Entorno dev -SoloInfra   (sin redesplegar Cloud Run)

  - dev  -> recursos con sufijo -dev / _dev (los usa el Sandbox de Salesforce)
  - prod -> recursos sin sufijo (los usara la org de produccion)

  Es idempotente: si un recurso ya existe, lo deja como esta y continua.
  No crea claves JSON: Salesforce se autentica con un certificado propio (ver paso final).
  Requiere gcloud autenticado con permisos de Owner (o equivalentes) en el proyecto.
#>
param(
  [Parameter(Mandatory = $true)][ValidateSet('dev', 'prod')][string]$Entorno,
  [switch]$SoloInfra
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
$BaseDatos = "bandeja_contable$sfx_"
$UsuarioBD = "bandeja_contable_app$sfx_"
$Secreto   = "bandeja-contable-db-password$sfx"
$SaRunId   = "bandeja-contable-run$sfx"
$SaCallId  = "bandeja-contable-caller$sfx"
$SaRun     = "$SaRunId@$Proyecto.iam.gserviceaccount.com"
$SaCall    = "$SaCallId@$Proyecto.iam.gserviceaccount.com"

# Fase 1 (ingestion y separacion de documentos): originales y derivados en buckets distintos,
# un procesador propio y una cola que lo alimenta. Ver docs/fases/fase-1-ingestion.md
$BucketRaw  = "centro-inteligencia-bandeja-contable-raw$sfx"
$BucketDocs = "centro-inteligencia-bandeja-contable-docs$sfx"
$SaProcId   = "bandeja-contable-proc$sfx"
$SaProc     = "$SaProcId@$Proyecto.iam.gserviceaccount.com"
$Cola       = "bandeja-contable-procesar$sfx"
# Cloud Tasks no existe en europe-southwest1 (Madrid): la cola va en Belgica. Solo guarda el aviso
# "procesa el archivo X" (un id), no documentos; archivos, BD y procesador siguen en Madrid.
$RegionTareas = 'europe-west1'
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

Paso "APIs de Google necesarias"
Invoke-Gcloud @('services', 'enable', 'cloudtasks.googleapis.com', 'aiplatform.googleapis.com')

Paso "Service accounts"
foreach ($sa in @(
    @($SaRunId, "Bandeja Contable API ($Entorno) - ejecucion"),
    @($SaCallId, "Bandeja Contable API ($Entorno) - llamadas desde Salesforce"),
    @($SaProcId, "Bandeja Contable procesador ($Entorno) - ejecucion"))) {
  if (Invoke-Gcloud -Check @('iam', 'service-accounts', 'describe', "$($sa[0])@$Proyecto.iam.gserviceaccount.com")) {
    Write-Host "  $($sa[0]) ya existe"
  } else {
    Invoke-Gcloud @('iam', 'service-accounts', 'create', $sa[0], "--display-name=$($sa[1])")
  }
}

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

Paso "Buckets de la Fase 1: originales ($BucketRaw) y derivados ($BucketDocs)"
foreach ($b in @($BucketRaw, $BucketDocs)) {
  if (Invoke-Gcloud -Check @('storage', 'buckets', 'describe', "gs://$b")) {
    Write-Host "  $b ya existe"
  } else {
    Invoke-Gcloud @('storage', 'buckets', 'create', "gs://$b", "--location=$Region", '--uniform-bucket-level-access', '--public-access-prevention')
  }
}
# El navegador sube directamente a raw: necesita el CORS de Salesforce. docs solo se lee con URL firmadas.
Invoke-Gcloud @('storage', 'buckets', 'update', "gs://$BucketRaw", "--cors-file=$Cors")
# En prod los originales son evidencia: retencion bloqueable (se configurara al crear prod, ver docs/pendientes.md).
# API: crea las sesiones de subida y comprueba los objetos en raw; firma URL de lectura de docs
Invoke-Gcloud @('storage', 'buckets', 'add-iam-policy-binding', "gs://$BucketRaw", "--member=serviceAccount:$SaRun", '--role=roles/storage.objectAdmin')
Invoke-Gcloud @('storage', 'buckets', 'add-iam-policy-binding', "gs://$BucketDocs", "--member=serviceAccount:$SaRun", '--role=roles/storage.objectViewer')
# Procesador: solo lee los originales; escribe los derivados
Invoke-Gcloud @('storage', 'buckets', 'add-iam-policy-binding', "gs://$BucketRaw", "--member=serviceAccount:$SaProc", '--role=roles/storage.objectViewer')
Invoke-Gcloud @('storage', 'buckets', 'add-iam-policy-binding', "gs://$BucketDocs", "--member=serviceAccount:$SaProc", '--role=roles/storage.objectAdmin')

Paso "Permisos de $SaProcId (Cloud SQL, secreto de la BD, Vertex AI)"
Invoke-Gcloud @('secrets', 'add-iam-policy-binding', $Secreto, "--member=serviceAccount:$SaProc", '--role=roles/secretmanager.secretAccessor')
Invoke-Gcloud @('projects', 'add-iam-policy-binding', $Proyecto, "--member=serviceAccount:$SaProc", '--role=roles/cloudsql.client', '--condition=None')
Invoke-Gcloud @('projects', 'add-iam-policy-binding', $Proyecto, "--member=serviceAccount:$SaProc", '--role=roles/aiplatform.user', '--condition=None')

Paso "Cola de Cloud Tasks $Cola"
if (Invoke-Gcloud -Check @('tasks', 'queues', 'describe', $Cola, "--location=$RegionTareas")) {
  Write-Host "  ya existe"
} else {
  # Concurrencia baja para no saturar la BD pequena ni las cuotas de Vertex; reintentos con espera creciente
  Invoke-Gcloud @('tasks', 'queues', 'create', $Cola, "--location=$RegionTareas",
    '--max-concurrent-dispatches=3', '--max-dispatches-per-second=2',
    '--max-attempts=5', '--min-backoff=10s', '--max-backoff=600s')
}
# La API encola tareas; cada tarea llama al procesador con un token OIDC de $SaProcId (actAs)
Invoke-Gcloud @('tasks', 'queues', 'add-iam-policy-binding', $Cola, "--location=$RegionTareas", "--member=serviceAccount:$SaRun", '--role=roles/cloudtasks.enqueuer')
Invoke-Gcloud @('iam', 'service-accounts', 'add-iam-policy-binding', $SaProc, "--member=serviceAccount:$SaRun", '--role=roles/iam.serviceAccountUser')

if ($SoloInfra) {
  Write-Host "`nListo (-SoloInfra): infraestructura creada, Cloud Run sin redesplegar." -ForegroundColor Green
  return
}

$Procesador = "bandeja-contable-procesador$sfx"
Paso "Cloud Run $Procesador (privado; mismo código que la API, SERVICIO=procesador)"
# Una tarea por instancia (analizar PDF y ZIP usa memoria y CPU); hasta 60 min por archivo
$EnvProc = "SERVICIO=procesador,PROJECT_ID=$Proyecto,BUCKET_RAW=$BucketRaw,BUCKET_DOCS=$BucketDocs," +
  "INSTANCE_CONNECTION_NAME=$InstanciaConexion,DB_NAME=$BaseDatos,DB_USER=$UsuarioBD"
Invoke-Gcloud @('run', 'deploy', $Procesador,
  "--source=$Codigo",
  "--region=$Region",
  "--service-account=$SaProc",
  '--no-allow-unauthenticated',
  "--add-cloudsql-instances=$InstanciaConexion",
  '--memory=2Gi', '--cpu=2', '--concurrency=1', '--timeout=3600', '--max-instances=3',
  "--set-env-vars=$EnvProc",
  "--set-secrets=DB_PASSWORD=${Secreto}:latest")
# Cloud Tasks llama al procesador con un token OIDC de su propia cuenta de servicio
Invoke-Gcloud @('run', 'services', 'add-iam-policy-binding', $Procesador, "--region=$Region", "--member=serviceAccount:$SaProc", '--role=roles/run.invoker')

Paso "Cloud Run $Servicio (privado)"
# Si el procesador existe, la API encola cada archivo confirmado; si no, quedan en RECIBIDO
$ProcUrl = & gcloud run services describe "bandeja-contable-procesador$sfx" "--region=$Region" --format='value(status.url)' --project=$Proyecto 2>$null
$EnvApi = "PROJECT_ID=$Proyecto,BUCKET_RAW=$BucketRaw,BUCKET_DOCS=$BucketDocs,INSTANCE_CONNECTION_NAME=$InstanciaConexion," +
  "DB_NAME=$BaseDatos,DB_USER=$UsuarioBD,TASKS_QUEUE=projects/$Proyecto/locations/$RegionTareas/queues/$Cola,TASKS_SA=$SaProc"
if ($ProcUrl) { $EnvApi += ",PROCESADOR_URL=$ProcUrl" } else { Write-Host "  (el procesador aun no existe: los archivos quedaran en RECIBIDO)" }
Invoke-Gcloud @('run', 'deploy', $Servicio,
  "--source=$Codigo",
  "--region=$Region",
  "--service-account=$SaRun",
  '--no-allow-unauthenticated',
  "--add-cloudsql-instances=$InstanciaConexion",
  '--max-instances=2',
  '--cpu-boost',
  # La primera versión (Node) se construyó con buildpacks e imagen base; ahora se construye con el Dockerfile
  '--clear-base-image',
  "--set-env-vars=$EnvApi",
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
