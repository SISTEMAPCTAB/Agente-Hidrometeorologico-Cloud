#!/usr/bin/env bash
# Portada pública (opción A, 26-nov-2026): la página del Agente servida en modhidrologicotabrsamh.tech desde el VPS.
# Correr como root:  curl -fsSL https://raw.githubusercontent.com/SISTEMAPCTAB/agente-hidrometeorologico-cloud/main/vps/instalar_portada.sh | bash
# Copia ligera (--depth 1) del repositorio público del Agente en /srv/agente, actualizada cada 5 min por un timer de systemd.
set -euo pipefail
D=modhidrologicotabrsamh.tech; R=https://github.com/SISTEMAPCTAB/agente-hidrometeorologico-cloud.git
if [ ! -d /srv/agente/.git ]; then sudo -u modelo git clone -q --depth 1 "$R" /srv/agente.tmp 2>/dev/null || git clone -q --depth 1 "$R" /srv/agente.tmp; mv /srv/agente.tmp /srv/agente; fi
rm -rf /srv/agente/data/cfe_vasos   # datos del FTP de CFE: los usa el modelo, no se publican (Gilberto, 26-nov-2026)
chown -R modelo:modelo /srv/agente
M=https://github.com/SISTEMAPCTAB/Mapa-Operativo-Hidrometeorologico-Tabasco.git
if [ ! -d /srv/mapa/.git ]; then git clone -q --depth 1 "$M" /srv/mapa; fi
chown -R modelo:modelo /srv/mapa
cat > /usr/local/bin/actualizar-portada <<'UP'
#!/usr/bin/env bash
cd /srv/agente && git fetch -q --depth 1 origin main && git reset -q --hard origin/main && rm -rf /srv/agente/data/cfe_vasos && git gc -q --prune=now --auto
cd /srv/mapa && git fetch -q --depth 1 origin main && git reset -q --hard origin/main
UP
chmod 755 /usr/local/bin/actualizar-portada
cat > /etc/systemd/system/actualizar-portada.service <<'SV'
[Unit]
Description=Actualiza la portada (copia del Agente)
[Service]
Type=oneshot
User=modelo
ExecStart=/usr/local/bin/actualizar-portada
SV
cat > /etc/systemd/system/actualizar-portada.timer <<'TM'
[Unit]
Description=Actualiza la portada cada 5 minutos
[Timer]
OnBootSec=1min
OnUnitActiveSec=5min
[Install]
WantedBy=timers.target
TM
systemctl daemon-reload && systemctl enable --now actualizar-portada.timer
cat > /etc/caddy/Caddyfile <<CF
$D, www.$D {
	root * /srv/agente
	encode gzip
	@oculto path /data/cfe_vasos/* /.git* /src/* /config/* /cloudflare/* /vps/* /requirements.txt /package.json
	respond @oculto 404
	redir / /app/ 302
	redir /mapa /mapa/ 301
	handle_path /mapa/* {
		root * /srv/mapa
		file_server
	}
	# el mapa lee los datos con la ruta de GitHub Pages del Agente
	handle_path /Agente-Hidrometeorologico-Cloud/* {
		@ocultoA path /data/cfe_vasos/* /.git* /src/* /config/* /cloudflare/* /vps/*
		respond @ocultoA 404
		root * /srv/agente
		file_server
	}
	file_server
	header -Server
	header /data/* Cache-Control "no-cache"
}
modelo.$D {
	import /etc/caddy/claves/modelo.caddy
	root * /srv/modelo
	encode gzip
	file_server
	header -Server
}
CF
caddy validate --config /etc/caddy/Caddyfile && systemctl reload caddy
echo "== Portada instalada: https://$D (se actualiza cada 5 min)"
