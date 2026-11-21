#!/usr/bin/env bash
# Configure boot startup for the production site (Nginx) and rhyme service (systemd).
set -Eeuo pipefail

usage() { printf 'Использование: sudo %s ДОМЕН\nПример: sudo %s poetry.example.com\n' "$0" "$0" >&2; }
[[ $# -eq 1 ]] || { usage; exit 2; }
domain=$1
if [[ $EUID -ne 0 ]]; then echo 'Запустите скрипт через sudo.' >&2; exit 1; fi
# A single ASCII DNS hostname, not an arbitrary nginx expression.
if [[ ! "$domain" =~ ^[a-zA-Z0-9]([a-zA-Z0-9.-]*[a-zA-Z0-9])?$ || ${#domain} -gt 253 || "$domain" == *..* ]]; then
  echo 'Укажите один корректный ASCII-домен без схемы, порта и специальных символов.' >&2; exit 2
fi
site=/home/poetry-editor
backend=/home/stroke-rhyme-server
nginx_file=/etc/nginx/sites-available/stroka
nginx_link=/etc/nginx/sites-enabled/stroka
limit_file=/etc/nginx/conf.d/stroka-limit.conf
unit_file=/etc/systemd/system/stroka-rhyme.service
for cmd in systemctl nginx espeak-ng sudo; do command -v "$cmd" >/dev/null || { echo "Не найдена команда: $cmd" >&2; exit 1; }; done
id stroka >/dev/null 2>&1 || { echo 'Не найден пользователь stroka. Сначала выполните первоначальную настройку из deploy/README.md.' >&2; exit 1; }
for file in "$site/dist/index.html" "$site/deploy/nginx.conf" "$backend/deploy/stroka-rhyme.service" "$backend/.venv/bin/uvicorn" "$backend/.venv/bin/python"; do
  [[ -f "$file" ]] || { echo "Не найден $file. Сначала установите и соберите приложение по deploy/README.md." >&2; exit 1; }
done
sudo -u stroka env NLTK_DATA=/home/stroke-rhyme-server/nltk_data "$backend/.venv/bin/python" -c 'import fastapi, uvicorn, rhymetagger, nltk; nltk.data.find("tokenizers/punkt"); nltk.data.find("tokenizers/punkt_tab")' || {
  echo 'Не найдены Python-зависимости или ресурсы NLTK. Выполните подготовку сервиса из deploy/README.md.' >&2; exit 1;
}
# Refuse to replace an existing site: Certbot or an administrator may have changed it.
if [[ -e "$nginx_file" ]]; then
  if ! grep -Fq "server_name $domain;" "$nginx_file"; then
    echo "Конфигурация $nginx_file уже существует с другим доменом. Проверьте её вручную; она не изменена." >&2; exit 1
  fi
fi
if [[ -e "$limit_file" ]] && ! grep -Fq 'zone=stroka_api:10m rate=1r/s;' "$limit_file"; then
  echo "Конфигурация лимита $limit_file уже существует и отличается. Проверьте её вручную." >&2; exit 1
fi
if [[ -L "$nginx_link" ]]; then
  [[ "$(readlink -f "$nginx_link")" == "$nginx_file" ]] || { echo "$nginx_link указывает на другой файл." >&2; exit 1; }
elif [[ -e "$nginx_link" ]]; then
  echo "$nginx_link уже существует и не является ссылкой. Проверьте вручную." >&2; exit 1
fi
if [[ -e "$unit_file" ]] && ! cmp -s "$backend/deploy/stroka-rhyme.service" "$unit_file"; then
  echo "Служба $unit_file уже существует и отличается. Проверьте её вручную; она не изменена." >&2; exit 1
fi
new_config=0; new_limit=0; new_link=0
if [[ ! -e "$nginx_file" ]]; then sed "s/server_name example\\.com;/server_name $domain;/" "$site/deploy/nginx.conf" > "$nginx_file"; new_config=1; fi
if [[ ! -e "$limit_file" ]]; then printf '%s\n' 'limit_req_zone $binary_remote_addr zone=stroka_api:10m rate=1r/s;' > "$limit_file"; new_limit=1; fi
if [[ ! -L "$nginx_link" ]]; then ln -s "$nginx_file" "$nginx_link"; new_link=1; fi
if ! nginx -t; then
  echo 'Ошибка Nginx. Новые файлы конфигурации будут удалены; существующие файлы не изменены.' >&2
  ((new_link==0)) || rm -f "$nginx_link"
  ((new_config==0)) || rm -f "$nginx_file"
  ((new_limit==0)) || rm -f "$limit_file"
  exit 1
fi
if [[ ! -e "$unit_file" ]]; then install -m 0644 "$backend/deploy/stroka-rhyme.service" "$unit_file"; fi
systemctl daemon-reload
systemctl enable --now stroka-rhyme.service
systemctl enable --now nginx.service
systemctl reload nginx.service
systemctl is-active --quiet stroka-rhyme.service || { echo 'Служба анализа не запустилась. Проверьте journalctl -u stroka-rhyme.service.' >&2; exit 1; }
systemctl is-active --quiet nginx.service || { echo 'Nginx не запустился. Проверьте journalctl -u nginx.service.' >&2; exit 1; }
echo 'Готово: Nginx и анализатор рифм включены в автозапуск.'
echo 'Проверьте сайт и /api/health. HTTPS настраивается отдельно — см. deploy/README.md.'
