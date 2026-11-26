#!/usr/bin/env bash
# Modelo completo (repositorio PRIVADO) en modelo.modhidrologicotabrsamh.tech, con contraseña (26-nov-2026).
# Correr como root:  curl -fsSL https://raw.githubusercontent.com/SISTEMAPCTAB/agente-hidrometeorologico-cloud/main/vps/instalar_modelo.sh | bash
# 1.ª vez: genera una llave de SÓLO LECTURA (deploy key) y muestra su parte pública para pegarla en GitHub. 2.ª vez: clona y deja la
# actualización automática cada 5 min. La llave privada nunca sale del VPS.
set -euo pipefail
K=/home/modelo/.ssh/modelo_deploy; R=git@github.com:SISTEMAPCTAB/modelo-hidrologico-historico.git
sudo -u modelo mkdir -p /home/modelo/.ssh && chmod 700 /home/modelo/.ssh
[ -f "$K" ] || sudo -u modelo ssh-keygen -q -t ed25519 -N "" -C "vps-modelo-lectura" -f "$K"
grep -q github.com /home/modelo/.ssh/known_hosts 2>/dev/null || ssh-keyscan -t ed25519 github.com 2>/dev/null | sudo -u modelo tee -a /home/modelo/.ssh/known_hosts >/dev/null
export GIT_SSH_COMMAND="ssh -i $K -o IdentitiesOnly=yes"
if ! sudo -u modelo GIT_SSH_COMMAND="$GIT_SSH_COMMAND" git ls-remote -q "$R" HEAD >/dev/null 2>&1; then
  echo; echo "== Falta autorizar la llave en GitHub. Copia la línea siguiente (empieza con ssh-ed25519):"; echo
  cat "$K.pub"; echo
  echo "GitHub → repositorio modelo-hidrologico-historico → Settings → Deploy keys → Add deploy key"
  echo "Title: VPS modelo · Key: la línea de arriba · NO marques 'Allow write access' · Add key. Luego vuelve a correr este comando."
  exit 0
fi
if [ ! -d /srv/modelo/.git ]; then
  rm -rf /srv/modelo.tmp; sudo -u modelo GIT_SSH_COMMAND="$GIT_SSH_COMMAND" git clone -q --depth 1 "$R" /srv/modelo.tmp
  rm -rf /srv/modelo.vieja; [ -d /srv/modelo ] && mv /srv/modelo /srv/modelo.vieja; mv /srv/modelo.tmp /srv/modelo
fi
cat > /usr/local/bin/actualizar-modelo <<UP
#!/usr/bin/env bash
export GIT_SSH_COMMAND="ssh -i $K -o IdentitiesOnly=yes"
cd /srv/modelo && git fetch -q --depth 1 origin main && git reset -q --hard origin/main && git rev-parse --short HEAD > /srv/modelo/VERSION_VPS.txt
UP
chmod 755 /usr/local/bin/actualizar-modelo
printf '[Unit]\nDescription=Actualiza el modelo desde GitHub\n[Service]\nType=oneshot\nUser=modelo\nExecStart=/usr/local/bin/actualizar-modelo\n' > /etc/systemd/system/actualizar-modelo.service
printf '[Unit]\nDescription=Actualiza el modelo cada 5 minutos\n[Timer]\nOnBootSec=2min\nOnUnitActiveSec=5min\n[Install]\nWantedBy=timers.target\n' > /etc/systemd/system/actualizar-modelo.timer
systemctl daemon-reload && systemctl enable --now actualizar-modelo.timer && sudo -u modelo /usr/local/bin/actualizar-modelo
# Caddyfile vigente (oculta .git y datos no publicables también en el modelo)
curl -fsSL https://raw.githubusercontent.com/SISTEMAPCTAB/agente-hidrometeorologico-cloud/main/vps/instalar_portada.sh | bash
echo "== Modelo instalado: https://modelo.modhidrologicotabrsamh.tech (versión $(cat /srv/modelo/VERSION_VPS.txt))"
