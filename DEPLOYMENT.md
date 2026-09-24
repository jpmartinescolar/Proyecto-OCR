# Flujo Git ↔ Salesforce Sandbox: sincronización, despliegue y rollback

Este documento resume el flujo de trabajo manual mientras no exista el pipeline de GitHub Actions. Se aplica al proyecto sfdx en `salesforce-sandbox/`, contra el Sandbox `sandbox` (`comunidad--full.sandbox.my.salesforce.com`).

## 1. Estado de las ramas

- `main` es la fuente de verdad: debe reflejar siempre el estado actual del Sandbox.
- Las features se desarrollan en ramas `test/<nombre>` y se integran a `main` por merge (fast-forward cuando sea posible) una vez validadas en el Sandbox.
- Antes de cada despliegue manual, crear un tag de respaldo sobre `main`:
  ```
  git tag pre-deploy-<feature>-<fecha>
  git push origin pre-deploy-<feature>-<fecha>
  ```
  Salesforce **no genera backups automáticos restaurables de metadata** antes de un deploy (solo queda registro no reversible en Setup → Deployment Status / Setup Audit Trail). Mientras no haya CI/CD, este tag es el único punto de retorno inmediato.

### Verificar que `main` sigue igual al Sandbox

```
cd salesforce-sandbox
sf project retrieve start -x manifest/package.xml -o sandbox
git status
```

**Importante — ruido de fin de línea:** en Windows, con `core.autocrlf=true`, un retrieve puede marcar cientos de archivos como modificados por diferencias CRLF/LF aunque el contenido sea idéntico. Antes de decidir qué comitear, comprobar el diff real (ignora los `warning: LF will be replaced by CRLF`):
```
git diff --stat
```
Si la lista de archivos con cambios reales es mucho más corta que `git status --short`, el resto es ruido: descartarlo con
```
git checkout --pathspec-from-file=<archivo-con-la-lista> --
```
(usar `--pathspec-from-file` en vez de pasar cientos de rutas como argumentos: en Windows se llega al límite de `Argument list too long`).

## 2. Componente Google Cloud Storage ("Buzón Contable")

Arquitectura confirmada (no es un iframe): LWC `testSubirFacturasA` → Apex `SubirFacturasController` → `GcpBuzonService` (callout `callout:{Named_Credential__c}/upload-session` a una API intermedia en Cloud Run) → el navegador sube el archivo directo a la URL de sesión resumible de GCS vía `subidaResumible.js`. `GcpSyncQueueable` reintenta confirmaciones fallidas. `BuzonEmpresasService` revalida la empresa en servidor.

Por defecto `Buzon_Test_Config__mdt.Default.Modo_simulado__c = true`: no hay callouts reales todavía.

### Configurar las credenciales de forma segura

1. Confirmar con quien programó la API de Cloud Run (`buzon-api`) qué autenticación espera (API Key, OAuth2 Client Credentials, JWT firmado por Salesforce).
2. Setup → Named Credentials → crear un **External Credential** con ese protocolo, guardando el secreto en el almacén cifrado de Salesforce (nunca en Custom Metadata ni en el repo).
3. Crear el **Named Credential** `GCP_Buzon_Test` (debe coincidir exactamente con `Buzon_Test_Config__mdt.Default.Named_Credential__c`) apuntando a la URL base de Cloud Run.
4. Asignar el Principal del Named Credential al Permission Set `Buzon_Test_Access`.
5. Regla de oro: la definición (URL, nombre) puede versionarse; el valor del secreto jamás se comitea.
6. Probar el callout real en el Sandbox (Apex anónimo o Workbench contra `GcpBuzonService`, con `Modo_simulado__c = false` solo para la prueba) antes de activarlo para usuarios.
7. Revisar el Custom Permission `Buzon_Test_Cualquier_Empresa` (modo "cualquier empresa visible") antes de asignarlo a perfiles de portal/Experience Cloud en producción.

## 3. Checklist antes de desplegar

- `sf project deploy validate` (dry-run) antes de cualquier deploy real.
- Tests Apex: `BuzonEmpresasServiceTest`, `GcpBuzonServiceTest`, `SubirFacturasControllerTest`.
- Tests Jest del LWC: `testSubirFacturasA/__tests__/validacionArchivo.test.js` (`npm run test:unit` en `salesforce-sandbox/`).
- El Named Credential (paso 2) debe existir en el Sandbox **antes** de desplegar el Custom Metadata que lo referencia.
- Calcular el diff exacto a desplegar (nunca `force-app` completo):
  ```
  git diff main...test/buzon-contable --name-only -- salesforce-sandbox/force-app
  ```

## 4. Despliegue

```
cd salesforce-sandbox
sf project deploy validate --source-dir <paths del diff> -o sandbox --test-level RunSpecifiedTests --tests BuzonEmpresasServiceTest,GcpBuzonServiceTest,SubirFacturasControllerTest
sf project deploy start    --source-dir <paths del diff> -o sandbox --test-level RunSpecifiedTests --tests BuzonEmpresasServiceTest,GcpBuzonServiceTest,SubirFacturasControllerTest
```

Tras el deploy: smoke test manual del LWC en el Sandbox (crear un `Buzon_test__c` de prueba en modo simulado).

Merge a `main` solo después del smoke test exitoso:
```
git checkout main
git merge --ff-only test/buzon-contable   # o "git merge test/buzon-contable" si ya no es fast-forward
git push origin main
```

## 5. Plan de rollback

- **Si `deploy validate` falla:** no se desplegó nada, no hay rollback que hacer.
- **Si el deploy tuvo éxito pero causa un problema:**
  - Componentes **modificados** (ya existían): restaurar la versión anterior desde el tag de respaldo y redesplegar solo esos archivos:
    ```
    git show pre-deploy-<feature>-<fecha>:<path> > <path>
    sf project deploy start --source-dir <path> -o sandbox
    ```
  - Componentes **nuevos** (todo lo que agrega `test/buzon-contable`: `Buzon_test__c`, `Buzon_Test_Config__mdt`, permission sets, LWC, Apex, tab, flexipage, global value set, custom permission): no se pueden "revertir", hay que **borrarlos explícitamente** con un deploy de destructive changes. El manifest de ejemplo ya está preparado en [`salesforce-sandbox/manifest/destructiveChanges-buzon-contable-example.xml`](salesforce-sandbox/manifest/destructiveChanges-buzon-contable-example.xml):
    ```
    cd salesforce-sandbox
    sf project deploy start -o sandbox \
      --manifest manifest/package.xml \
      --post-destructive-changes manifest/destructiveChanges-buzon-contable-example.xml
    ```
  - Datos de prueba: si quedaron registros `Buzon_test__c`, limpiar por SOQL/Workbench (opcional).
- Regla operativa: **crear el tag de respaldo antes de cada deploy**, no después. Es la única forma de tener un punto de retorno inmediato hasta que exista el pipeline de GitHub Actions.
