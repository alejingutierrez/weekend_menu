# Weekend Menu en AWS

`weekend-menu` contiene la EC2 Graviton, RDS PostgreSQL 17 privado y S3 privado. `weekend-menu-ingress` contiene la entrada HTTPS de API Gateway y su enlace privado hacia la EC2. El destino de Apple Wallet se obtiene de `PublicOrigin` en ese stack. Conserva esa URL en las próximas publicaciones. El stack de entrada tiene protección contra eliminación y aplica `gateway-stack-policy.json` para impedir que una actualización reemplace o elimine la API que determina la URL.

## Publicaciones

1. Empaqueta el commit y los archivos públicos del menú en `releases/<SHA>.tar.gz` en el bucket del stack.
2. Ejecuta `install-release.sh BUCKET SHA ORIGIN RUNTIME_SECRET_ARN prepare` en la EC2 mediante Systems Manager. La compilación usa Node 24 y conserva los archivos estáticos.
3. Ejecuta el mismo comando con `activate` y comprueba el menú, el admin autenticado y un pase existente. La activación coteja `PublicOrigin` con la configuración de Secrets Manager antes de reiniciar el servicio.

## Lealtad

Los temporizadores `weekend-wallets.timer` y `weekend-backup.timer` ejecutan los reintentos de Wallet cada diez minutos y el respaldo cifrado diario a las 03:00 de Bogotá. La aplicación verifica el respaldo leyéndolo de S3 y comparando su huella antes de registrarlo en PostgreSQL.

El servicio de Wallet conserva los números de serie y los tokens de los pases existentes. Durante el retiro del dominio antiguo, `/_weekend_legacy_wallet/` identifica el tráfico reenviado. El registro de la aplicación distingue ese tráfico de las consultas directas a AWS y usa huellas para los pases y dispositivos. Una consulta de un dispositivo registrado también deja constancia cuando recibe `204` porque su pase ya está al día.
