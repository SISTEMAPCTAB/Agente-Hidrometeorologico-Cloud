#!/usr/bin/env bash
# Instalación base del VPS del Modelo Hidrológico (srv2203836, 179.236.86.177) · 26-nov-2026
# Se corre UNA vez como root desde la terminal del navegador de hPanel:
#   curl -fsSL https://raw.githubusercontent.com/SISTEMAPCTAB/agente-hidrometeorologico-cloud/main/vps/instalar_base.sh | bash
# Hace: actualizaciones automáticas, cortafuegos interno (22/80/443), usuario 'modelo' sin privilegios, Caddy con HTTPS
# automático para modhidrologicotabrsamh.tech (portada pública) y modelo.modhidrologicotabrsamh.tech (con contraseña).
# No guarda ni muestra contraseñas: la del sitio del modelo se fija después con 'sudo fijar-clave-modelo'.
set -euo pipefail
D=modhidrologicotabrsamh.tech
export DEBIAN_FRONTEND=noninteractive
apt-get update -q && apt-get -y -q upgrade
apt-get -y -q install unattended-upgrades ufw git python3 python3-venv python3-pip curl debian-keyring debian-archive-keyring apt-transport-https gnupg
dpkg-reconfigure -f noninteractive unattended-upgrades
ufw allow 22/tcp; ufw allow 80/tcp; ufw allow 443/tcp; ufw --force enable
id modelo >/dev/null 2>&1 || adduser --disabled-password --gecos "" modelo
# Caddy (repositorio oficial)
if ! command -v caddy >/dev/null; then
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' > /etc/apt/sources.list.d/caddy-stable.list
  apt-get update -q && apt-get -y -q install caddy
fi
mkdir -p /srv/portada /srv/modelo /etc/caddy/claves
chown -R modelo:modelo /srv/portada /srv/modelo
[ -f /srv/portada/index.html ] || echo '<!doctype html><meta charset="utf-8"><title>Modelo Hidrológico Grijalva-Usumacinta</title><h1>Modelo Hidrológico Grijalva-Usumacinta</h1><p>Portada en preparación.</p>' > /srv/portada/index.html
[ -f /srv/modelo/index.html ] || echo '<!doctype html><meta charset="utf-8"><title>Modelo</title><p>Acceso al modelo en preparación.</p>' > /srv/modelo/index.html
[ -f /etc/caddy/claves/modelo.caddy ] || echo 'basic_auth { cerrado $2a$14$000000000000000000000uJ6Yb0u9pXf6dQ9Vfxk8E1l0lYF2b5W }' > /etc/caddy/claves/modelo.caddy
cat > /etc/caddy/Caddyfile <<CF
$D, www.$D {
	root * /srv/portada
	encode gzip
	file_server
	header -Server
}
modelo.$D {
	import /etc/caddy/claves/modelo.caddy
	root * /srv/modelo
	encode gzip
	file_server
	header -Server
}
CF
cat > /usr/local/sbin/fijar-clave-modelo <<'FX'
#!/usr/bin/env bash
# Fija usuario y contraseña del sitio modelo.* (la contraseña se escribe en pantalla oculta y sólo se guarda su hash bcrypt)
set -e; read -rp "Usuario para el modelo: " U; H=$(caddy hash-password)
echo "basic_auth { $U $H }" > /etc/caddy/claves/modelo.caddy; chmod 640 /etc/caddy/claves/modelo.caddy; chgrp caddy /etc/caddy/claves/modelo.caddy
systemctl reload caddy && echo "Listo: usuario $U"
FX
chmod 750 /usr/local/sbin/fijar-clave-modelo
chgrp caddy /etc/caddy/claves/modelo.caddy; chmod 640 /etc/caddy/claves/modelo.caddy
caddy validate --config /etc/caddy/Caddyfile && systemctl enable --now caddy && systemctl reload caddy
echo "== Base instalada. Siguiente: sudo fijar-clave-modelo  (elige usuario y contraseña del sitio del modelo)"
