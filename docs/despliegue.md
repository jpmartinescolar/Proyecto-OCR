# Despliegue y rollback

Flujo manual mientras no exista CI/CD. Sustituye al antiguo `DEPLOYMENT.md`.

## Ramas
- `main` refleja el estado del sandbox en lo que versionamos (Apex, Visualforce, Aura, LWC, recursos estáticos, triggers).
- La Bandeja Contable se desarrolla en `feature/bandeja-contable`; el prototipo antiguo queda en `legacy/prototipo-buzon-contable` (antes `test/buzon-contable`; sin fusionar, solo referencia).
- **Otras personas cambian el sandbox directamente sin git** (p. ej. `areaContableFiscal`). Antes de fusionar a `main`, comprobar que `main` sigue igual al sandbox:
  ```
  cd salesforce-sandbox
  sf project retrieve start -o sandbox -x manifest/package.xml --target-metadata-dir <carpeta temporal fuera del proyecto> --unzip
  ```
  y comparar con `main` ignorando fin de línea (`diff -rq --strip-trailing-cr`). En Windows, un retrieve sobre el propio proyecto marca cientos de archivos por CRLF/LF: comprobar el diff real con `git diff --stat`.

## Salesforce (sandbox)

**Siempre con el manifest propio, nunca con `package.xml`:**

```
cd salesforce-sandbox
sf project deploy validate -x manifest/bandeja-contable.xml -o sandbox -l RunSpecifiedTests \
  -t BandejaContableControllerTest -t BandejaContableGcpServiceTest -t BandejaContableEmpresasServiceTest
# si la validación pasa, despliegue rápido sin repetir tests:
sf project deploy quick --job-id <id de la validación> -o sandbox
```

- Al añadir componentes nuevos, añadirlos también a `manifest/bandeja-contable.xml`.
- Tests locales de LWC: `npx sfdx-lwc-jest -- force-app/main/default/lwc/bandejaContable` y `npx eslint "force-app/main/default/lwc/bandejaContable*/**/*.js"`.
- Los tests de Apex se ejecutan con un asesor de prueba propio (`BandejaContableTestData`): no dependen de los permisos de quien los lanza.
- Permisos: `sf org assign permset -n Bandeja_Contable_Asesor -o sandbox -b <username>`.

## Google Cloud
- **Crear o actualizar un entorno** (idempotente): `gcp-bandeja-contable/infra/crear-entorno.ps1 -Entorno dev`. Requiere `gcloud` autenticado (en este equipo, desde PowerShell; `gcloud auth login` si caduca la sesión).
- **Redesplegar solo el código de la API:**
  ```
  cd gcp-bandeja-contable
  gcloud run deploy bandeja-contable-api-dev --source . --region europe-southwest1 --project centro-de-inteligencia-500407
  ```
  Cloud Build construye el contenedor en Google a partir del código local.
- **Comprobar el arranque:**
  ```
  gcloud logging read "resource.type=cloud_run_revision AND resource.labels.service_name=bandeja-contable-api-dev" --limit=10 --freshness=15m
  ```
- **Certificado de Salesforce:** crear un certificado autofirmado en Setup → Certificate and Key Management (no exportable) y subir el `.crt`:
  ```
  gcloud iam service-accounts keys upload <cert>.crt --iam-account=bandeja-contable-caller-dev@centro-de-inteligencia-500407.iam.gserviceaccount.com
  ```

## Rollback
- **Si la validación falla:** no se desplegó nada.
- **Componente modificado:** redesplegar la versión anterior desde git (`git show <commit>:<ruta> > <ruta>` y desplegar solo ese componente con `--source-dir`).
- **Componentes nuevos:** no se "revierten"; se borran con un `destructiveChanges` revisado (`sf project deploy start --manifest <package vacío> --post-destructive-changes <destructiveChanges.xml>`). Revisar siempre la lista con el usuario antes de ejecutar.
- **Google:** Cloud Run conserva las revisiones anteriores; volver a una con:
  ```
  gcloud run services update-traffic <servicio> --to-revisions <revisión>=100 --region europe-southwest1
  ```
- Crear un tag de respaldo antes de despliegues grandes: `git tag pre-deploy-<tema>-<fecha>`.

## Retirada del prototipo del sandbox

El prototipo de la rama `legacy/prototipo-buzon-contable`, antes `test/buzon-contable` (desplegado el 24/09/2026) sigue en el sandbox y convive con la Bandeja Contable. Su pestaña es **Bandeja Contable Panel** (`/lightning/n/Bandeja_Contable_Panel`); la buena es **Bandeja Contable** (`/lightning/n/Bandeja_Contable`). Manifiesto: `salesforce-sandbox/manifest/retirada-prototipo/`. Validado el 28/09 (31/31 tests) salvo los dos puntos que necesitan un paso previo.

1. Quitar la asignación del permiso `Bandeja_Contable_Access` (hoy: Ivan Mendoza).
2. Borrar los registros del formato antiguo (una bandeja por archivo): BC-00003 y BC-00004.
3. Desplegar el borrado:
   ```
   sf project deploy start -x manifest/retirada-prototipo/package.xml \
     --post-destructive-changes manifest/retirada-prototipo/destructiveChanges.xml -o sandbox \
     -l RunSpecifiedTests -t BandejaContableControllerTest -t BandejaContableGcpServiceTest \
     -t BandejaContableEmpresasServiceTest -t BandejaContableClienteServiceTest
   ```
4. Manual en Setup: *Objetos* → *Objetos eliminados* → `Buzon_test__c` → **Borrar** (definitivo). Mientras siga en la papelera, la lista de valores global `Tipo_Documentacion_Buzon` no se puede borrar.
5. Después, borrar `Tipo_Documentacion_Buzon` (GlobalValueSet) con otro `destructiveChanges`.

No toca el Buzón contable de producción (`Buzon_contable__c`, `areaContableFiscal`) ni la lista `Tipo_Documentacion_Bandeja_Contable`, que usa la Bandeja.
