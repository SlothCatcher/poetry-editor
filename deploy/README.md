# Автоматическое развёртывание на Linux через GitHub Actions

Этот пример предназначен для Ubuntu/Debian, Nginx и systemd. При push в `main` GitHub подключается по SSH к серверу: сайт обновляется и собирается, а Python-сервис обновляется, проходит тесты и перезапускается. Созданы **два локальных репозитория** — их сначала нужно опубликовать на GitHub. Настройка не выполнена автоматически на вашем сервере.

## 1. Опубликуйте оба репозитория

Создайте два пустых репозитория на GitHub (например `stroka-site` и `stroka-rhyme-server`) и отправьте в них соответствующие локальные репозитории. Команды выполняются в рабочем окружении, замените `OWNER` и имена репозиториев:

```sh
cd /home/user/poetry-editor
git remote add origin git@github.com:OWNER/stroka-site.git
git push -u origin main
cd /home/user/stroka-rhyme-server
git remote add origin git@github.com:OWNER/stroka-rhyme-server.git
git push -u origin main
```

Для push нужна ваша аутентификация GitHub. Если remote уже настроен, не добавляйте его повторно; проверьте `git remote -v`.

## 2. Подготовьте сервер

Подключитесь по SSH под пользователем с правами sudo. На сервере установите Git, Nginx, Python с venv и eSpeak NG, а также Node.js 20 или новее с npm. Команды для Ubuntu/Debian:

```sh
sudo apt update
sudo apt install -y git nginx python3 python3-venv python3-pip espeak-ng curl
node --version  # нужна версия 20 или новее; установите Node.js отдельно, если его нет
npm --version
sudo adduser --disabled-password --gecos '' stroka
sudo mkdir -p /srv/stroka
sudo chown stroka:stroka /srv/stroka
sudo chmod 755 /srv /srv/stroka
```

Если пользователь `stroka` уже существует, вместо `adduser` проверьте его настройки. Далее примеры предполагают учётную запись `stroka` для деплоя и работы службы; доступ к ней должен быть только у доверенных администраторов и GitHub Actions. Nginx нужен доступ на чтение `/srv/stroka/site/dist`.

Под пользователем `stroka` клонируйте оба репозитория и выполните первоначальную настройку. Для публичных репозиториев подойдут HTTPS-адреса:

```sh
sudo -iu stroka
cd /srv/stroka
git clone https://github.com/OWNER/stroka-site.git site
git clone https://github.com/OWNER/stroka-rhyme-server.git rhyme-server
cd site && npm ci && npm run build
cd /srv/stroka/rhyme-server
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
mkdir -p /srv/stroka/nltk_data
NLTK_DATA=/srv/stroka/nltk_data .venv/bin/python -m nltk.downloader punkt punkt_tab
NLTK_DATA=/srv/stroka/nltk_data .venv/bin/python -m unittest discover -s tests
exit
```

Для **приватных** репозиториев серверу нужны отдельные read-only deploy keys с доступом на чтение к каждому репозиторию, или доступ через отдельный сервисный аккаунт. Ключ для входа GitHub Actions на ваш сервер — другой ключ. Не помещайте токены или приватные ключи в файлы репозитория. Убедитесь, что `git fetch origin main` работает без интерактивного запроса под пользователем `stroka`.

## 3. Настройте службу и Nginx

```sh
sudo cp /srv/stroka/rhyme-server/deploy/stroka-rhyme.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now stroka-rhyme.service
sudo systemctl status stroka-rhyme.service
curl http://127.0.0.1:8002/api/health
```

Разрешите пользователю деплоя без пароля только перезапуск этой службы. Создайте файл через `sudo visudo -f /etc/sudoers.d/stroka-deploy` и добавьте строку (проверьте путь `command -v systemctl`; в шаблоне используется `/usr/bin/systemctl`):

```text
stroka ALL=(root) NOPASSWD: /usr/bin/systemctl restart stroka-rhyme.service
```

Проверьте `sudo -u stroka sudo -n /usr/bin/systemctl restart stroka-rhyme.service`. Не выдавайте этому пользователю неограниченный sudo.

Добавьте лимит запросов в HTTP-контекст Nginx и установите конфигурацию сайта:

```sh
echo 'limit_req_zone $binary_remote_addr zone=stroka_api:10m rate=1r/s;' | sudo tee /etc/nginx/conf.d/stroka-limit.conf
sudo cp /srv/stroka/site/deploy/nginx.conf /etc/nginx/sites-available/stroka
sudo nano /etc/nginx/sites-available/stroka  # замените example.com на ваш домен
sudo ln -s /etc/nginx/sites-available/stroka /etc/nginx/sites-enabled/stroka
sudo nginx -t && sudo systemctl reload nginx
```

Если уже есть активный конфиг `default`, убедитесь, что он не перехватывает ваш домен; при необходимости отключите его. Направьте DNS домена на сервер, откройте TCP 80 и 443 и настройте HTTPS, например через Certbot (`sudo certbot --nginx -d example.com` после установки Certbot). Проверьте `https://ВАШ-ДОМЕН/api/health` и сам сайт.

Ограничение запросов не заменяет авторизацию: если сервис доступен через публичный сайт, его API тоже доступен посетителям. Для публичного использования добавьте аутентификацию/защиту от злоупотреблений на уровне приложения или инфраструктуры. Редактор сейчас не реализует авторизацию API.

## 4. SSH-ключ для GitHub Actions

На доверенном компьютере создайте отдельный ключ **только для деплоя**, например:

```sh
ssh-keygen -t ed25519 -C 'stroka-github-deploy' -f ./stroka-deploy-key -N ''
```

Добавьте содержимое `stroka-deploy-key.pub` в `/home/stroka/.ssh/authorized_keys` на сервере. Каталог `.ssh` должен принадлежать `stroka` и иметь права 700, файл `authorized_keys` — 600. Защитите приватный ключ и никогда не коммитьте его. Проверьте вход: `ssh -i ./stroka-deploy-key stroka@ВАШ_СЕРВЕР`.

Получите строку host key сервера в формате OpenSSH known_hosts и **сверьте её отпечаток с полученным через доверенный канал**. Например, после проверки отпечатка можно использовать вывод `ssh-keyscan -H ВАШ_СЕРВЕР`; не доверяйте непроверенному выводу `ssh-keyscan` автоматически.

В **каждом** GitHub-репозитории добавьте через Settings → Secrets and variables → Actions четыре repository secret:

- `DEPLOY_SSH_PRIVATE_KEY` — полное содержимое приватного файла `stroka-deploy-key`.
- `DEPLOY_SSH_KNOWN_HOSTS` — проверенная строка known_hosts для точного имени сервера, указанного ниже.
- `DEPLOY_HOST` — домен или IP сервера без `https://` и без порта (шаблон использует стандартный SSH-порт 22).
- `DEPLOY_USER` — `stroka`.

Не используйте пароль или приватный ключ GitHub для входа на сервер. Убедитесь, что Actions разрешены в настройках обоих репозиториев. Рабочие процессы лежат в `.github/workflows/deploy.yml`, запускаются при push в `main`, также доступны вручную через Actions → Run workflow. Ограничьте возможность пушить в `main`: любой такой push приводит к выполнению кода на сервере от имени пользователя `stroka`. Для критичных систем используйте защищённые ветки, environment approvals и отдельные ключи для двух репозиториев.

## 5. Проверка и ограничения

После настройки сделайте безопасное изменение и отправьте push в каждый репозиторий. Проверьте журналы соответствующего workflow в GitHub, состояние `systemctl status stroka-rhyme`, журналы `journalctl -u stroka-rhyme -n 100`, `/api/health` и работу кнопки анализа рифм на сайте.

Деплой использует `git pull --ff-only`: незакоммиченные серверные изменения или расходящаяся история остановят обновление. Не редактируйте файлы прямо в клоне на сервере. Сборка сайта выполняется в существующей директории `dist`, поэтому во время сборки возможна краткая недоступность ассетов; атомарных релизов и автоматического отката этот шаблон не обеспечивает. При ошибке Python-зависимостей файлы сервиса уже могут быть обновлены, но запуск новой версии не будет выполнен до успешного прохождения тестов. Перед эксплуатацией настройте резервные копии, мониторинг и отдельную стратегию безопасного отката.

Пользовательские стихи по умолчанию остаются в браузере, а не на вашем сервере; при анализе выбранные слова передаются вашему серверу анализа. Для Google Drive OAuth добавьте HTTPS-источник вашего домена в настройках Google Cloud.
