# Importaciones Hapi y XTB

El módulo convierte confirmaciones reales en transacciones del portafolio. No crea operaciones de demostración.

Para Hapi se aceptan únicamente mensajes cuya operación ya fue ejecutada (`Order Executed`, `Order completed` o sus equivalentes en español). Los avisos `Order Placed`/`Order submitted` se descartan porque todavía no representan una compra o venta definitiva. El correo aporta el ticker; el nombre de la empresa, mercado, moneda y símbolo del proveedor se toman exclusivamente de la validación de Twelve Data.

## Flujo disponible

1. El usuario carga un archivo o reenvía un correo a su dirección privada.
2. El backend extrae broker, cuenta, compra/venta, activo, cantidad, precio, moneda y fecha de ejecución.
3. El símbolo y el nombre de la empresa se comparan con el buscador oficial de Twelve Data. La coincidencia guarda el nombre, bolsa, moneda, tipo de activo y símbolo del proveedor.
4. Cada fila se valida y se compara con las transacciones existentes mediante el identificador de orden y una huella normalizada.
5. Las filas dudosas quedan pendientes para corrección; las repetidas se marcan como duplicadas.
6. Al confirmar, solo las filas aprobadas crean transacciones reales y reconstruyen los lotes FIFO.

Una coincidencia por ticker no es suficiente cuando el correo también contiene el nombre de la empresa: ambos deben corresponder. Si existen varias cotizaciones del mismo ticker, se priorizan la bolsa, moneda y país derivados del documento del broker. Una coincidencia ambigua nunca se aprueba automáticamente.

Se aceptan archivos `.eml`, `.pdf`, `.csv` y `.txt`, con un máximo de 12 MB. Una contraseña introducida en la carga manual se utiliza solo durante esa lectura. También puede guardarse por cuenta XTB para la sincronización automática: se cifra con AES-256-GCM antes de persistirla en `broker_credentials` y nunca se devuelve al navegador.

Los adjuntos recibidos desde Outlook o por webhook se leen en memoria y no se almacenan. Para XTB se acepta exclusivamente el remitente `dailystatements@mail.xtb.com`, el asunto `Confirmación de ejecución de orden - <cuenta>` y el adjunto `<cuenta>_AAAAMMDD_DailyStatement.pdf`. La cuenta del asunto y del archivo debe existir en la plataforma; el lector usa únicamente su secreto cifrado y extrae cada compra o venta de la tabla del informe.

## Conexión gratuita con Outlook mediante Microsoft Graph

Esta es la opción recomendada. No requiere dominio ni reglas de reenvío. La aplicación usa OAuth 2.0 con PKCE y solicita solamente `User.Read` y `Mail.Read`. Nunca recibe ni almacena la contraseña de Outlook. El caché de tokens se cifra con AES-256-GCM antes de guardarse en PostgreSQL.

### Registrar la aplicación en Microsoft

1. Entra en [Microsoft Entra admin center](https://entra.microsoft.com/) y abre **Entra ID > App registrations > New registration**.
2. Usa un nombre como `Mi Portafolio Local`.
3. Selecciona **Accounts in any organizational directory and personal Microsoft accounts**.
4. En **Redirect URI**, elige **Web** y registra exactamente `http://localhost:3000/api/imports/outlook/callback`.
5. Abre **Certificates & secrets > Client secrets > New client secret**. Copia el campo **Value**; Microsoft lo muestra una sola vez.
6. En **API permissions**, agrega permisos delegados de Microsoft Graph: `User.Read` y `Mail.Read`. `Mail.Read` no requiere consentimiento administrativo para una cuenta personal.
7. Copia el **Application (client) ID** de la vista general.

Configura `backend/.env`:

```env
MICROSOFT_CLIENT_ID=application-client-id
MICROSOFT_CLIENT_SECRET=valor-del-client-secret
MICROSOFT_REDIRECT_URI=http://localhost:3000/api/imports/outlook/callback
TOKEN_ENCRYPTION_KEY=64-caracteres-hexadecimales-aleatorios
OUTLOOK_SYNC_INTERVAL_MINUTES=5
```

Genera la clave de cifrado con:

```powershell
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Reinicia el backend y pulsa **Conectar Outlook** en la pantalla de Importaciones. La sincronización programada consulta solamente mensajes nuevos cada cinco minutos. Desde la interfaz puedes buscar operaciones de los últimos 1, 3, 6, 12, 24 o 60 meses; la consulta pagina hasta 5.000 mensajes por ejecución.

Antes de buscar confirmaciones históricas XTB, registra en **Cuentas** el mismo número que aparece en el asunto del correo y guarda la contraseña del PDF en **Contraseña cifrada por cuenta**. Al guardar o actualizarla se vuelven a intentar los documentos protegidos. Si XTB rechaza la clave, la interfaz indica el número exacto que debe corregirse. La búsqueda excluye otras cuentas, dividendos, extractos, comunicaciones legales y publicidad; además elimina del historial los falsos positivos anteriores que no hayan creado transacciones.

Un informe XTB que no puede descifrarse permanece visible en el historial con estado **Fallida**. No se inventan filas mientras el PDF esté cerrado. Al actualizar la contraseña, el mismo correo se reintenta: el fallo anterior se reemplaza por una fila de revisión por cada operación encontrada, usando el mismo formulario de validación que Hapi.

## Reenvío automático desde Outlook

La aplicación genera una dirección como `importar+alias@tu-dominio.com`. Para que reciba correo en producción:

1. Configura `IMPORT_EMAIL_DOMAIN` con un dominio que pueda recibir correo.
2. Configura un proveedor de correo entrante para entregar el mensaje en `POST /api/imports/inbound/email`.
3. Envía el secreto de `INBOUND_EMAIL_SECRET` en el encabezado `x-inbound-secret`.
4. Crea en Outlook una regla que reenvíe las confirmaciones de Hapi y XTB a la dirección privada mostrada por la aplicación.

`imports.localhost` sirve para desarrollo y no recibe correo público. No es necesario entregar las credenciales de Outlook a esta aplicación cuando se usa reenvío.

Ejemplo de payload del proveedor de correo:

```json
{
  "to": "importar+alias@tu-dominio.com",
  "from": "confirmaciones@broker.example",
  "subject": "Confirmación de operación",
  "text": "Contenido de la confirmación",
  "messageId": "identificador-unico-del-mensaje",
  "receivedAt": "2026-07-12T15:30:00-05:00",
  "attachments": [
    {
      "filename": "orden.pdf",
      "contentType": "application/pdf",
      "contentBase64": "..."
    }
  ]
}
```

Los mensajes repetidos se rechazan por `messageId`; las operaciones repetidas no se vuelven a registrar.
