# Weekend Club — Configuración de wallets

La Fase 1 (registro, sellos, premios) **ya funciona sin ninguna cuenta externa**:
el staff sella escaneando el QR de la tarjeta en `/card/<id>`.

Para que los clientes puedan **guardar la tarjeta en Apple Wallet / Google
Wallet** y que el sello se actualice solo en su teléfono, hay que dar de alta
unas cuentas y cargar sus credenciales como variables de entorno. Esta guía es
ese checklist.

> Todas las credenciales se guardan como variables de entorno (en Vercel y en
> `.env.local` para desarrollo). Los `.p12`, `.p8`, `.pem` y el JSON del service
> account se codifican en **base64** (una sola línea) — nunca se commitean.

---

## Google Wallet (gratis)

1. **Proyecto en Google Cloud** — https://console.cloud.google.com → crea un
   proyecto (p. ej. `weekend-club`).
2. **Habilita la Google Wallet API** — APIs & Services → Library → "Google
   Wallet API" → Enable.
3. **Service account** — IAM & Admin → Service Accounts → Create. Dale un
   nombre, crea una **clave JSON** y descárgala.
4. **Alta como emisor (issuer)** — entra a la **Google Pay & Wallet Console**
   (https://pay.google.com/business/console), sección Google Wallet API.
   Completa los datos del negocio → obtienes un **Issuer ID** (número).
   - En la misma consola, en _Users_, autoriza el **email del service account**
     para que pueda crear pases.
   - Nota: la aprobación para producción puede tardar días. Mientras tanto
     funciona en **modo demo** (solo cuentas de prueba autorizadas pueden
     guardar el pase). Sirve para probar todo.
5. **Variables de entorno:**
   ```
   GOOGLE_WALLET_ISSUER_ID=3388000000022...      # el número del issuer
   GOOGLE_WALLET_CLASS_ID=3388000000022....weekend_club
   GOOGLE_WALLET_SERVICE_ACCOUNT=<base64 del JSON>
   ```
   Para el base64 del JSON:
   ```bash
   base64 -i service-account.json | tr -d '\n'
   ```

---

## Apple Wallet (Apple Developer, 99 USD/año)

1. **Apple Developer Program** — https://developer.apple.com/programs →
   inscríbete (99 USD/año). Anota tu **Team ID** (Membership details).
2. **Pass Type ID** — Certificates, Identifiers & Profiles → Identifiers → `+`
   → _Pass Type IDs_ → crea `pass.com.weekendburger.loyalty` (o el que prefieras).
3. **Certificado de firma del pase:**
   - En _Keychain Access_ (Mac): Certificate Assistant → Request a Certificate
     from a CA → guarda un `.certSigningRequest`.
   - En el portal, sobre el Pass Type ID → Create Certificate → sube el CSR →
     descarga el `.cer`.
   - Ábrelo (se instala en Keychain) → botón derecho → **Export** como `.p12`
     con contraseña.
4. **Certificado WWDR** — descarga el "Apple Worldwide Developer Relations"
   intermedio (G4) desde https://www.apple.com/certificateauthority/ (`.cer`);
   conviértelo a `.pem` si hace falta:
   ```bash
   openssl x509 -inform der -in AppleWWDRCAG4.cer -out wwdr.pem
   ```
5. **Actualizaciones de Apple Wallet** — APNs usa el mismo certificado y
   clave privada del pase. La clave `.p8` no se usa para esta integración.
6. **Variables de entorno** (todo en base64 con `base64 -i archivo | tr -d '\n'`):
   ```
   APPLE_PASS_TYPE_ID=pass.com.weekendburger.loyalty
   APPLE_TEAM_ID=XXXXXXXXXX
   APPLE_PASS_CERT=<base64 del .p12>
   APPLE_PASS_CERT_PASSWORD=<contraseña del .p12>
   APPLE_WWDR_CERT=<base64 del wwdr.pem>
   ```

---

## Dónde poner las variables

- **Local:** en `.env.local` (ignorado por git). Ver `.env.example`.
- **Producción:** Vercel → Project → Settings → Environment Variables.

## ⚠️ Sobre `SESSION_SECRET`

`SESSION_SECRET` firma las sesiones de administrador y se conserva para leer el
archivo Blob antiguo. Los QR y tokens de Wallet existentes se preservan en la
base con sus valores originales. Antes de cambiar la clave de administrador,
comprueba que cada tarjeta y alias tenga su token permanente; no cambies el
identificador ni el token de pases instalados.

Las copias nuevas usan `LOYALTY_BACKUP_KEY`, independiente de la sesión.
Consulta [el procedimiento de protección y recuperación](docs/loyalty-resilience-runbook.md).

---

## Imágenes de los pases (placeholders)

De momento las imágenes son **placeholders** de color rojo de marca:

- **Google:** logo del programa en `public/wallet-logo.png` (300×300). Reemplázalo
  por tu logo real, o define `GOOGLE_WALLET_LOGO_URL` con otra URL pública.
- **Apple:** si creas la carpeta `assets/pass/` con `icon.png` (29×29),
  `icon@2x.png` (58×58), `logo.png` y `logo@2x.png`, el pase usará esas en vez
  de los placeholders. Si no existen, se generan cuadros rojos válidos.
